(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  fetch("/data/links.json").then((r) => r.json()).then((groups) => {
    document.getElementById("links").innerHTML = groups.map((g) => `
      <div class="link-group">
        <h2>${esc(g.group)}</h2>
        ${g.links.filter((l) => l.url).map((l) => `
          <a class="link-row" href="${esc(l.url)}" rel="me noopener">
            <h3>${esc(l.title)}</h3>
            <p class="card-copy">${esc(l.note || "")}</p>
          </a>`).join("")}
      </div>`).join("");
  }).catch(() => {
    document.getElementById("linksEmpty").textContent = "Links could not be loaded.";
  });
})();
