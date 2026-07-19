/* Published notes are pre-rendered at build time. This script only handles the
   ?drafts preview, re-rendering the list with drafts included. */
(function () {
  if (!new URLSearchParams(location.search).has("drafts")) return;
  const notesEl = document.getElementById("notes");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  fetch("/data/field-notes.json").then((r) => r.json()).then((posts) => {
    const visible = posts.sort((a, b) => (a.date < b.date ? 1 : -1));
    notesEl.innerHTML = visible.map((p) => `
      <article class="note${p.status === "draft" ? " draft" : ""}" id="${esc(p.slug)}">
        <div class="note-meta"><time datetime="${esc(p.date)}">${esc(p.date)}</time>${p.status === "draft" ? "<span>· DRAFT</span>" : ""}${(p.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
        <h2>${esc(p.title)}</h2>
        ${(p.body || []).map((para) => `<p>${esc(para)}</p>`).join("")}
      </article>`).join("");
  }).catch(() => {
    /* The pre-rendered published notes are already on the page. */
  });
})();
