/* Tunebox motion layer: loaded after the app script. Adds animation only, never changes behaviour. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const RM = window.matchMedia("(prefers-reduced-motion: reduce)");
  let calm = RM.matches;
  if (RM.addEventListener) RM.addEventListener("change", e => { calm = e.matches; });

  // ---- 1. Staggered entrance for new rows, cards and tiles ----
  const ENTER = ".row,.card,.spot,.tile,.stat-hero,.hero2";
  const SKIP = "#queueList,#scrim,.scrim,#splash,#lyBox";
  let quiet = 0; // a heart tap or menu choice redraws a list: don't re-animate it
  document.addEventListener("click", e => {
    if (e.target.closest && e.target.closest(".fav,.sheet .opt")) quiet = performance.now() + 700;
  }, true);
  new MutationObserver(muts => {
    if (calm || performance.now() < quiet) return;
    const batch = [];
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches(ENTER)) batch.push(n);
      else n.querySelectorAll(ENTER).forEach(x => batch.push(x));
    }
    batch.filter(n => !n.closest(SKIP) && !n.classList.contains("tb-in")).forEach((n, i) => {
      n.style.setProperty("--i", Math.min(i, 14));
      n.classList.add("tb-in");
    });
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener("animationend", e => {
    if (e.animationName === "tbRise") { e.target.classList.remove("tb-in"); e.target.style.removeProperty("--i"); }
    if (e.animationName === "tbText") e.target.classList.remove("tb-swap");
  }, true);

  // ---- 2. Title and artist slide in when the song changes ----
  const swap = el => { if (calm) return; el.classList.remove("tb-swap"); void el.offsetWidth; el.classList.add("tb-swap"); };
  ["#nowTitle", "#nowArtist", "#miniTitle", "#miniArtist", "#lyTitle", "#lyArtist"].forEach(sel => {
    const el = $(sel); if (!el) return;
    new MutationObserver(() => swap(el)).observe(el, { childList: true, characterData: true });
  });

  // ---- 3. Artwork glow crossfades on song change ----
  const glow = $("#glow");
  if (glow) {
    let last = glow.style.backgroundImage;
    new MutationObserver(() => {
      const now = glow.style.backgroundImage; if (now === last) return; last = now;
      if (calm) return;
      glow.classList.remove("swap"); void glow.offsetWidth; glow.classList.add("swap");
      setTimeout(() => glow.classList.remove("swap"), 1100);
    }).observe(glow, { attributes: true, attributeFilter: ["style"] });
  }

  // ---- 4. Heart pop (capture phase: the app's own click handler stops propagation) ----
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest(".fav"); if (!b || calm) return;
    b.classList.add("pop"); setTimeout(() => b.classList.remove("pop"), 700);
  }, true);

  // ---- 5. Bottom sheet: animated close, grab handle, swipe down to dismiss ----
  window.closeSheet = function () {
    const s = document.getElementById("scrim"); if (!s) return;
    if (calm) { s.remove(); return; }
    s.removeAttribute("id"); s.classList.add("leaving"); // new sheets can open while this one fades out
    setTimeout(() => s.remove(), 340);
  };
  new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1 || !n.classList.contains("scrim")) continue;
      const sh = n.querySelector(".sheet");
      if (sh && !sh.querySelector(".tb-grab")) { const g = document.createElement("div"); g.className = "tb-grab"; sh.prepend(g); }
    }
  }).observe(document.body, { childList: true });
  let drag = null;
  document.addEventListener("pointerdown", e => {
    const h = e.target.closest && e.target.closest(".tb-grab,.sheet .sh"); if (!h) return;
    const sheet = h.closest(".sheet"), scrim = h.closest(".scrim"); if (!sheet || !scrim) return;
    drag = { sheet, scrim, y0: e.clientY, t0: performance.now(), dy: 0, id: e.pointerId };
    sheet.style.transition = "none";
  }, true);
  document.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dy = Math.max(0, e.clientY - drag.y0);
    drag.sheet.style.transform = "translateY(" + drag.dy + "px)";
    drag.scrim.style.opacity = String(1 - Math.min(0.7, drag.dy / 500));
  }, { passive: true });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag; drag = null;
    const v = d.dy / Math.max(1, performance.now() - d.t0);
    d.sheet.style.transition = ""; d.sheet.style.transform = ""; d.scrim.style.opacity = "";
    if (d.dy > 110 || (v > 0.6 && d.dy > 40)) window.closeSheet();
  }
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);

  // ---- 6. Tab bar: a pill slides under the selected tab ----
  const nav = $(".tabbar");
  if (nav) {
    const ind = document.createElement("i"); ind.className = "tb-ind"; nav.prepend(ind);
    const place = instant => {
      const b = nav.querySelector("button.sel"); if (!b) return;
      if (instant) ind.style.transition = "none";
      ind.style.width = (b.offsetWidth - 10) + "px";
      ind.style.transform = "translateX(" + (b.offsetLeft + 5) + "px)";
      if (instant) { void ind.offsetWidth; ind.style.transition = ""; }
    };
    place(true);
    addEventListener("resize", () => place(true));
    new MutationObserver(() => place(false)).observe(nav, { attributes: true, attributeFilter: ["class"], subtree: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => place(true));
  }

  // ---- 7. Ripple on pills, tiles, menu options and Go buttons ----
  document.addEventListener("pointerdown", e => {
    if (calm) return;
    const h = e.target.closest && e.target.closest(".pill,.tile,.opt,.go"); if (!h) return;
    const r = h.getBoundingClientRect(), s = Math.max(r.width, r.height) * 2;
    const d = document.createElement("span"); d.className = "tb-ripple";
    d.style.cssText = "width:" + s + "px;height:" + s + "px;left:" + (e.clientX - r.left - s / 2) + "px;top:" + (e.clientY - r.top - s / 2) + "px";
    h.classList.add("tb-host"); h.append(d); setTimeout(() => d.remove(), 700);
  }, { passive: true });

  // ---- 8. Per-frame work: seek bar fill and the word-by-word lyric sweep ----
  const seek = $("#seek"); let lastP = -1;
  function seekFill() {
    if (!seek) return;
    const max = +seek.max || 0, p = max ? Math.min(100, seek.value / max * 100) : 0;
    if (Math.abs(p - lastP) > 0.02) { lastP = p; seek.style.setProperty("--p", p.toFixed(2) + "%"); }
  }
  const wrapped = new WeakMap();
  function wrapWords(tx, text) { // split a lyric line into word spans so they can light up one by one
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const total = words.reduce((a, w) => a + w.length + 1, 0) || 1;
    tx.textContent = "";
    let acc = 0; const out = [];
    words.forEach((w, k) => {
      const s = document.createElement("span"); s.className = "w"; s.textContent = w; tx.append(s);
      if (k < words.length - 1) tx.append(" ");
      out.push({ s, at: acc / total }); acc += w.length + 1;
    });
    return out;
  }
  function lyricFrame() {
    if (typeof LY === "undefined" || !LY.synced || document.hidden) return;
    const tab = $("#tab-lyrics"); if (!tab || tab.hidden) return;
    const i = LY.act; if (i < 0) return;
    const e = LY.entries[i], d = LY.els[i]; if (!e || !d || e.dots) return;
    let ws = wrapped.get(d);
    if (!ws) { const tx = d.querySelector(".tx"); if (!tx) return; ws = wrapWords(tx, e.text); wrapped.set(d, ws); }
    const p = (lt() - e.t) / Math.max(0.4, e.d * 0.94);
    for (const o of ws) o.s.classList.toggle("lit", p >= o.at);
  }
  function frame() {
    try { lyricFrame(); seekFill(); } catch (err) { /* never break playback over a visual */ }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
