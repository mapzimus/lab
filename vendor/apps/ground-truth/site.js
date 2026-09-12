(function () {
  const navToggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelector(".projnav .links");

  if (navToggle && navLinks) {
    const closeNav = () => {
      navLinks.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    };

    navToggle.addEventListener("click", () => {
      const open = navLinks.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", String(open));
    });

    navLinks.addEventListener("click", event => {
      if (event.target.closest("a")) closeNav();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeNav();
    });
  }

  document.querySelectorAll(".tablewrap").forEach(wrapper => {
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "region");
    wrapper.setAttribute("aria-label", wrapper.dataset.label || "Scrollable data table");
    if (!wrapper.dataset.scrollHint) wrapper.dataset.scrollHint = "Swipe to see all columns →";
  });

  document.querySelectorAll(".swipe").forEach(box => {
    const stage = box.querySelector(".stage");
    const top = box.querySelector(".top");
    const bar = box.querySelector(".bar");
    const fullScreenButton = box.querySelector(".fsbtn");
    if (!stage || !top || !bar) return;
    let fraction = 0.5;
    let dragging = false;

    box.tabIndex = 0;
    box.setAttribute("role", "slider");
    box.setAttribute("aria-label", "Compare camera surface with LiDAR bare-earth surface");
    box.setAttribute("aria-valuemin", "2");
    box.setAttribute("aria-valuemax", "98");

    const apply = () => {
      const value = Math.round(fraction * 100);
      top.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
      bar.style.left = `${value}%`;
      box.setAttribute("aria-valuenow", String(value));
      box.setAttribute("aria-valuetext", `${value}% camera surface, ${100 - value}% LiDAR bare earth`);
    };

    const setFromPointer = event => {
      const bounds = stage.getBoundingClientRect();
      fraction = Math.max(0.02, Math.min(0.98, (event.clientX - bounds.left) / bounds.width));
      apply();
    };

    box.addEventListener("pointerdown", event => {
      if (event.target === fullScreenButton) return;
      dragging = true;
      box.setPointerCapture(event.pointerId);
      setFromPointer(event);
    });

    box.addEventListener("pointermove", event => {
      if (dragging) setFromPointer(event);
    });

    ["pointerup", "pointercancel"].forEach(name => {
      box.addEventListener(name, () => { dragging = false; });
    });

    box.addEventListener("keydown", event => {
      const old = fraction;
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") fraction -= 0.02;
      if (event.key === "ArrowRight" || event.key === "ArrowUp") fraction += 0.02;
      if (event.key === "PageDown") fraction -= 0.1;
      if (event.key === "PageUp") fraction += 0.1;
      if (event.key === "Home") fraction = 0.02;
      if (event.key === "End") fraction = 0.98;
      fraction = Math.max(0.02, Math.min(0.98, fraction));
      if (fraction !== old) {
        event.preventDefault();
        apply();
      }
    });

    const setFullScreen = on => {
      box.classList.toggle("fs", on);
      document.body.style.overflow = on ? "hidden" : "";
      if (fullScreenButton) {
        fullScreenButton.textContent = on ? "✕" : "⛶";
        fullScreenButton.setAttribute("aria-label", on ? "Close fullscreen comparison" : "Open fullscreen comparison");
        fullScreenButton.setAttribute("aria-pressed", String(on));
      }
      box.focus();
    };

    if (fullScreenButton) {
      fullScreenButton.addEventListener("click", () => setFullScreen(!box.classList.contains("fs")));
      document.addEventListener("keydown", event => {
        if (event.key === "Escape" && box.classList.contains("fs")) setFullScreen(false);
      });
    }

    apply();
  });

  const lightboxImages = [...document.querySelectorAll("figure img")]
    .filter(image => !image.closest(".swipe, .map-swipe, [data-p04-id]"));
  if (!lightboxImages.length) return;

  const lightbox = document.createElement("div");
  lightbox.className = "lightbox";
  lightbox.setAttribute("role", "dialog");
  lightbox.setAttribute("aria-modal", "true");
  lightbox.setAttribute("aria-label", "Enlarged map image");
  lightbox.innerHTML = `
    <button class="lightbox-close" type="button" aria-label="Close enlarged image">✕</button>
    <div class="lightbox-inner">
      <div class="lb-stage" tabindex="0" role="img">
        <img alt="">
      </div>
      <div class="lb-bar">
        <button type="button" data-zoom="out" aria-label="Zoom out">−</button>
        <span class="lb-level" aria-live="polite">Fit</span>
        <button type="button" data-zoom="in" aria-label="Zoom in">+</button>
        <button type="button" data-zoom="reset">Reset</button>
      </div>
      <div class="cap"></div>
    </div>`;
  document.body.appendChild(lightbox);

  const stage = lightbox.querySelector(".lb-stage");
  const expandedImage = lightbox.querySelector("img");
  const caption = lightbox.querySelector(".cap");
  const closeButton = lightbox.querySelector(".lightbox-close");
  const level = lightbox.querySelector(".lb-level");
  let opener = null;

  /* These maps hold 3-4.6x more detail than fits on a phone, so the viewer has to
     zoom the image itself. Letting the browser zoom the page instead would scale the
     scrim and the caption along with it. */
  const MIN = 1;
  const MAX = 5;
  let scale = MIN;
  let tx = 0;
  let ty = 0;

  const clampPan = () => {
    const stageBox = stage.getBoundingClientRect();
    const baseW = expandedImage.offsetWidth;
    const baseH = expandedImage.offsetHeight;
    const overflowX = Math.max(0, (baseW * scale - stageBox.width) / 2);
    const overflowY = Math.max(0, (baseH * scale - stageBox.height) / 2);
    tx = Math.min(overflowX, Math.max(-overflowX, tx));
    ty = Math.min(overflowY, Math.max(-overflowY, ty));
  };

  const applyTransform = () => {
    clampPan();
    expandedImage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    stage.classList.toggle("zoomed", scale > MIN + 0.001);
    level.textContent = scale <= MIN + 0.001 ? "Fit" : `${Math.round(scale * 100)}%`;
    stage.setAttribute("aria-label", `${expandedImage.alt}. Zoom ${level.textContent}.`);
  };

  /* Zoom about a point so the detail under the finger stays under the finger. */
  const zoomAt = (factor, clientX, clientY) => {
    const next = Math.min(MAX, Math.max(MIN, scale * factor));
    if (next === scale) return;
    const stageBox = stage.getBoundingClientRect();
    const cx = stageBox.left + stageBox.width / 2;
    const cy = stageBox.top + stageBox.height / 2;
    const ratio = next / scale;
    tx = (clientX - cx) * (1 - ratio) + tx * ratio;
    ty = (clientY - cy) * (1 - ratio) + ty * ratio;
    scale = next;
    applyTransform();
  };

  const zoomCentre = factor => {
    const box = stage.getBoundingClientRect();
    zoomAt(factor, box.left + box.width / 2, box.top + box.height / 2);
  };

  const reset = () => {
    scale = MIN;
    tx = 0;
    ty = 0;
    applyTransform();
  };

  /* --- pointer gestures: drag to pan, two fingers to pinch, double tap to toggle --- */
  const pointers = new Map();
  let pinchStart = 0;
  let pinchScale = 1;
  let lastTap = 0;
  let gestureStart = null;

  const spread = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const midpoint = () => {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  stage.addEventListener("pointerdown", event => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gestureStart = { x: event.clientX, y: event.clientY, at: Date.now() };
    stage.setPointerCapture(event.pointerId);
    if (pointers.size === 2) {
      pinchStart = spread();
      pinchScale = scale;
    }
  });

  stage.addEventListener("pointermove", event => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 2 && pinchStart > 0) {
      const mid = midpoint();
      const target = pinchScale * (spread() / pinchStart);
      zoomAt(Math.min(MAX, Math.max(MIN, target)) / scale, mid.x, mid.y);
    } else if (pointers.size === 1 && scale > MIN) {
      tx += dx;
      ty += dy;
      applyTransform();
    }
  });

  const releasePointer = event => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchStart = 0;
  };

  stage.addEventListener("pointerup", event => {
    releasePointer(event);
    const now = Date.now();
    // Only a real tap counts. Without the distance and duration test, two quick pans
    // read as a double tap and throw the reader's zoom away mid-gesture.
    const moved = gestureStart
      ? Math.hypot(event.clientX - gestureStart.x, event.clientY - gestureStart.y)
      : Infinity;
    const quick = gestureStart ? now - gestureStart.at < 250 : false;
    gestureStart = null;
    if (moved > 10 || !quick) {
      lastTap = 0;
      return;
    }
    if (now - lastTap < 300) {
      // Double tap: jump to a useful magnification, or back to fit.
      if (scale > MIN + 0.001) reset();
      else zoomAt(2.5, event.clientX, event.clientY);
      lastTap = 0;
    } else {
      lastTap = now;
    }
  });
  stage.addEventListener("pointercancel", releasePointer);

  stage.addEventListener("wheel", event => {
    event.preventDefault();
    zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX, event.clientY);
  }, { passive: false });

  stage.addEventListener("dblclick", event => {
    event.preventDefault();
    if (scale > MIN + 0.001) reset();
    else zoomAt(2.5, event.clientX, event.clientY);
  });

  lightbox.querySelectorAll("[data-zoom]").forEach(button => {
    button.addEventListener("click", () => {
      const mode = button.dataset.zoom;
      if (mode === "reset") reset();
      else zoomCentre(mode === "in" ? 1.5 : 1 / 1.5);
      stage.focus();
    });
  });

  stage.addEventListener("keydown", event => {
    const step = 40;
    if (event.key === "+" || event.key === "=") zoomCentre(1.5);
    else if (event.key === "-" || event.key === "_") zoomCentre(1 / 1.5);
    else if (event.key === "0") reset();
    else if (event.key === "ArrowLeft") tx += step;
    else if (event.key === "ArrowRight") tx -= step;
    else if (event.key === "ArrowUp") ty += step;
    else if (event.key === "ArrowDown") ty -= step;
    else return;
    event.preventDefault();
    applyTransform();
  });

  const close = () => {
    lightbox.classList.remove("open");
    document.body.style.overflow = "";
    reset();
    if (opener) opener.focus();
  };

  const open = image => {
    opener = image;
    expandedImage.src = image.currentSrc || image.src;
    expandedImage.alt = image.alt;
    const figureCaption = image.closest("figure")?.querySelector("figcaption");
    caption.textContent = figureCaption ? figureCaption.textContent.trim() : image.alt;
    lightbox.classList.add("open");
    document.body.style.overflow = "hidden";
    reset();
    closeButton.focus();
  };

  lightboxImages.forEach(image => {
    image.dataset.lightbox = "true";
    image.tabIndex = 0;
    image.setAttribute("role", "button");
    image.setAttribute("aria-label", `Open larger image: ${image.alt || "map"}`);
    image.addEventListener("click", () => open(image));
    image.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open(image);
      }
    });
  });

  window.addEventListener("resize", () => {
    if (lightbox.classList.contains("open")) applyTransform();
  });

  closeButton.addEventListener("click", close);
  lightbox.addEventListener("click", event => {
    if (event.target === lightbox || event.target === lightbox.querySelector(".lightbox-inner")) close();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && lightbox.classList.contains("open")) close();
  });
})();
