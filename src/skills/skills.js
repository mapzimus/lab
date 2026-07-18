(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  fetch("/data/skills.json").then((r) => r.json()).then((skills) => {
    document.getElementById("skills").innerHTML = skills.map((s) => `
      <article class="skill-card">
        <div class="card-top">
          <div>
            <span class="tagline">${esc(s.tagline)}</span>
            <h2>${esc(s.title)}</h2>
          </div>
          <span class="meta">v${esc(s.version)} · ${esc(s.updated)} · ${esc(s.sizeKb)} KB</span>
        </div>
        <p>${esc(s.description)}</p>
        <ul>${s.teaches.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        <div class="skill-actions">
          <a class="download-button" href="${esc(s.file)}" download>Download ${esc(s.slug)}.skill</a>
          <a class="source-link" href="${esc(s.source)}">Read the source ↗</a>
        </div>
      </article>`).join("");
  }).catch(() => {
    document.getElementById("skillsEmpty").textContent = "Skills could not be loaded.";
  });
})();
