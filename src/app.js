(function () {
  "use strict";

  const view = document.body.dataset.view || "home";
  const categoryLabels = {
    maps: "Maps & GIS",
    data: "Data & text",
    design: "Design & media",
    teaching: "Teaching",
    math: "Math",
    fun: "Useful fun",
    play: "Games",
    experiments: "Experiments",
  };
  const viewCategories = {
    maps: ["maps"],
    data: ["data"],
    design: ["design"],
    teaching: ["teaching"],
    math: ["math"],
    play: ["fun", "play"],
    experiments: ["experiments"],
  };
  const shelves = [
    {
      title: "Maps & place",
      description: "Coordinates, GeoJSON, weather, projections, and maps with opinions.",
      href: "/maps/",
      categories: ["maps"],
    },
    {
      title: "Data & text",
      description: "Inspect, convert, chart, generate, and anonymize common file formats.",
      href: "/data/",
      categories: ["data"],
    },
    {
      title: "Design & media",
      description: "Color, images, flags, patterns, sprites, sound, and small exports.",
      href: "/design/",
      categories: ["design"],
    },
    {
      title: "Teaching & math",
      description: "Classroom helpers, visual models, practice, and calculators.",
      href: "/teaching/",
      secondaryHref: "/math/",
      categories: ["teaching", "math"],
    },
    {
      title: "Games & useful fun",
      description: "Physics, strategy, soccer, brackets, travel, and arbitrary decisions.",
      href: "/play/",
      categories: ["fun", "play"],
    },
    {
      title: "Experiments",
      description: "Spherical geometry, alternate histories, and larger working demos.",
      href: "/experiments/",
      categories: ["experiments"],
    },
  ];

  const state = {
    items: [],
    featuredSlugs: [],
    query: "",
    category: "",
    expanded: view !== "home",
  };

  const featuredSection = document.getElementById("featuredSection");
  const featuredGrid = document.getElementById("featuredGrid");
  const shelfGrid = document.getElementById("shelfGrid");
  const catalogGrid = document.getElementById("catalogGrid");
  const resultCount = document.getElementById("resultCount");
  const emptyState = document.getElementById("emptyState");
  const searchInput = document.getElementById("searchInput");
  const categorySelect = document.getElementById("categorySelect");
  const showAllButton = document.getElementById("showAllButton");
  const randomButton = document.getElementById("randomButton");

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>\"]/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character];
    });
  }

  function isExternal(url) {
    try {
      return new URL(url, window.location.origin).origin !== window.location.origin;
    } catch {
      return false;
    }
  }

  function linkAttributes(item) {
    return isExternal(item.url) ? ' target="_blank" rel="noopener"' : "";
  }

  function allowedByView(item) {
    if (view === "tools") return item.collection === "tool";
    const allowed = viewCategories[view];
    return !allowed || allowed.includes(item.category);
  }

  function filteredItems() {
    const query = state.query.toLowerCase();
    return state.items.filter(function (item) {
      if (!allowedByView(item)) return false;
      if (state.category && item.category !== state.category) return false;
      if (!query) return true;
      const haystack = [item.title, item.description, categoryLabels[item.category], ...(item.tags || [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  function featuredCard(item, index) {
    const kind = item.collection === "project" ? "Project" : categoryLabels[item.category] || item.category;
    return `<article class="featured-card featured-card-${index + 1}">
      <a href="${escapeHtml(item.url)}"${linkAttributes(item)}>
        <div class="feature-topline"><span>${String(index + 1).padStart(2, "0")}</span><span>${escapeHtml(kind)}</span></div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.description)}</p>
        <div class="feature-foot"><span>${isExternal(item.url) ? "Open project" : "Runs here"}</span><span aria-hidden="true">↗</span></div>
      </a>
    </article>`;
  }

  function catalogRow(item) {
    const index = state.items.indexOf(item) + 1;
    const kind = categoryLabels[item.category] || item.category;
    return `<article class="catalog-row">
      <a href="${escapeHtml(item.url)}"${linkAttributes(item)}>
        <span class="row-number">${String(index).padStart(2, "0")}</span>
        <span class="row-copy">
          <span class="row-category">${escapeHtml(kind)}</span>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.description)}</p>
        </span>
        <span class="row-arrow" aria-hidden="true">↗</span>
      </a>
    </article>`;
  }

  function renderFeatured() {
    if (view !== "home") {
      featuredSection.hidden = true;
      return;
    }
    const featured = state.featuredSlugs
      .map(function (slug) { return state.items.find(function (item) { return item.slug === slug; }); })
      .filter(Boolean)
      .slice(0, 6);
    featuredGrid.innerHTML = featured.map(featuredCard).join("");
  }

  function renderShelves() {
    if (!shelfGrid) return;
    shelfGrid.innerHTML = shelves.map(function (shelf, index) {
      const count = state.items.filter(function (item) { return shelf.categories.includes(item.category); }).length;
      const extra = shelf.secondaryHref
        ? `<a class="shelf-secondary" href="${shelf.secondaryHref}">Math index ↗</a>`
        : "";
      return `<article class="shelf">
        <a class="shelf-main" href="${shelf.href}">
          <span class="shelf-number">0${index + 1}</span>
          <h3>${escapeHtml(shelf.title)}</h3>
          <p>${escapeHtml(shelf.description)}</p>
          <span class="shelf-count">${count} ${count === 1 ? "thing" : "things"} <span aria-hidden="true">→</span></span>
        </a>
        ${extra}
      </article>`;
    }).join("");
  }

  function renderCategorySelect() {
    const categories = [...new Set(state.items.filter(allowedByView).map(function (item) { return item.category; }))];
    categorySelect.innerHTML = ['<option value="">All sections</option>']
      .concat(categories.map(function (category) {
        return `<option value="${escapeHtml(category)}">${escapeHtml(categoryLabels[category] || category)}</option>`;
      }))
      .join("");
  }

  function renderCatalog() {
    const items = filteredItems();
    const shortened = view === "home" && !state.expanded && !state.query && !state.category;
    const visibleItems = shortened ? items.slice(0, 12) : items;
    catalogGrid.innerHTML = visibleItems.map(catalogRow).join("");
    resultCount.textContent = shortened ? `${visibleItems.length} of ${items.length}` : `${items.length} ${items.length === 1 ? "result" : "results"}`;
    emptyState.hidden = items.length !== 0;
    showAllButton.hidden = !shortened;
  }

  function openRandomItem() {
    const candidates = filteredItems();
    if (!candidates.length) return;
    const item = candidates[Math.floor(Math.random() * candidates.length)];
    window.location.assign(item.url);
  }

  searchInput.addEventListener("input", function () {
    state.query = searchInput.value.trim();
    renderCatalog();
  });

  categorySelect.addEventListener("change", function () {
    state.category = categorySelect.value;
    renderCatalog();
  });

  showAllButton.addEventListener("click", function () {
    state.expanded = true;
    renderCatalog();
  });

  randomButton.addEventListener("click", openRandomItem);

  Promise.all([
    fetch("/data/catalog.json").then(function (response) {
      if (!response.ok) throw new Error("Catalog request failed");
      return response.json();
    }),
    fetch("/data/featured.json").then(function (response) {
      if (!response.ok) throw new Error("Featured request failed");
      return response.json();
    }),
  ]).then(function (collections) {
    state.items = collections[0];
    state.featuredSlugs = collections[1];
    renderCategorySelect();
    renderFeatured();
    renderShelves();
    renderCatalog();
    document.querySelectorAll(".site-header nav a").forEach(function (link) {
      if (link.pathname === window.location.pathname) link.setAttribute("aria-current", "page");
    });
  }).catch(function () {
    resultCount.textContent = "Index unavailable";
    emptyState.hidden = false;
    emptyState.textContent = "The index could not be loaded. Direct tool URLs still work.";
  });
})();
