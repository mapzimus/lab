fetch("/data/radars.json").then((r) => r.json()).then((radars) => {
  document.getElementById("radarsGrid").innerHTML = radars.map((radar) => `
    <article class="featured-card">
      <a class="card-link" href="${radar.url}">
        <div class="card-icon" aria-hidden="true">${radar.icon || "📡"}</div>
        <div class="card-type">Daily tracker</div>
        <h3>${radar.title}</h3>
        <p class="card-copy">${radar.description}</p>
        <div class="card-footer"><span class="status">live</span><span>Open →</span></div>
      </a>
    </article>`).join("");
});
