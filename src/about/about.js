(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  Promise.all([
    fetch("/data/tools.json").then((r) => r.json()),
    fetch("/data/projects.json").then((r) => r.json()),
    fetch("/data/featured.json").then((r) => r.json()),
  ]).then(([tools, projects, featured]) => {
    const all = [...tools, ...projects];
    const picks = featured.map((slug) => all.find((i) => i.slug === slug)).filter(Boolean);
    document.getElementById("miniGrid").innerHTML = picks.map((item) => `
      <article class="featured-card">
        <a class="card-link" href="${esc(item.url)}" target="_blank" rel="noopener">
          <div class="card-icon" aria-hidden="true">${esc(item.icon || "↗")}</div>
          <div class="card-type">${esc(item.category)}</div>
          <h3>${esc(item.title)}</h3>
          <p class="card-copy">${esc(item.description)}</p>
          <div class="card-footer"><span class="status">${esc(item.status || "live")}</span><span>Open ↗</span></div>
        </a>
      </article>`).join("");
  });
})();
