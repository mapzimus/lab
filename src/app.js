(function () {
  "use strict";

  const view = document.body.dataset.view || "home";
  const categoryLabels = {
    maps: "Maps & GIS",
    data: "Data",
    design: "Design & Media",
    teaching: "Teaching",
    math: "Math",
    fun: "Fun & Learning",
    play: "Games",
    experiments: "Experiments",
  };
  // Keep in sync with the same table in scripts/build.mjs, which pre-renders
  // the initial grids so the catalog works without JavaScript.
  const viewCategories = {
    home: null,
    lab: ["experiments"],
    tools: ["maps", "data", "design", "teaching", "math", "fun"],
    maps: ["maps"],
    games: ["fun", "play"],
  };

  function readFavorites() {
    try {
      const stored = JSON.parse(localStorage.getItem("mapzimus-favorites") || "[]");
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  }

  const state = {
    items: [],
    featuredSlugs: [],
    query: "",
    category: document.body.dataset.category || "",
    favoritesOnly: false,
    favorites: new Set(readFavorites()),
  };

  const featuredSection = document.getElementById("featuredSection");
  const featuredGrid = document.getElementById("featuredGrid");
  const catalogGrid = document.getElementById("catalogGrid");
  const filters = document.getElementById("filters");
  const resultCount = document.getElementById("resultCount");
  const emptyState = document.getElementById("emptyState");
  const searchInput = document.getElementById("searchInput");
  const favoritesButton = document.getElementById("favoritesButton");

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>\"]/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character];
    });
  }

  function saveFavorites() {
    try {
      localStorage.setItem("mapzimus-favorites", JSON.stringify([...state.favorites]));
    } catch {
      // Storage may be full or blocked (private browsing); favorites still work for this visit.
    }
  }

  // Keep in sync with card() in scripts/build.mjs.
  function card(item, featured) {
    const tags = (item.tags || []).slice(0, 3).map(function (tag) {
      return `<span class="tag">${escapeHtml(tag)}</span>`;
    }).join("");
    const favorite = state.favorites.has(item.slug);
    const status = item.status || "live";
    return `<article class="card${featured ? " featured" : ""}" data-slug="${escapeHtml(item.slug)}" data-category="${escapeHtml(item.category)}">
      <button class="star" type="button" aria-label="${favorite ? "Remove from" : "Add to"} favorites" aria-pressed="${favorite}">${favorite ? "★" : "☆"}</button>
      <a class="card-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">
        <div class="card-meta"><span class="cat-tick" aria-hidden="true"></span><span class="card-type">${escapeHtml(categoryLabels[item.category] || item.category)}</span><span class="card-icon" aria-hidden="true">${escapeHtml(item.icon || "")}</span></div>
        <h3>${escapeHtml(item.title)}</h3>
        <p class="card-copy">${escapeHtml(item.description)}</p>
        ${featured ? "" : `<div class="card-tags">${tags}</div>`}
        <div class="card-foot">${status === "live" ? "<span></span>" : `<span class="status">${escapeHtml(status)}</span>`}<span class="open-cue">Open ↗</span></div>
      </a>
    </article>`;
  }

  function allowedByView(item) {
    if (view === "lab" && (item.status || "live") !== "live") return true;
    const allowed = viewCategories[view];
    return !allowed || allowed.includes(item.category);
  }

  function filteredItems() {
    const query = state.query.toLowerCase();
    return state.items.filter(function (item) {
      if (!allowedByView(item)) return false;
      if (state.category && item.category !== state.category) return false;
      if (state.favoritesOnly && !state.favorites.has(item.slug)) return false;
      if (!query) return true;
      const haystack = [item.title, item.description, item.category, ...(item.tags || [])].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }

  function renderCatalog() {
    const items = filteredItems();
    catalogGrid.innerHTML = items.map(function (item) { return card(item, false); }).join("");
    resultCount.textContent = `${items.length} ${items.length === 1 ? "item" : "items"}`;
    emptyState.hidden = items.length !== 0;
  }

  function renderFilters() {
    const categories = [...new Set(state.items.filter(allowedByView).map(function (item) { return item.category; }))];
    if (categories.length < 2) {
      filters.innerHTML = "";
      return;
    }
    filters.innerHTML = [`<button class="filter" type="button" data-category="" aria-pressed="${state.category === ""}">All</button>`]
      .concat(categories.map(function (category) {
        return `<button class="filter" type="button" data-category="${escapeHtml(category)}" aria-pressed="${state.category === category}">${escapeHtml(categoryLabels[category] || category)}</button>`;
      })).join("");
  }

  function renderFeatured() {
    if (!featuredSection || featuredSection.hidden) return;
    const featured = state.featuredSlugs.map(function (slug) {
      return state.items.find(function (item) { return item.slug === slug; });
    }).filter(Boolean);
    featuredGrid.innerHTML = featured.map(function (item) { return card(item, true); }).join("");
  }

  document.addEventListener("click", function (event) {
    const star = event.target.closest(".star");
    if (star) {
      const slug = star.closest("[data-slug]").dataset.slug;
      if (state.favorites.has(slug)) state.favorites.delete(slug);
      else state.favorites.add(slug);
      saveFavorites();
      renderFeatured();
      renderCatalog();
      return;
    }

    const filter = event.target.closest(".filter");
    if (filter) {
      state.category = filter.dataset.category;
      filters.querySelectorAll(".filter").forEach(function (button) {
        button.setAttribute("aria-pressed", String(button === filter));
      });
      renderCatalog();
    }
  });

  searchInput.addEventListener("input", function () {
    state.query = searchInput.value.trim();
    renderCatalog();
  });

  searchInput.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && searchInput.value) {
      searchInput.value = "";
      state.query = "";
      renderCatalog();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "/" || event.target.closest("input, textarea, select")) return;
    event.preventDefault();
    searchInput.focus();
  });

  favoritesButton.addEventListener("click", function () {
    state.favoritesOnly = !state.favoritesOnly;
    favoritesButton.setAttribute("aria-pressed", String(state.favoritesOnly));
    renderCatalog();
  });

  Promise.all([
    fetch("/data/tools.json").then(function (response) { return response.json(); }),
    fetch("/data/projects.json").then(function (response) { return response.json(); }),
    fetch("/data/featured.json").then(function (response) { return response.json(); }),
  ]).then(function (collections) {
    state.featuredSlugs = collections.pop();
    state.items = collections.flat();
    renderFilters();
    renderFeatured();
    renderCatalog();
  }).catch(function () {
    // The pre-rendered cards are still on the page; only live search/filtering is lost.
    resultCount.textContent = "Search is unavailable right now";
  });
})();
