// scripts/simulate.mjs — sends realistic demo traffic through the real collector.
//   npm run simulate -- <siteId> [visits=150] [baseUrl=http://localhost:3000]
//
// Each simulated visitor gets its own IP + user agent (so its own anonymous
// visitor hash), a traffic source, and a path through a small marketing site.
// Built-in patterns for the dashboard to find: readers of the testimonials
// section convert far more often, and most people stop before the FAQ.
// Requests carry the demo-page Referer, which the collector accepts for any
// site on this app; it only writes to the site id you pass.
const [siteId, visitsArg = "150", base = "http://localhost:3000"] = process.argv.slice(2);
if (!siteId) { console.error("usage: npm run simulate -- <siteId> [visits] [baseUrl]"); process.exit(1); }
const N = Number(visitsArg) || 150;

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const weighted = (pairs) => { let r = Math.random() * pairs.reduce((s, p) => s + p[1], 0); for (const [v, w] of pairs) if ((r -= w) <= 0) return v; return pairs[0][0]; };
const chance = (p) => Math.random() < p;
const uuid = () => crypto.randomUUID();

const SOURCES = [
  [{ r: "https://www.google.com/" }, 34], [{ r: "" }, 18],
  [{ r: "https://lnkd.in/x", q: "?utm_source=linkedin&utm_medium=social&utm_campaign=launch-week" }, 12],
  [{ r: "https://chatgpt.com/" }, 9], [{ r: "https://www.reddit.com/r/SaaS" }, 7], [{ r: "https://news.ycombinator.com/" }, 5],
  [{ r: "https://www.bing.com/" }, 5], [{ r: "", q: "?utm_source=newsletter&utm_medium=email&utm_campaign=october" }, 7],
  [{ r: "https://www.google.com/", q: "?gclid=abc123" }, 3],
];
const UAS = [
  ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", 1440],
  ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15", 1512],
  ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", 390],
  ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36", 412],
  ["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0", 1920],
  ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0", 1680],
];
const COUNTRIES = ["US", "US", "US", "IN", "GB", "DE", "CA", "FR", "AU", "BR"];

// page → ordered sections [id, name, chance a viewer reaches it, typical read ms]
const PAGES = {
  "/": { title: "Brightnote: your second brain", sections: [
    ["hero", "Your second brain, finally organised", 1, 6000], ["how-it-works", "How it works", 0.78, 9000],
    ["testimonials", "Loved by 20,000 teams", 0.46, 7000], ["integrations", "Integrations", 0.33, 4000],
    ["faq", "Frequently asked questions", 0.12, 8000], ["footer", "Footer", 0.1, 1500]] },
  "/pricing": { title: "Pricing", sections: [
    ["plans", "Simple pricing", 1, 12000], ["compare", "Compare plans", 0.62, 9000], ["faq", "Frequently asked questions", 0.35, 10000], ["footer", "Footer", 0.25, 1000]] },
  "/features": { title: "Features", sections: [
    ["everything", "Everything in one place", 1, 7000], ["offline", "Works offline", 0.6, 5000], ["cta", "Ready to try it?", 0.42, 3000]] },
  "/blog/how-we-write": { title: "How we write 10x faster", sections: [
    ["article", "How we write 10x faster", 1, 45000], ["cta", "Try Brightnote", 0.3, 3000]] },
};

async function send(ip, ua, events) {
  const res = await fetch(`${base}/api/collect`, {
    method: "POST",
    headers: { "content-type": "text/plain", "user-agent": ua[0], "x-forwarded-for": ip, origin: base, referer: `${base}/demo/${siteId}/`, "x-vercel-ip-country": pick(COUNTRIES) },
    body: JSON.stringify({ site: siteId, ctx: { lang: "en-US", tz: "America/New_York", sw: ua[1], vw: ua[1] }, events }),
  });
  if (res.status !== 204) throw new Error(`collect ${res.status}: ${await res.text()}`);
}

