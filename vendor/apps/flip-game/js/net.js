// net.js — online multiplayer rooms + hybrid lockstep protocol.
//
// Transport (school-network friendly: WebSocket, not WebRTC):
//   1. MQTT over WSS to the public EMQX broker (works on GitHub Pages today)
//   2. Optional custom relay via ?relay=wss://… or localStorage.flipgameRelay
//   3. BroadcastChannel fallback for same-browser tab testing (?net=local)
//
// Protocol (Approach B — hybrid lockstep):
//   hello / welcome / join / leave / roster
//   start          — host begins a match with the player list
//   flick          — {vx,vy,seed,playerId}  — all clients replay the flick
//   result         — {result,info,playerId} — flicker's device is authoritative
//   chat/ping      — keepalive
//
// The flicking player's device owns MAKE/MISS. Everyone else replays for
// visuals and accepts the authority result if their local sim disagrees.

const Net = (() => {
  const MQTT_URL = 'wss://broker.emqx.io:8084/mqtt';
  const TOPIC_ROOT = 'flipgame/v1';

  let socket = null;
  let mode = null;          // 'mqtt' | 'relay' | 'local'
  let roomCode = null;
  let selfId = null;
  let selfName = null;
  let isHost = false;
  let roster = [];          // [{id,name,color,skin,flavor,ready}]
  let handlers = {};
  let bc = null;
  let mqttTopic = null;
  let connected = false;
  let reconnectTimer = null;
  let packetId = 1;
  let pingTimer = null;

  function on(evt, fn) {
    (handlers[evt] || (handlers[evt] = [])).push(fn);
  }
  function emit(evt, data) {
    for (const fn of handlers[evt] || []) {
      try { fn(data); } catch (e) { console.error('Net handler', evt, e); }
    }
  }

  function codeGen() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    return s;
  }

  function uid() {
    return 'p_' + Math.random().toString(36).slice(2, 10);
  }

  function relayUrl() {
    try {
      const q = new URLSearchParams(location.search).get('relay');
      if (q) return q;
    } catch (_) {}
    try { return localStorage.getItem('flipgameRelay') || ''; } catch (_) { return ''; }
  }

  function wantLocal() {
    try { return new URLSearchParams(location.search).get('net') === 'local'; }
    catch (_) { return false; }
  }

  // ── Minimal MQTT 3.1.1 client (connect / subscribe / publish) ──────────────
  function encodeRemainingLength(n) {
    const bytes = [];
    do {
      let d = n % 128;
      n = Math.floor(n / 128);
      if (n > 0) d |= 0x80;
      bytes.push(d);
    } while (n > 0);
    return bytes;
  }

  function mqttConnectPacket(clientId) {
    const proto = [0, 4, 77, 81, 84, 84, 4]; // "MQTT" lvl 4
    const flags = 2; // clean session
    const keepAlive = [0, 30];
    const idBytes = new TextEncoder().encode(clientId);
    const idLen = [(idBytes.length >> 8) & 255, idBytes.length & 255];
    const vh = [...proto, flags, ...keepAlive, ...idLen, ...idBytes];
    const rl = encodeRemainingLength(vh.length);
    return new Uint8Array([0x10, ...rl, ...vh]);
  }

  function mqttSubscribePacket(topic) {
    const tid = [(packetId >> 8) & 255, packetId & 255];
    packetId = (packetId + 1) & 0xffff || 1;
    const t = new TextEncoder().encode(topic);
    const payload = [...tid, (t.length >> 8) & 255, t.length & 255, ...t, 0];
    const rl = encodeRemainingLength(payload.length);
    return new Uint8Array([0x82, ...rl, ...payload]);
  }

  function mqttPublishPacket(topic, message) {
    const t = new TextEncoder().encode(topic);
    const m = new TextEncoder().encode(message);
    const payload = [(t.length >> 8) & 255, t.length & 255, ...t, ...m];
    const rl = encodeRemainingLength(payload.length);
    return new Uint8Array([0x30, ...rl, ...payload]);
  }

  // MQTT PINGREQ — keepAlive is advertised as 30s in CONNECT; send sooner.
  function mqttPingPacket() {
    return new Uint8Array([0xC0, 0x00]);
  }

  function startMqttPing() {
    stopMqttPing();
    pingTimer = setInterval(() => {
      if (mode !== 'mqtt' || !socket || socket.readyState !== 1) return;
      try { socket.send(mqttPingPacket()); } catch (_) {}
    }, 20000);
  }

  function stopMqttPing() {
    clearInterval(pingTimer);
    pingTimer = null;
  }

  function mqttParse(buf) {
    const view = new Uint8Array(buf);
    if (!view.length) return null;
    const type = view[0] >> 4;
    let mul = 1, len = 0, i = 1;
    for (;;) {
      if (i >= view.length) return null;
      const d = view[i++];
      len += (d & 127) * mul;
      mul *= 128;
      if (!(d & 128)) break;
    }
    const payload = view.subarray(i, i + len);
    if (type === 2) return { type: 'connack' };
    if (type === 3) {
      const tlen = (payload[0] << 8) | payload[1];
      const topic = new TextDecoder().decode(payload.subarray(2, 2 + tlen));
      const msg = new TextDecoder().decode(payload.subarray(2 + tlen));
      return { type: 'publish', topic, msg };
    }
    if (type === 9) return { type: 'suback' };
    if (type === 13) return { type: 'pingresp' };
    return { type: 'other', mqttType: type };
  }

  // ── Transports ─────────────────────────────────────────────────────────────
  function sendRaw(obj) {
    if (!connected) return;
    const msg = JSON.stringify({ ...obj, room: roomCode, from: selfId, t: Date.now() });
    if (mode === 'local' && bc) {
      bc.postMessage(msg);
      return;
    }
    if (mode === 'mqtt' && socket && socket.readyState === 1) {
      socket.send(mqttPublishPacket(mqttTopic, msg));
      return;
    }
    if (mode === 'relay' && socket && socket.readyState === 1) {
      socket.send(msg);
    }
  }

  function handleMessage(raw) {
    let msg;
    try { msg = typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch (_) { return; }
    if (!msg || msg.from === selfId) return;
    if (msg.room && roomCode && msg.room !== roomCode) return;

    switch (msg.type) {
      case 'hello':
        // Existing peers answer a joiner with welcome + current roster snapshot.
        if (isHost || roster.length) {
          const self = roster.find(p => p.id === selfId) || {};
          sendRaw({
            type: 'welcome',
            roster,
            hostId: roster.find(p => p.host)?.id || selfId,
            selfColor: self.color,
            selfSkin: self.skin,
            selfFlavor: self.flavor,
          });
        }
        // Add joiner locally
        upsertPeer({
          id: msg.from,
          name: msg.name,
          color: msg.color,
          skin: msg.skin,
          flavor: msg.flavor,
          host: false,
        });
        emit('roster', roster.slice());
        break;
      case 'welcome':
        if (Array.isArray(msg.roster)) {
          roster = msg.roster.map(p => ({ ...p }));
          // Ensure we are present — don't clobber with undefined self* fields.
          const patch = { id: selfId, name: selfName, host: isHost };
          if (msg.selfColor != null) patch.color = msg.selfColor;
          if (msg.selfSkin != null) patch.skin = msg.selfSkin;
          if (msg.selfFlavor != null) patch.flavor = msg.selfFlavor;
          upsertPeer(patch);
          emit('roster', roster.slice());
        }
        emit('welcome', msg);
        break;
      case 'join':
        upsertPeer(msg.player);
        emit('roster', roster.slice());
        emit('join', msg.player);
        break;
      case 'leave':
        roster = roster.filter(p => p.id !== msg.from);
        emit('roster', roster.slice());
        emit('leave', msg.from);
        break;
      case 'start':
        emit('start', msg);
        break;
      case 'flick':
        emit('flick', msg);
        break;
      case 'result':
        emit('result', msg);
        break;
      case 'ping':
        sendRaw({ type: 'pong' });
        break;
      default:
        emit('message', msg);
    }
  }

  function upsertPeer(p) {
    if (!p || !p.id) return;
    const i = roster.findIndex(x => x.id === p.id);
    if (i >= 0) roster[i] = { ...roster[i], ...p };
    else roster.push({ ...p });
  }

  function connectSocket(url, asMqtt) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      const timer = setTimeout(() => {
        if (!settled) { settled = true; try { ws.close(); } catch (_) {} reject(new Error('connect timeout')); }
      }, 8000);
      ws.onopen = () => {
        if (asMqtt) {
          ws.send(mqttConnectPacket(selfId));
        } else {
          clearTimeout(timer);
          settled = true;
          resolve(ws);
        }
      };
      ws.onmessage = (ev) => {
        if (asMqtt) {
          const parsed = mqttParse(ev.data);
          if (!parsed) return;
          if (parsed.type === 'connack') {
            ws.send(mqttSubscribePacket(mqttTopic));
            startMqttPing();
            if (!settled) { clearTimeout(timer); settled = true; resolve(ws); }
            return;
          }
          if (parsed.type === 'pingresp') return;
          if (parsed.type === 'publish') handleMessage(parsed.msg);
          return;
        }
        handleMessage(ev.data);
      };
      ws.onerror = () => {
        if (!settled) { clearTimeout(timer); settled = true; reject(new Error('ws error')); }
      };
      ws.onclose = () => {
        connected = false;
        emit('disconnected');
        if (roomCode) scheduleReconnect(url, asMqtt);
      };
    });
  }

  function scheduleReconnect(url, asMqtt) {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(async () => {
      if (!roomCode) return;
      try {
        socket = await connectSocket(url, asMqtt);
        connected = true;
        emit('reconnected');
        sendRaw({
          type: 'hello',
          name: selfName,
          color: (roster.find(p => p.id === selfId) || {}).color,
          skin: (roster.find(p => p.id === selfId) || {}).skin,
          flavor: (roster.find(p => p.id === selfId) || {}).flavor,
        });
      } catch (_) {
        scheduleReconnect(url, asMqtt);
      }
    }, 1500);
  }

  async function openTransport() {
    if (wantLocal() || typeof WebSocket === 'undefined') {
      mode = 'local';
      bc = new BroadcastChannel('flipgame-net');
      bc.onmessage = (ev) => handleMessage(ev.data);
      connected = true;
      return;
    }
    const custom = relayUrl();
    if (custom) {
      mode = 'relay';
      socket = await connectSocket(custom, false);
      connected = true;
      return;
    }
    mode = 'mqtt';
    mqttTopic = `${TOPIC_ROOT}/${roomCode}`;
    socket = await connectSocket(MQTT_URL, true);
    connected = true;
  }

  async function createRoom(player) {
    await leave();
    selfId = uid();
    selfName = player.name || 'Host';
    isHost = true;
    roomCode = codeGen();
    roster = [{
      id: selfId,
      name: selfName,
      color: player.color,
      skin: player.skin || 'bottle',
      flavor: player.flavor || 0,
      host: true,
      ready: true,
    }];
    await openTransport();
    emit('roster', roster.slice());
    emit('connected', { roomCode, selfId, isHost });
    return { roomCode, selfId };
  }

  async function joinRoom(code, player) {
    await leave();
    selfId = uid();
    selfName = player.name || 'Player';
    isHost = false;
    roomCode = String(code || '').trim().toUpperCase();
    if (roomCode.length < 3) throw new Error('Enter a room code');
    roster = [{
      id: selfId,
      name: selfName,
      color: player.color,
      skin: player.skin || 'bottle',
      flavor: player.flavor || 0,
      host: false,
      ready: true,
    }];
    await openTransport();
    sendRaw({
      type: 'hello',
      name: selfName,
      color: player.color,
      skin: player.skin || 'bottle',
      flavor: player.flavor || 0,
    });
    sendRaw({
      type: 'join',
      player: roster[0],
    });
    emit('roster', roster.slice());
    emit('connected', { roomCode, selfId, isHost });
    return { roomCode, selfId };
  }

  function startMatch(payload) {
    if (!isHost) return;
    sendRaw({ type: 'start', ...payload });
  }

  function sendFlick(payload) {
    sendRaw({ type: 'flick', ...payload });
  }

  function sendResult(payload) {
    sendRaw({ type: 'result', ...payload });
  }

  async function leave() {
    clearTimeout(reconnectTimer);
    stopMqttPing();
    if (connected && roomCode) {
      try { sendRaw({ type: 'leave' }); } catch (_) {}
    }
    connected = false;
    roomCode = null;
    isHost = false;
    roster = [];
    if (bc) { try { bc.close(); } catch (_) {} bc = null; }
    if (socket) { try { socket.onclose = null; socket.close(); } catch (_) {} socket = null; }
    mode = null;
  }

  return {
    on, createRoom, joinRoom, leave, startMatch, sendFlick, sendResult,
    get roomCode() { return roomCode; },
    get selfId() { return selfId; },
    get isHost() { return isHost; },
    get roster() { return roster.slice(); },
    get connected() { return connected; },
    get transport() { return mode; },
  };
})();

// A top-level `const` lives in SCRIPT scope and never lands on `window`, but
// main.js gates the whole online UI on `window.Net` — without this the Online
// Multiplayer button silently does nothing. Same trap renderer.js and
// achievements.js already hit; publish explicitly.
if (typeof window !== 'undefined') window.Net = Net;
