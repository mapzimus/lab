(function () {
  const showDrafts = new URLSearchParams(location.search).has("drafts");
  const notesEl = document.getElementById("notes");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  fetch("/data/field-notes.json").then((r) => r.json()).then((posts) => {
    const visible = posts
      .filter((p) => showDrafts || p.status !== "draft")
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!visible.length) {
      document.getElementById("notesEmpty").textContent = "No notes yet — the first one is coming.";
      return;
    }
    notesEl.innerHTML = visible.map((p) => `
      <article class="note${p.status === "draft" ? " draft" : ""}" id="${esc(p.slug)}">
        <div class="note-date">${esc(p.date)}${p.status === "draft" ? " · DRAFT" : ""}</div>
        <h2>${esc(p.title)}</h2>
        ${(p.body || []).map((para) => `<p>${esc(para)}</p>`).join("")}
        <div class="tags">${(p.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
      </article>`).join("");
  }).catch(() => {
    document.getElementById("notesEmpty").textContent = "Notes could not be loaded.";
  });
})();
