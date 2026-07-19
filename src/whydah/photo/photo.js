/* Shared helpers for the /photo section.
 * Backend: Supabase (free tier). Uses plain fetch — no external JS libraries,
 * so nothing here depends on a CDN that school WiFi might block.
 */
const SB_URL = 'https://segzgdlqqymqlfuahosd.supabase.co';
const SB_KEY = 'sb_publishable_fBBZAVo-ljKvaBKNVMukmA_TopYb6D8';
const BUCKET = 'photos';

const sbHeaders = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };

/* ---------- Database (PostgREST) ---------- */
async function dbSelect(table, query) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${query || 'select=*'}`, { headers: sbHeaders });
  if (!r.ok) throw new Error(`Load failed (${r.status})`);
  return r.json();
}
async function dbInsert(table, row) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    const err = new Error(`Save failed (${r.status})`);
    err.status = r.status; err.body = body;
    throw err;
  }
  return (await r.json())[0];
}

/* ---------- Storage ---------- */
async function storageList(prefix) {
  const all = [];
  for (let offset = 0; ; offset += 100) {
    const r = await fetch(`${SB_URL}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: { ...sbHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!r.ok) throw new Error(`Photo list failed (${r.status})`);
    const page = await r.json();
    all.push(...page);
    if (page.length < 100) break;
  }
  return all;
}
function publicUrl(path) {
  return `${SB_URL}/storage/v1/object/public/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
async function storageUpload(path, blob) {
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Content-Type': blob.type || 'application/octet-stream' },
    body: blob,
  });
  if (!r.ok) throw new Error(`Upload failed (${r.status}) — ${(await r.text().catch(() => '')).slice(0, 200)}`);
}

/* ---------- Image shrink before upload (saves storage + upload time) ---------- */
const MAX_DIM = 2200, JPEG_Q = 0.87;
async function shrinkImage(file) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 3.5 * 1024 * 1024 && file.type === 'image/jpeg') { bmp.close(); return file; }
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', JPEG_Q));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // e.g. HEIC the browser can't decode — upload as-is
  }
}
function safeName(name) {
  const base = name.replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60) || 'photo';
  return base + '.jpg';
}
function uploadName(file, blob) {
  return blob === file ? file.name.replace(/[^a-zA-Z0-9._-]+/g, '_') : safeName(file.name);
}

/* ---------- Downloads (fetch → blob so the download attribute works cross-origin) ---------- */
async function downloadFile(path, filename) {
  const r = await fetch(publicUrl(path));
  if (!r.ok) throw new Error(`Download failed (${r.status})`);
  saveBlob(await r.blob(), filename || path.split('/').pop());
}
function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

/* ---------- Minimal ZIP writer (STORE method, no compression, no libraries) ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function makeZip(entries) { // entries: [{name, bytes: Uint8Array}]
  const chunks = [], central = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const e of entries) {
    const nameB = enc.encode(e.name), crc = crc32(e.bytes), sz = e.bytes.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true);
    local.setUint32(14, crc, true); local.setUint32(18, sz, true); local.setUint32(22, sz, true);
    local.setUint16(26, nameB.length, true);
    chunks.push(new Uint8Array(local.buffer), nameB, e.bytes);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, sz, true); cd.setUint32(24, sz, true);
    cd.setUint16(28, nameB.length, true); cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nameB);
    offset += 30 + nameB.length + sz;
  }
  let cdSize = 0;
  for (const c of central) cdSize += c.length;
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
async function downloadAllAsZip(paths, zipName, onProgress) {
  const entries = [];
  for (let i = 0; i < paths.length; i++) {
    if (onProgress) onProgress(i, paths.length);
    const r = await fetch(publicUrl(paths[i]));
    if (!r.ok) continue;
    entries.push({ name: paths[i].split('/').pop(), bytes: new Uint8Array(await r.arrayBuffer()) });
  }
  if (onProgress) onProgress(paths.length, paths.length);
  saveBlob(makeZip(entries), zipName);
}

/* ---------- Small UI helpers ---------- */
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'onclick') n.onclick = v;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v);
  }
  for (const k of kids) if (k) n.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  return n;
}
function openLightbox(url, caption) {
  const box = el('div', { class: 'lightbox' },
    el('img', { src: url, alt: caption || '' }),
    el('div', { class: 'muted', text: (caption || '') + ' — tap anywhere to close' }));
  box.onclick = () => box.remove();
  document.body.appendChild(box);
}
function isImage(name) { return /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(name); }
