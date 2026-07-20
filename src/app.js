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
  // Keep in sync with the same tables in scripts/build.mjs, which pre-renders
  // the browse shelves so the catalog works without JavaScript.
  const viewCategories = {
    home: null,
    tools: ["data", "design", "teaching", "math", "fun"],
    maps: ["maps"],
    games: ["play"],
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
  const browse = document.getElementById("browse");
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
    if (view === "lab") return item.source === "projects" || (item.status || "live") !== "live";
    if (view === "tools" && item.source !== "tools") return false;
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

  // Browse mode = the pre-rendered shelves (or home section cards). Results
  // mode = a flat grid, shown once the visitor searches, filters, or opens
  // favorites. This keeps the default page calm and only fans out on demand.
  function resultsActive() {
    return state.query !== "" || state.category !== "" || state.favoritesOnly;
  }

  function render() {
    const results = resultsActive();
    if (browse) browse.hidden = results;
    catalogGrid.hidden = !results;
    if (!results) {
      resultCount.textContent = "";
      emptyState.hidden = true;
      return;
    }
    const items = filteredItems();
    catalogGrid.innerHTML = items.map(function (item) { return card(item, false); }).join("");
    resultCount.textContent = `${items.length} ${items.length === 1 ? "result" : "results"}`;
    emptyState.hidden = items.length !== 0;
  }

  // Reflect saved favorites on the server-rendered stars without re-rendering.
  function syncStars() {
    document.querySelectorAll("[data-slug] > .star").forEach(function (star) {
      const slug = star.closest("[data-slug]").dataset.slug;
      const on = state.favorites.has(slug);
      star.setAttribute("aria-pressed", String(on));
      star.setAttribute("aria-label", (on ? "Remove from" : "Add to") + " favorites");
      star.textContent = on ? "★" : "☆";
    });
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
      event.preventDefault();
      const slug = star.closest("[data-slug]").dataset.slug;
      if (state.favorites.has(slug)) state.favorites.delete(slug);
      else state.favorites.add(slug);
      saveFavorites();
      syncStars();
      if (resultsActive()) render();
      return;
    }

    const filter = event.target.closest(".filter");
    if (filter) {
      state.category = filter.dataset.category;
      filters.querySelectorAll(".filter").forEach(function (button) {
        button.setAttribute("aria-pressed", String(button === filter));
      });
      render();
    }
  });

  searchInput.addEventListener("input", function () {
    state.query = searchInput.value.trim();
    render();
  });

  searchInput.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && searchInput.value) {
      searchInput.value = "";
      state.query = "";
      render();
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
    render();
  });

  fetch("/data/catalog.json")
    .then(function (response) { return response.json(); })
    .then(function (items) {
      state.items = items;
      return fetch("/data/featured.json").then(function (r) { return r.json(); });
    })
    .then(function (featuredSlugs) {
      state.featuredSlugs = featuredSlugs;
      renderFeatured();
      syncStars();
      // A single-category page (e.g. /tools/data/) starts already filtered.
      if (resultsActive()) render();
    })
    .catch(function () {
      // The pre-rendered shelves are still on the page; only live search is lost.
      if (resultCount) resultCount.textContent = "Search is unavailable right now";
    });
})();