async function visit(i) {
  const ip = `203.0.${Math.floor(i / 250)}.${i % 250 + 1}`;
  const ua = pick(UAS);
  const src = weighted(SOURCES);
  let t = Date.now() - Math.floor(Math.random() * 50 * 60_000);
  const entry = weighted([["/", 62], ["/pricing", 14], ["/blog/how-we-write", 16], ["/features", 8]]);
  const events = [];
  let path = entry, prev = null, readTestimonials = false, converted = false;
  for (let step = 0; step < 4 && path; step++) {
    const page = PAGES[path];
    const pv = uuid();
    events.push({ t: "pv", pv, path, title: page.title, prev, q: step === 0 ? src.q ?? "" : "", r: step === 0 ? src.r : "", ts: t });
    const bounce = step === 0 && chance(0.38);
    let pageMs = 0, maxScroll = 10;
    page.sections.forEach(([id, name, reach, read], idx) => {
      if (bounce && idx > 0) return;
      if (!chance(reach * (src.r.includes("google") ? 1.05 : 1))) return;
      const ms = Math.round(read * (0.3 + Math.random() * 1.2) * (bounce ? 0.35 : 1));
      pageMs += ms;
      maxScroll = Math.min(100, Math.round(((idx + 1) / page.sections.length) * 100));
      if (id === "testimonials" && ms >= 1000) readTestimonials = true;
      events.push({ t: "sec", pv, path, sid: id, name, idx, ms, vis: 60 + Math.floor(Math.random() * 40), ts: t + pageMs });
    });
    t += pageMs + 500;
    events.push({ t: "leave", pv, path, ms: pageMs, scroll: maxScroll, final: true, ts: t });
    if (bounce) break;

    // What next: convert, move on, or leave.
    const convP = (readTestimonials ? 0.34 : 0.07) + (path === "/pricing" ? 0.12 : 0) + (src.q?.includes("newsletter") ? 0.08 : 0);
    if (chance(convP)) {
      events.push({ t: "click", pv, path, label: path === "/pricing" ? "Buy Pro" : "Start free trial", kind: "internal", href: `${base}/thank-you`, tpath: "/thank-you", sec: path === "/pricing" ? "plans" : "hero", ts: t });
      const thanks = uuid();
      events.push({ t: "pv", pv: thanks, path: "/thank-you", title: "Welcome", prev: path, q: path === "/pricing" ? "?plan=pro" : "", r: "", ts: t + 800 });
      // Buying Pro reports a purchase (as the demo's thank-you page does); some buyers pay in euros.
      if (path === "/pricing") {
        const eur = chance(0.2);
        events.push({ t: "rev", pv: thanks, path: "/thank-you", amt: eur ? 89 : 96, cur: eur ? "EUR" : "USD", oid: `BN-${uuid().slice(0, 8)}`, src: "datalayer", ts: t + 900 });
      }
      converted = true;
      break;
    }
    const next = path === "/" ? weighted([["/pricing", 45], ["/features", 25], [null, 30]])
      : path === "/blog/how-we-write" ? weighted([["/", 30], ["/pricing", 20], [null, 50]])
      : path === "/features" ? weighted([["/pricing", 50], [null, 50]]) : null;
    if (next) events.push({ t: "click", pv, path, label: next === "/pricing" ? "See pricing" : next === "/features" ? "Features" : "Home", kind: "internal", href: `${base}${next}`, tpath: next, sec: null, ts: t });
    else if (chance(0.15)) events.push({ t: "click", pv, path, label: "GitHub", kind: "external", href: "https://github.com/brightnote", tpath: null, sec: "footer", ts: t });
    prev = path; path = next;
  }
  // Send in batches like the browser does.
  for (let k = 0; k < events.length; k += 20) await send(ip, ua, events.slice(k, k + 20));
  return converted;
}

let conv = 0;
for (let i = 0; i < N; i++) {
  if (await visit(i)) conv++;
  if ((i + 1) % 25 === 0) console.log(`${i + 1}/${N} visits sent`);
}
console.log(`Done: ${N} visits, ${conv} conversions. Open ${base}/sites/${siteId} and pick "Last 24 hours".`);
