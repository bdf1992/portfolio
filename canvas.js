// Pan-and-zoom canvas: one camera (x, y, scale) applied to the world as a CSS transform.
(function () {
  const viewport = document.getElementById("viewport");
  const world = document.getElementById("world");
  const wires = document.getElementById("wires");
  const cam = { x: 0, y: 0, s: 1 };
  const MIN = 0.15, MAX = 2.2;
  let anim = null;

  function apply() {
    world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})`;
  }
  function clamp(s) { return Math.min(MAX, Math.max(MIN, s)); }

  function zoomAt(px, py, factor) {
    const s = clamp(cam.s * factor);
    const k = s / cam.s;
    cam.x = px - (px - cam.x) * k;
    cam.y = py - (py - cam.y) * k;
    cam.s = s;
    apply();
  }

  function box(el) {
    return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
  }

  // Fly the camera so that the given world rectangle fills the screen.
  function fit(rect, instant) {
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    const top = 64, pad = 28;
    const s = clamp(Math.min((vw - pad * 2) / rect.w, (vh - top - pad) / rect.h));
    const target = {
      s,
      x: (vw - rect.w * s) / 2 - rect.x * s,
      y: top + (vh - top - pad - rect.h * s) / 2 - rect.y * s,
    };
    if (instant) { Object.assign(cam, target); apply(); return; }
    const from = { ...cam }, t0 = performance.now(), dur = 420;
    cancelAnimationFrame(anim);
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / dur), e = ease(t);
      cam.s = from.s + (target.s - from.s) * e;
      cam.x = from.x + (target.x - from.x) * e;
      cam.y = from.y + (target.y - from.y) * e;
      apply();
      if (t < 1) anim = requestAnimationFrame(tick);
    };
    anim = requestAnimationFrame(tick);
  }

  function bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    world.querySelectorAll(".frame, .card").forEach((el) => {
      const b = box(el);
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    });
    return { x: x0 - 20, y: y0 - 20, w: x1 - x0 + 40, h: y1 - y0 + 40 };
  }

  function go(id, instant) {
    if (document.body.classList.contains("reading")) {
      const el = id === "all" ? document.getElementById("intro") : document.getElementById(id);
      el.scrollIntoView({ behavior: instant ? "auto" : "smooth", block: "start" });
      return;
    }
    if (id === "all") return fit(bounds(), instant);
    const b = box(document.getElementById(id));
    fit({ x: b.x - 10, y: b.y - 30, w: b.w + 20, h: b.h + 40 }, instant);
  }

  // ---- connectors between cards ----
  const links = [
    ["intro", "b", "r1", "t"],
    ["intro", "b", "r2", "t"],
    ["intro", "b", "r3", "t"],
    ["intro", "b", "r4", "t"],
    ["r4-pick", "r", "r4-char", "l"],
    ["r4-pick", "b", "r4-api", "t", "same tokens", "live"],
    ["r1-graph", "r", "r1-case", "l", "", "live"],
    ["r2-ask", "r", "r2-rule", "l"],
    ["r2-rule", "b", "r2-ui", "t"],
    ["r2-rule", "b", "r2-api", "t"],
    ["r2-rule", "b", "r2-mcp", "t"],
    ["r3-contract", "r", "r3-grants", "l"],
    ["r3-grants", "r", "r3-task", "l"],
    ["r3-task", "b", "r3-ledger", "tr", "every attempt", "live"],
  ];
  function anchor(b, side) {
    if (side === "t") return [b.x + b.w / 2, b.y];
    if (side === "tr") return [b.x + b.w * 0.88, b.y];
    if (side === "b") return [b.x + b.w / 2, b.y + b.h];
    if (side === "l") return [b.x, b.y + Math.min(b.h / 2, 90)];
    return [b.x + b.w, b.y + Math.min(b.h / 2, 90)];
  }
  function drawWires() {
    if (document.body.classList.contains("reading")) return;
    const parts = [];
    for (const [a, as, b, bs, label, cls] of links) {
      const A = box(document.getElementById(a)), B = box(document.getElementById(b));
      const [x1, y1] = anchor(A, as), [x2, y2] = anchor(B, bs);
      const vert = as === "b";
      const d = vert
        ? `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`
        : `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
      parts.push(`<path d="${d}" class="${cls || ""}"/>`);
      if (label) {
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const w = label.length * 6.4 + 10;
        parts.push(`<rect class="label-bg" x="${mx - w / 2}" y="${my - 18}" width="${w}" height="16" rx="4"/>`);
        parts.push(`<text x="${mx}" y="${my - 6}" text-anchor="middle">${label}</text>`);
      }
      parts.push(`<circle cx="${x2}" cy="${y2}" r="3.5" fill="var(--frame-line)"/>`);
    }
    wires.innerHTML = parts.join("");
  }
  window.canvasRedraw = drawWires;
  new ResizeObserver(drawWires).observe(world);
  world.querySelectorAll(".card").forEach((el) => new ResizeObserver(drawWires).observe(el));

  // ---- input ----
  const pointers = new Map();
  let pan = null, pinch = null;
  const interactive = "button, a, input, select, textarea, label, pre, .log, .ledger-wrap, .schem svg, [data-nopan]";

  viewport.addEventListener("pointerdown", (e) => {
    if (document.body.classList.contains("reading")) return;
    if (e.target.closest(interactive)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    viewport.setPointerCapture(e.pointerId);
    cancelAnimationFrame(anim);
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    if (pointers.size === 1) {
      pan = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y };
      viewport.classList.add("panning");
    } else if (pointers.size === 2) {
      const [p, q] = [...pointers.values()];
      pinch = { d: Math.hypot(p.x - q.x, p.y - q.y), s: cam.s };
      pan = null;
    }
  });
  viewport.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [p, q] = [...pointers.values()];
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      zoomAt((p.x + q.x) / 2, (p.y + q.y) / 2, (pinch.s * d / pinch.d) / cam.s);
    } else if (pan) {
      cam.x = pan.cx + (e.clientX - pan.x);
      cam.y = pan.cy + (e.clientY - pan.y);
      apply();
    }
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) { pan = null; viewport.classList.remove("panning"); }
  };
  // Text selection never starts from a drag on the canvas, only inside fields and code blocks.
  viewport.addEventListener("selectstart", (e) => {
    if (document.body.classList.contains("reading")) return;
    const el = e.target.nodeType === 1 ? e.target : e.target.parentElement;
    if (!el || !el.closest("input, textarea, pre")) e.preventDefault();
  });
  viewport.addEventListener("pointerup", up);
  viewport.addEventListener("pointercancel", up);

  viewport.addEventListener("wheel", (e) => {
    if (document.body.classList.contains("reading")) return;
    const scroller = e.target.closest(".log, .ledger-wrap, pre");
    if (scroller && !e.ctrlKey && scroller.scrollHeight > scroller.clientHeight) return;
    e.preventDefault();
    cancelAnimationFrame(anim);
    // A trackpad pinch arrives as ctrl+wheel; a mouse wheel moves in large whole steps.
    const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
    if (e.ctrlKey || mouseWheel) {
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    } else {
      cam.x -= e.deltaX; cam.y -= e.deltaY; apply();
    }
  }, { passive: false });

  document.getElementById("zoom-in").onclick = () => zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, 1.25);
  document.getElementById("zoom-out").onclick = () => zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, 0.8);
  document.querySelectorAll("#jump button").forEach((b) => (b.onclick = () => go(b.dataset.go)));

  // ---- reading view: the same cards in one column, for phones ----
  const modeBtn = document.getElementById("mode");
  function setReading(on) {
    document.body.classList.toggle("reading", on);
    modeBtn.setAttribute("aria-pressed", String(on));
    modeBtn.textContent = on ? "Canvas view" : "Reading view";
    if (!on) { drawWires(); go("all", true); }
  }
  modeBtn.onclick = () => setReading(!document.body.classList.contains("reading"));

  window.addEventListener("load", () => {
    drawWires();
    if (window.innerWidth < 760) setReading(true);
    else go("all", true);
  });
})();
