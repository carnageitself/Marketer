/*!
 * Pagewise tracker — one script tag, any website.
 *   <script defer src="https://YOUR-APP/t.js" data-site="pw_xxx"></script>
 *
 * Collects: page views (incl. single-page-app route changes), active time on
 * page, scroll depth, which sections were on screen and for how long
 * (auto-detected, or marked with data-section="id"), clicks with where they
 * were heading, form submissions (never their contents), custom events.
 *
 * Never collects: anything typed into a field, IP addresses (the server uses
 * the IP only to make a daily-rotating hash, then drops it), cookies. A
 * persistent visitor id in localStorage is used only with
 * data-persistent="true" or pagewise('consent', true), and never under Global
 * Privacy Control.
 *
 * Optional attributes:
 *   data-section="pricing" data-section-name="Pricing"  on any block
 *   data-track="Signup button"                          label a clickable element
 * API:
 *   pagewise('track', 'Signed up', { plan: 'pro' })
 *   pagewise('consent', true | false)
 */
(function () {
  "use strict";
  if (window.__pagewise) return;
  window.__pagewise = true;

  var script = document.currentScript || document.querySelector('script[data-site][src*="/t.js"]');
  if (!script) return;
  var SITE = script.getAttribute("data-site");
  if (!SITE) return;
  var ORIGIN;
  try { ORIGIN = new URL(script.src, location.href).origin; } catch { return; }
  var ENDPOINT = ORIGIN + "/api/collect";
  if (navigator.webdriver) return; // automated browsers aren't visitors

  var VID_KEY = "pw_vid";
  var FLUSH_MS = 5000;
  var MAX_BATCH = 40;
  var MAX_SECTIONS = 40;

  var queue = [];
  var flushTimer = null;
  var persistent = script.getAttribute("data-persistent") === "true";
  var pv = null;               // current page view
  var sections = [];           // [{el, id, name, index, dwell, since, maxVis, seen}]
  var observer = null;
  var firstLoad = true;

  // ── helpers ────────────────────────────────────────────────────────────
  function now() { return Date.now(); }
  function rid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16);
    });
  }
  function clean(s, max) {
    if (!s) return "";
    s = String(s).replace(/\s+/g, " ").trim();
    return s.length > (max || 120) ? s.slice(0, max || 120) : s;
  }
  function gpc() { return navigator.globalPrivacyControl === true; }
  function visitorId() {
    try {
      if (!persistent || gpc()) { localStorage.removeItem(VID_KEY); return undefined; }
      var v = localStorage.getItem(VID_KEY);
      if (!v) { v = rid(); localStorage.setItem(VID_KEY, v); }
      return v;
    } catch { return undefined; }
  }
  function baseDomain(host) {
    var p = host.split(".");
    if (p.length <= 2) return host;
    // example.co.uk, example.com.au …
    var sld = p[p.length - 2];
    var n = sld.length <= 3 && p[p.length - 1].length === 2 ? 3 : 2;
    return p.slice(-n).join(".");
  }

  // ── transport ──────────────────────────────────────────────────────────
  function enqueue(ev) {
    ev.ts = now();
    queue.push(ev);
    if (queue.length >= MAX_BATCH) flush(false);
    else if (!flushTimer) flushTimer = setTimeout(function () { flush(false); }, FLUSH_MS);
  }
  function flush(leaving) {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    if (!queue.length) return;
    var body = JSON.stringify({
      site: SITE,
      vid: visitorId(),
      ctx: {
        lang: navigator.language,
        tz: (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } })(),
        sw: window.screen && screen.width,
        vw: window.innerWidth
      },
      events: queue.splice(0, MAX_BATCH)
    });
    try {
      // text/plain keeps this a "simple" request: no CORS preflight.
      if (leaving && navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain" }))) {
        if (queue.length) flush(leaving);
        return;
      }
      fetch(ENDPOINT, { method: "POST", body: body, keepalive: true, credentials: "omit", headers: { "Content-Type": "text/plain" } })
        .catch(function () {});
    } catch { /* analytics must never break the site */ }
    if (queue.length) flush(leaving);
  }

  // ── sections ───────────────────────────────────────────────────────────
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, LINK: 1, META: 1, SVG: 1, BR: 1, HR: 1, IFRAME: 1 };
  function height(el) { var r = el.getBoundingClientRect(); return r.height; }
  // Sticky bars and fixed widgets are on screen the whole time, which would
  // make them look like the most-read part of every page.
  function pinned(el) {
    var p = window.getComputedStyle(el).position;
    return p === "fixed" || p === "sticky";
  }
  function isBlock(el) {
    if (SKIP[el.tagName.toUpperCase()] || pinned(el)) return false;
    var r = el.getBoundingClientRect();
    return r.height >= 120 && r.width >= Math.min(320, window.innerWidth * 0.4);
  }
  function kids(el) {
    var out = [];
    for (var i = 0; i < el.children.length; i++) {
      var c = el.children[i];
      if (!SKIP[c.tagName.toUpperCase()] && height(c) > 0) out.push(c);
    }
    return out;
  }
  function slug(s) { return clean(s, 60).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function humanize(s) { return clean(String(s).replace(/[-_]+/g, " ")).replace(/^\w/, function (c) { return c.toUpperCase(); }); }

  function nameOf(el, i) {
    var n = el.getAttribute("data-section-name") || el.getAttribute("aria-label");
    var lb = !n && el.getAttribute("aria-labelledby");
    if (lb) { var t = document.getElementById(lb); if (t) n = t.textContent; }
    var tag = el.tagName.toLowerCase();
    if (!n && tag === "footer") n = "Footer";
    if (!n && tag === "nav") n = "Navigation";
    if (!n) { var h = el.querySelector("h1, h2") || el.querySelector("h3"); if (h) n = h.textContent; }
    if (!n && tag === "header") n = "Header";
    if (!n && el.id) n = humanize(el.id);
    if (!n && el.getAttribute("data-section")) n = humanize(el.getAttribute("data-section"));
    return clean(n, 60) || "Section " + (i + 1);
  }

  /** Finds the page's content blocks on any site, tagged or not. */
  function discover() {
    var nodes = [];
    var tagged = document.querySelectorAll("[data-section]");
    if (tagged.length) {
      for (var t = 0; t < tagged.length; t++) nodes.push(tagged[t]);
    } else {
      var secs = document.querySelectorAll("section, [role=region]");
      for (var s = 0; s < secs.length; s++) {
        var p = secs[s].parentElement;
        if ((!p || !p.closest("section, [role=region]")) && isBlock(secs[s])) nodes.push(secs[s]);
      }
      if (nodes.length < 2) {
        // No semantic sections: descend through single wrappers
        // (#__next, #root, .site, .elementor…) to the real content blocks.
        nodes = [];
        var root = document.querySelector("main, [role=main]") || document.body;
        for (var d = 0; d < 8; d++) {
          var k = kids(root);
          if (k.length === 1) root = k[0]; else break;
        }
        var blocks = kids(root);
        for (var b = 0; b < blocks.length; b++) if (isBlock(blocks[b])) nodes.push(blocks[b]);
      }
      // Header and footer are worth tracking even when they sit outside <main>.
      var extra = [document.querySelector("body header, [role=banner]"), document.querySelector("body footer, [role=contentinfo]")];
      for (var x = 0; x < extra.length; x++) {
        var e = extra[x];
        if (!e || height(e) < 40 || pinned(e)) continue;
        var dup = false;
        for (var y = 0; y < nodes.length; y++) if (nodes[y] === e || nodes[y].contains(e) || e.contains(nodes[y])) dup = true;
        if (!dup) nodes.push(e);
      }
    }
    nodes.sort(function (a, b) { return a.compareDocumentPosition(b) & 4 ? -1 : 1; });
    return nodes.slice(0, MAX_SECTIONS);
  }

  function closeDwell(s, t) { if (s.since !== null) { s.dwell += t - s.since; s.since = null; } }

  function watchSections() {
    if (!window.IntersectionObserver) return;
    var found = discover();
    var used = {};
    var prev = sections;
    sections = [];
    for (var i = 0; i < found.length; i++) {
      var el = found[i];
      var old = null;
      for (var j = 0; j < prev.length; j++) if (prev[j].el === el) old = prev[j];
      var name = old ? old.name : nameOf(el, i);
      var id = old ? old.id : (el.getAttribute("data-section") || el.id || slug(name) || "s" + i);
      while (used[id]) id = id + "-" + i;
      used[id] = 1;
      sections.push(old || { el: el, id: id, name: name, index: i, dwell: 0, since: null, maxVis: 0, seen: false });
      sections[sections.length - 1].index = i;
    }
    if (observer) observer.disconnect();
    var th = []; for (var n = 0; n <= 20; n++) th.push(n / 20);
    observer = new IntersectionObserver(function (entries) {
      var t = now();
      for (var e = 0; e < entries.length; e++) {
        var en = entries[e], s = null;
        for (var k = 0; k < sections.length; k++) if (sections[k].el === en.target) s = sections[k];
        if (!s) continue;
        var pct = Math.round(en.intersectionRatio * 100);
        if (pct > s.maxVis) s.maxVis = pct;
        // "On screen" = half the section is visible, or it fills half the
        // viewport (sections taller than the screen never reach 50%).
        var on = en.isIntersecting && document.visibilityState === "visible" &&
          (en.intersectionRatio >= 0.5 || en.intersectionRect.height >= window.innerHeight * 0.5);
        if (on) { if (s.since === null) s.since = t; s.seen = true; }
        else closeDwell(s, t);
      }
    }, { threshold: th });
    for (var m = 0; m < sections.length; m++) observer.observe(sections[m].el);
  }

  function emitSections() {
    if (!pv) return;
    var t = now();
    for (var i = 0; i < sections.length; i++) {
      var s = sections[i];
      var open = s.since !== null;
      closeDwell(s, t);
      if (open) s.since = t; // keep counting; the server keeps the largest value
      if (!s.seen) continue;
      enqueue({ t: "sec", pv: pv.id, path: pv.path, sid: s.id, name: s.name, idx: s.index, ms: Math.min(s.dwell, 1800000), vis: s.maxVis });
    }
  }

  // ── page views ─────────────────────────────────────────────────────────
  function activeMs() {
    if (!pv) return 0;
    return pv.active + (pv.since !== null ? now() - pv.since : 0);
  }
  function emitLeave(final) {
    if (!pv) return;
    emitSections();
    enqueue({ t: "leave", pv: pv.id, path: pv.path, ms: Math.min(activeMs(), 1800000), scroll: pv.maxScroll, final: !!final });
  }
  function startPage() {
    var path = location.pathname || "/";
    var prevPath = null;
    if (pv) {
      if (pv.path === path) return;
      emitLeave(true);
      prevPath = pv.path;
    } else if (document.referrer) {
      try {
        var r = new URL(document.referrer);
        if (r.hostname === location.hostname) prevPath = r.pathname;
      } catch { /* ignore */ }
    }
    pv = { id: rid(), path: path, active: 0, since: document.visibilityState === "visible" ? now() : null, maxScroll: 0 };
    sections = [];
    enqueue({
      t: "pv", pv: pv.id, path: path, title: clean(document.title, 200), prev: prevPath,
      q: clean(location.search, 500), r: firstLoad ? clean(document.referrer, 1000) : ""
    });
    firstLoad = false;
    // Content often renders after load (SPAs, sliders, lazy blocks), so look again.
    setTimeout(watchSections, 300);
    setTimeout(watchSections, 2000);
    setTimeout(onScroll, 350);
  }

  // ── scroll ─────────────────────────────────────────────────────────────
  var raf = 0;
  function onScroll() {
    if (raf || !pv) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var pct = max <= 0 ? 100 : Math.min(100, Math.round(((window.scrollY || doc.scrollTop) / max) * 100));
      if (pct > pv.maxScroll) pv.maxScroll = pct;
    });
  }

  // ── clicks & forms ─────────────────────────────────────────────────────
  function classify(href) {
    if (/^mailto:/i.test(href)) return { kind: "mailto" };
    if (/^tel:/i.test(href)) return { kind: "tel" };
    if (href.charAt(0) === "#") return { kind: "anchor", path: href };
    var u;
    try { u = new URL(href, location.href); } catch { return { kind: "external" }; }
    if (!/^https?:$/.test(u.protocol)) return { kind: "external" };
    if (u.hostname === location.hostname) {
      if (u.pathname === location.pathname && u.hash) return { kind: "anchor", path: u.hash };
      return { kind: "internal", path: u.pathname };
    }
    // app.example.com from www.example.com: the visitor is heading into the product.
    if (baseDomain(u.hostname) === baseDomain(location.hostname)) return { kind: "app", path: u.pathname };
    return { kind: "external" };
  }
  function sectionOf(el) {
    for (var i = 0; i < sections.length; i++) if (sections[i].el.contains(el)) return sections[i].id;
    return null;
  }
  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest || !pv) return;
    var el = t.closest("a[href], button, [role=button], input[type=submit], input[type=button], [data-track]");
    if (!el) return;
    var label = clean(el.getAttribute("data-track") || el.getAttribute("aria-label") ||
      (el.tagName === "INPUT" ? el.value : el.textContent) || el.getAttribute("title"), 100);
    var ev = { t: "click", pv: pv.id, path: pv.path, label: label, sec: sectionOf(el), kind: "button" };
    if (el.tagName === "A") {
      var href = el.getAttribute("href") || "";
      var c = classify(href);
      ev.kind = c.kind; ev.href = clean(el.href || href, 1000); ev.tpath = c.path || null;
      enqueue(ev);
      // A full page load is about to replace this document. Send the page's
      // time, scroll and sections now: requests started during unload are
      // often cancelled. (The server keeps the largest values, so the
      // pagehide send that may follow is harmless.)
      var leaves = c.kind !== "anchor" && !e.defaultPrevented && !(e.ctrlKey || e.metaKey || e.shiftKey) &&
        (el.getAttribute("target") || "_self") === "_self" && !el.hasAttribute("download");
      if (leaves) { emitLeave(false); flush(true); }
    } else {
      enqueue(ev);
    }
  }
  function onSubmit(e) {
    var f = e.target;
    if (!f || f.tagName !== "FORM" || !pv) return;
    var sub = e.submitter;
    var label = clean(f.getAttribute("data-track") || f.getAttribute("aria-label") || f.getAttribute("name") || f.id ||
      (sub && (sub.value || sub.textContent)) || "Form", 100);
    enqueue({ t: "click", pv: pv.id, path: pv.path, label: label, sec: sectionOf(f), kind: "form" });
    flush(true);
  }

  // ── lifecycle ──────────────────────────────────────────────────────────
  function onVisibility() {
    if (!pv) return;
    var t = now();
    if (document.visibilityState === "hidden") {
      if (pv.since !== null) { pv.active += t - pv.since; pv.since = null; }
      for (var i = 0; i < sections.length; i++) closeDwell(sections[i], t);
      emitLeave(false);
      flush(true);
    } else {
      pv.since = t;
      watchSections(); // the observer re-reports what is on screen now
    }
  }
  function onRoute() { setTimeout(startPage, 0); }

  var push = history.pushState, replace = history.replaceState;
  history.pushState = function () { var r = push.apply(this, arguments); onRoute(); return r; };
  history.replaceState = function () { var r = replace.apply(this, arguments); onRoute(); return r; };
  window.addEventListener("popstate", onRoute);
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("click", onClick, true);
  document.addEventListener("submit", onSubmit, true);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", function () { emitLeave(true); flush(true); });

  // ── public API ─────────────────────────────────────────────────────────
  var pending = (window.pagewise && window.pagewise.q) || [];
  window.pagewise = function (cmd, a, b) {
    if (cmd === "track" && a) enqueue({ t: "ev", pv: pv && pv.id, path: pv && pv.path, name: clean(a, 100), props: b && typeof b === "object" ? b : {} });
    else if (cmd === "consent") { persistent = !!a; visitorId(); }
  };
  for (var p = 0; p < pending.length; p++) window.pagewise.apply(null, pending[p]);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startPage);
  else startPage();
})();
