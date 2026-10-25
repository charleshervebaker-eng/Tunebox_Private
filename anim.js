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

  // ---- 8. Seek bar fill ----
  const seek = $("#seek"); let lastP = -1;
  function seekFill() {
    if (!seek) return;
    const max = +seek.max || 0, p = max ? Math.min(100, seek.value / max * 100) : 0;
    if (Math.abs(p - lastP) > 0.02) { lastP = p; seek.style.setProperty("--p", p.toFixed(2) + "%"); }
  }
  (function frame() {
    try { seekFill(); } catch (err) { /* never break playback over a visual */ }
    requestAnimationFrame(frame);
  })();

  // ---- 9. Lyrics: Apple Music style sliding highlight, duet sides, background vocals ----
  // This replaces the app's lyric builder and painter (same names, same data), so the rest of the
  // app (sync nudge, seeking, auto-scroll) keeps working. Skipped if the app's lyric code isn't there.
  try {
    if (typeof LY === "undefined" || typeof renderLyrics !== "function" || typeof paintActive !== "function") return;

    const LEAD = 0.2;                      // a line becomes active this early so the scroll lands as singing starts
    const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
    const SECTION = /^(verse|chorus|bridge|intro|outro|hook|pre-?chorus|refrain|instrumental|interlude|solo)\b/i;
    const GROUP = /^(both|all|together|group|duet|everyone)$/;
    const LABEL = /^\s*([A-Za-z][\w .&'-]{0,18}?)\s*:\s+(\S.*)$/;
    const fk = t => Math.round(t * 100) / 100;
    LY.sing = load("lysing", {});          // per song: times where the singer changes (marked by long-press)

    // Explicit singer labels ("v1:", "Ed:", ...). Only trusted when a label repeats, so normal lyrics are untouched.
    function splitSingers(lines) {
      const counts = new Map();
      lines.forEach(l => { const m = LABEL.exec(l.text || ""); if (m) { const k = m[1].trim().toLowerCase(); counts.set(k, (counts.get(k) || 0) + 1); } });
      const good = new Set([...counts].filter(([k, n]) => n >= 2 || /^v?[12]$/.test(k)).map(([k]) => k));
      if (!good.size) return lines;
      const order = [];
      return lines.map(l => {
        const m = LABEL.exec(l.text || ""), k = m && m[1].trim().toLowerCase();
        if (!k || !good.has(k)) return l;
        let v;
        const num = /^v?([12])$/.exec(k);
        if (num) v = +num[1] - 1;
        else if (!GROUP.test(k)) { if (!order.includes(k)) order.push(k); v = order.indexOf(k) % 2; }
        return Object.assign({}, l, { text: m[2], v });
      });
    }

    // How long a line is actually sung. Uses the source's end time when it has one; otherwise a natural
    // singing pace, capped by the gap to the next line, so a long pause doesn't make the light crawl.
    function sungFor(l, text, gap) {
      const est = l.e ? l.e - l.t : Math.min(gap * 0.96, Math.max(1.2, text.length * 0.085 + 0.8));
      return Math.max(0.4, Math.min(est, gap));
    }

    window.buildEntries = function (raw) {
      const lines = splitSingers(raw.map(l => Object.assign({}, l)));
      const out = [];
      if (lines.length && lines[0].t > 5) out.push({ t: 0.5, dots: true });
      lines.forEach((l, i) => {
        const next = lines[i + 1];
        if (!l.text) return out.push({ t: l.t, dots: true });
        const gap = next ? Math.max(0.3, next.t - l.t) : 6;
        const text = l.text.trim(), prev = out[out.length - 1];

        // A line that is only "(background words)": attach it under the line before it.
        const only = /^[\(\[]([^()\[\]]+)[\)\]]$/.exec(text);
        if (only && !SECTION.test(only[1].trim())) {
          const inner = only[1].trim(), d = sungFor(l, inner, gap);
          if (prev && !prev.dots && !prev.bg && l.t - prev.t < 15) {
            prev.bg = { t: l.t, d, text: inner }; prev.end = Math.max(prev.end, l.t + d); return;
          }
          return out.push({ t: l.t, text: inner, d, small: true, v: l.v, end: l.t + d });
        }

        // "Main words (ad lib)": the trailing bracket becomes a background line sung just after.
        let main = text, bg = null;
        const tail = /^(.*\S)\s*[\(\[]([^()\[\]]+)[\)\]]$/.exec(text);
        if (tail && tail[1].replace(/[^A-Za-z0-9]/g, "").length >= 3 && !SECTION.test(tail[2].trim())) main = tail[1];
        let d = sungFor(l, main, gap);
        if (main !== text) {
          const full = d; d = Math.max(0.4, full * 0.7);
          bg = { t: l.t + d + 0.05, d: Math.max(0.5, full - d - 0.05), text: tail[2].trim() };
        }
        const e = { t: l.t, text: main, d, v: l.v, end: bg ? bg.t + bg.d : l.t + d };
        if (bg) e.bg = bg;
        out.push(e);
      });
      // instrumental breaks get the breathing dots
      const fin = [];
      out.forEach((e, i) => {
        fin.push(e);
        const n = out[i + 1];
        if (!e.dots && n && !n.dots && n.t - e.end > 6) fin.push({ t: e.end + 0.4, dots: true });
      });
      return fin.filter((e, i) => !(e.dots && fin[i - 1] && fin[i - 1].dots));
    };

    // Left or right side per line: explicit labels first, then the singer changes you marked.
    function applySides(entries) {
      const flips = new Set(LY.sing[LY.key] || []); let cur = 0;
      entries.forEach(e => {
        if (e.dots) return;
        if (e.v != null) cur = e.v; else if (flips.has(fk(e.t))) cur ^= 1;
        e.side = cur;
      });
      for (let i = entries.length - 1, nextSide = 0; i >= 0; i--) {
        if (entries[i].dots) entries[i].side = nextSide; else nextSide = entries[i].side;
      }
    }

    window.findActive = function (time) {
      time += LEAD;
      let lo = 0, hi = LY.entries.length - 1, ans = -1;
      while (lo <= hi) { const m = (lo + hi) >> 1; if (LY.entries[m].t <= time) { ans = m; lo = m + 1; } else hi = m - 1; }
      return ans;
    };

    // ---- singer marking: hold a line ----
    const storeFlips = set => {
      const a = [...set].sort((x, y) => x - y);
      if (a.length) LY.sing[LY.key] = a; else delete LY.sing[LY.key];
      save("lysing", LY.sing);
      const j = LY.cache.get(LY.key); if (j) renderLyrics(j);
    };
    function singerSheet(e) {
      if (!LY.key || e.dots) return;
      const cur = new Set(LY.sing[LY.key] || []), k = fk(e.t);
      openSheet(sh => {
        sheetHead(sh, "Who sings this?", "Mark where the singer changes. Lines then split left and right.");
        sh.append(optBtn("user", cur.has(k) ? "Same singer as the line before" : "Singer changes here", () => {
          const s = new Set(cur); if (s.has(k)) s.delete(k); else s.add(k); storeFlips(s);
        }));
        sh.append(optBtn("repeat", "Alternate every line from here", () => {
          const s = new Set([...cur].filter(x => x < k));
          LY.entries.forEach(x => { if (!x.dots && fk(x.t) >= k) s.add(fk(x.t)); });
          storeFlips(s);
        }));
        if (cur.size) sh.append(optBtn("x", "Clear singer marks for this song", () => storeFlips(new Set()), "danger"));
      });
    }
    let held = false;
    function bindLine(d, e) {
      let timer = 0, x = 0, y = 0;
      const cancel = () => clearTimeout(timer);
      d.addEventListener("pointerdown", ev => {
        x = ev.clientX; y = ev.clientY; cancel();
        timer = setTimeout(() => { held = true; setTimeout(() => { held = false; }, 700); singerSheet(e); }, 520);
      });
      d.addEventListener("pointermove", ev => { if (Math.abs(ev.clientX - x) > 8 || Math.abs(ev.clientY - y) > 8) cancel(); });
      ["pointerup", "pointercancel", "pointerleave"].forEach(n => d.addEventListener(n, cancel));
      d.onclick = () => { if (held) { held = false; return; } seekTo(e.t); };
    }

    window.renderLyrics = function (j) {
      resetLy();
      const src = j && j.source ? String(j.source).replace(/^Source:\s*/i, "Lyrics: ") : "";
      $("#lySrc").textContent = src;
      if (j && j.synced && j.lines && j.lines.length) {
        const box = $("#lyBox"); box.className = "lybox"; box.replaceChildren();
        LY.synced = true; LY.entries = buildEntries(j.lines); applySides(LY.entries);
        box.classList.toggle("duet", LY.entries.some(e => e.side === 1));
        LY.entries.forEach(e => {
          const d = el("div", "ll" + (e.dots ? " dots" : "") + (e.side === 1 ? " r" : "") + (e.small ? " small" : ""));
          if (e.dots) d.append(el("i"), el("i"), el("i"));
          else {
            e.tx = el("span", "tx", e.text); d.append(e.tx);
            if (e.bg) { const b = el("div", "bgl"); e.bx = el("span", "tx", e.bg.text); b.append(e.bx); d.append(b); }
          }
          bindLine(d, e);
          box.append(d); LY.els.push(d);
        });
        paintActive(findActive(lt()), true);
        kick();
      } else if (j && j.plain) {
        const b = $("#lyBox"); b.className = "lybox plain"; b.textContent = j.plain;
        $("#lySrc").textContent = (src ? src + " \u00b7 " : "") + "not time-synced";
      } else lyMsg("No lyrics found for this song.");
    };

    // The sliding highlight and the background-vocal reveal, driven by the real (un-led) lyric clock.
    const setP = (node, v) => { const s = v.toFixed(1); if (node._p !== s) { node._p = s; node.style.setProperty("--p", s); } };
    function sweep(time) {
      const i = LY.act; if (i < 0) return;
      const e = LY.entries[i], d = LY.els[i]; if (!e || e.dots || !e.tx) return;
      setP(e.tx, clamp01((time - e.t) / e.d) * 100);
      if (e.bg) {
        const on = time >= e.bg.t - 0.1;
        if (d.classList.contains("bg-on") !== on) d.classList.toggle("bg-on", on);
        setP(e.bx, clamp01((time - e.bg.t) / e.bg.d) * 100);
      }
    }

    window.paintActive = function (i, instant) {
      LY.act = i;
      LY.els.forEach((d, k) => {
        d.classList.toggle("act", k === i);
        d.classList.toggle("past", k < i);
        d.style.setProperty("--b", k === i ? "0px" : Math.min(2.4, 0.55 * Math.abs(k - i)).toFixed(2) + "px");
        const e = LY.entries[k];
        if (k !== i && e && e.bg) d.classList.toggle("bg-on", k < i); // earlier lines show theirs, later ones wait
      });
      sweep(lt());
      if (i >= 0 && performance.now() > LY.pausedUntil) center(instant);
    };

    window.tick = function () {
      LY.raf = 0; if (!lyricsOn()) return;
      const time = lt(), i = findActive(time);
      if (i !== LY.act) paintActive(i, false);
      sweep(time);
      if (LY.recenter && performance.now() > LY.pausedUntil) { LY.recenter = false; center(false); }
      LY.raf = requestAnimationFrame(tick);
    };

    // If lyrics were already on screen when this script ran, redraw them with the new engine.
    if (LY.synced && LY.key) { const j = LY.cache.get(LY.key); if (j) renderLyrics(j); }
  } catch (err) { console.warn("lyrics layer:", err); }
})();
