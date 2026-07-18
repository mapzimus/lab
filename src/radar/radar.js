(async function () {
  const sectionsEl = document.getElementById("radarSections");
  const emptyEl = document.getElementById("radarEmpty");
  const dateEl = document.getElementById("radarDate");
  const countsEl = document.getElementById("radarCounts");

  let data;
  try {
    const res = await fetch("/data/radar.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.statusText);
    data = await res.json();
  } catch {
    emptyEl.textContent = "The radar data could not be loaded. Try again in a moment.";
    dateEl.textContent = "Unavailable";
    return;
  }

  const fmt = new Intl.NumberFormat("en-US");
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  function card(title, url, copy, metaBits, isNew) {
    const cardEl = el("article", "radar-card");
    if (isNew) cardEl.append(el("span", "radar-new", "NEW"));
    const link = el("a", "card-link");
    link.href = url;
    link.rel = "noopener";
    link.target = "_blank";
    const h = el("h4");
    h.textContent = title;
    link.append(h);
    if (copy) link.append(el("p", "card-copy", copy));
    link.append(el("div", "card-footer", metaBits.filter(Boolean).join(" · ")));
    cardEl.append(link);
    return cardEl;
  }

  const repoCard = (r) =>
    card(r.name, r.url, r.desc, [r.lang, `★ ${fmt.format(r.stars)}`], r.isNew);
  const hfCard = (h) =>
    card(h.id, h.url, h.pipeline || "", [`♥ ${fmt.format(h.likes)}`, h.downloads ? `${fmt.format(h.downloads)} downloads` : null], false);

  const gh = data.github || { relevant: [], general: [] };
  const hf = data.huggingface || { models: [], datasets: [], spaces: [], general: [] };

  const sections = [
    ["github", "GitHub — picked for the lab", "New and active repos matching the lab's interests.", gh.relevant.map(repoCard)],
    ["huggingface", "Hugging Face — models", "Trending models relevant to maps, vision, and small on-device work.", hf.models.map(hfCard)],
    ["huggingface", "Hugging Face — datasets", "Trending datasets worth a look.", hf.datasets.map(hfCard)],
    ["huggingface", "Hugging Face — spaces", "Trending demos and apps.", hf.spaces.map(hfCard)],
    ["github", "GitHub — trending everywhere", "The loudest brand-new repos regardless of topic.", gh.general.map(repoCard)],
    ["huggingface", "Hugging Face — trending everywhere", "The biggest general movers on the Hub.", hf.general.map(hfCard)],
  ];

  sectionsEl.textContent = "";
  let total = 0;
  for (const [source, title, subtitle, cards] of sections) {
    if (!cards.length) continue;
    total += cards.length;
    const section = el("section", "radar-section");
    section.dataset.source = source;
    section.append(el("h3", null, title), el("p", "radar-subtitle", subtitle));
    const grid = el("div", "radar-grid");
    grid.append(...cards);
    section.append(grid);
    sectionsEl.append(section);
  }

  if (!total) {
    sectionsEl.append(el("p", "empty", "Nothing on the radar yet — the first daily sweep hasn't landed."));
  }

  dateEl.textContent = `Swept ${data.generatedAt || "recently"}`;
  countsEl.textContent = `${total} items today`;
  countsEl.hidden = false;

  document.getElementById("radarFilters").addEventListener("click", (event) => {
    const button = event.target.closest(".filter");
    if (!button) return;
    for (const b of document.querySelectorAll("#radarFilters .filter")) {
      b.setAttribute("aria-pressed", String(b === button));
    }
    const source = button.dataset.source;
    for (const section of sectionsEl.querySelectorAll(".radar-section")) {
      section.hidden = source !== "all" && section.dataset.source !== source;
    }
  });
})();
