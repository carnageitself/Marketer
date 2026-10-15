// app/demo/[siteId]/[[...page]]/route.ts
// A realistic marketing site for a fictional product ("Brightnote") with the
// real tracker on it, so a new account can see data arrive without touching
// their own website. Deliberately has NO data-section attributes, so every
// detection path in public/t.js gets exercised:
//   home, features, blog post → top-level <section> elements
//   pricing                   → plain <div>s inside <main> (wrapper descent)
//   /features                 → reached by an SPA-style pushState
// Section ids and paths match scripts/simulate.mjs, so simulated and real
// visits land in the same sections.
import { appOrigin, getSite } from "@/lib/sites";
import { currentUser } from "@/lib/auth";

export const runtime = "nodejs";

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

const CSS = `
*{box-sizing:border-box}
:root{--ink:#0f172a;--body:#475569;--muted:#94a3b8;--line:#e2e8f0;--soft:#f8fafc;--brand:#0d9488;--brand-d:#0f766e;--brand-soft:#ccfbf1;--radius:14px}
html{scroll-behavior:smooth}
body{margin:0;font:16px/1.65 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--body);background:#fff;-webkit-font-smoothing:antialiased}
a{color:inherit}
h1,h2,h3,h4{color:var(--ink);letter-spacing:-.02em;margin:0}
h1{font-size:clamp(38px,5.6vw,64px);line-height:1.04;font-weight:700}
h2{font-size:clamp(28px,3.6vw,42px);line-height:1.12;font-weight:700}
h3{font-size:18px;font-weight:650}
p{margin:0}
.c{max-width:1200px;margin:0 auto;padding:0 24px}
.pad{padding:112px 0}
.soft{background:var(--soft);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.eyebrow{display:inline-block;font-size:13px;font-weight:600;color:var(--brand);letter-spacing:.02em;margin-bottom:14px}
.lead{font-size:19px;line-height:1.6;max-width:620px;margin-top:20px}
.center{text-align:center}.center .lead{margin-left:auto;margin-right:auto}
.btn{display:inline-flex;align-items:center;gap:8px;height:48px;padding:0 22px;border-radius:10px;font:600 15px/1 inherit;text-decoration:none;border:0;cursor:pointer;transition:.15s}
.btn-p{background:var(--ink);color:#fff;box-shadow:0 1px 2px rgba(15,23,42,.2)}.btn-p:hover{background:#1e293b}
.btn-b{background:var(--brand);color:#fff}.btn-b:hover{background:var(--brand-d)}
.btn-g{background:#fff;color:var(--ink);border:1px solid var(--line)}.btn-g:hover{border-color:#cbd5e1;background:var(--soft)}
.btns{display:flex;flex-wrap:wrap;gap:12px;margin-top:36px}
header.top{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.85);backdrop-filter:saturate(180%) blur(12px);border-bottom:1px solid var(--line)}
header.top .c{display:flex;align-items:center;gap:36px;height:68px}
.logo{display:flex;align-items:center;gap:10px;font-weight:700;color:var(--ink);text-decoration:none;font-size:17px;letter-spacing:-.01em}
.logo i{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#14b8a6,#0f766e);display:grid;place-items:center;color:#fff;font-style:normal;font-size:15px}
header nav{display:flex;gap:28px;font-size:15px}
header nav a{text-decoration:none;color:var(--body)}header nav a:hover{color:var(--ink)}
header .right{margin-left:auto;display:flex;gap:10px;align-items:center}
header .right .btn{height:40px;padding:0 16px;font-size:14px}
.pill{display:inline-flex;align-items:center;gap:8px;padding:6px 14px 6px 6px;border:1px solid var(--line);border-radius:99px;font-size:13.5px;color:var(--body);background:#fff;text-decoration:none}
.pill b{background:var(--brand-soft);color:var(--brand-d);border-radius:99px;padding:2px 9px;font-size:12px}
.hero{padding:96px 0 0;background:radial-gradient(1000px 500px at 50% -10%,#ccfbf1 0,rgba(255,255,255,0) 70%)}
.hero h1{max-width:900px;margin:22px auto 0}
.logos{display:flex;flex-wrap:wrap;justify-content:center;gap:16px 44px;margin-top:56px;color:var(--muted);font-weight:700;font-size:17px;letter-spacing:-.01em}
.logos span:first-child{width:100%;font-weight:500;font-size:13px;letter-spacing:0;margin-bottom:-4px}
.app{margin:64px auto 0;max-width:1080px;border:1px solid var(--line);border-radius:18px 18px 0 0;border-bottom:0;background:#fff;box-shadow:0 30px 80px -30px rgba(15,23,42,.35);overflow:hidden}
.app .bar{display:flex;gap:7px;padding:14px 16px;border-bottom:1px solid var(--line);background:var(--soft)}
.app .bar i{width:11px;height:11px;border-radius:50%;background:#e2e8f0}
.app .body{display:grid;grid-template-columns:220px 280px 1fr;min-height:360px;text-align:left}
.app .side{border-right:1px solid var(--line);padding:18px;font-size:14px;background:#fcfdfe}
.app .side div{padding:7px 10px;border-radius:7px;margin-bottom:2px}.app .side .on{background:var(--brand-soft);color:var(--brand-d);font-weight:600}
.app .list{border-right:1px solid var(--line)}
.app .list div{padding:16px 18px;border-bottom:1px solid var(--line);font-size:13px}.app .list b{display:block;color:var(--ink);font-size:14px;margin-bottom:2px}
.app .list .on{background:var(--soft)}
.app .doc{padding:28px 32px}.app .doc h4{font-size:22px;margin-bottom:14px}
.ln{height:9px;border-radius:5px;background:#eef2f6;margin:12px 0}.ln.s{width:60%}.ln.m{width:82%}
.tag{display:inline-block;font-size:12px;background:var(--brand-soft);color:var(--brand-d);padding:3px 9px;border-radius:99px;margin-right:6px;font-weight:600}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:64px}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:56px}
.card{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:30px}
.card p{margin-top:10px;font-size:15px}
.num{width:36px;height:36px;border-radius:10px;background:var(--brand-soft);color:var(--brand-d);display:grid;place-items:center;font-weight:700;margin-bottom:22px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:56px;text-align:center}
.stats b{display:block;font-size:44px;color:var(--ink);letter-spacing:-.03em;line-height:1.1}
.quote{font-size:16.5px;color:var(--ink);line-height:1.6}
.who{display:flex;align-items:center;gap:12px;margin-top:24px;font-size:14px}.who b{display:block;color:var(--ink)}
.av{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:700}
.int{display:flex;align-items:center;gap:14px;padding:18px 20px}.int p{margin:0;font-size:13.5px}.int b{color:var(--ink);font-size:15px}
.ic{width:42px;height:42px;border-radius:10px;display:grid;place-items:center;color:#fff;font-weight:700;flex-shrink:0}
.faq{max-width:780px;margin:56px auto 0}
details{border-bottom:1px solid var(--line);padding:22px 0}
summary{cursor:pointer;font-weight:600;color:var(--ink);font-size:17px;list-style:none;display:flex;justify-content:space-between}
summary::after{content:"+";font-weight:400;font-size:22px;line-height:1;color:var(--muted)}details[open] summary::after{content:"–"}
details p{margin-top:12px}
.cta{border-radius:24px;background:linear-gradient(135deg,#0f172a,#134e4a);color:#cbd5e1;padding:72px 48px;text-align:center}
.cta h2{color:#fff}.cta .btns{justify-content:center}
footer.foot{background:#0b1120;color:#94a3b8;padding:72px 0 40px;font-size:14px}
footer .cols{display:grid;grid-template-columns:1.4fr repeat(3,1fr) 1.6fr;gap:40px}
footer h4{color:#fff;font-size:14px;margin-bottom:14px}
footer a{display:block;text-decoration:none;color:#94a3b8;margin-bottom:9px}footer a:hover{color:#fff}
footer .logo{color:#fff;margin-bottom:14px}
footer form{display:flex;gap:8px;margin-top:12px}
footer input{flex:1;min-width:0;height:42px;border-radius:9px;border:1px solid #1e293b;background:#111827;color:#fff;padding:0 12px;font:inherit}
footer form .btn{height:42px;padding:0 16px;font-size:14px}
footer .legal{border-top:1px solid #1e293b;margin-top:56px;padding-top:24px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px}
.plans{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:56px;text-align:left}
.plan{border:1px solid var(--line);border-radius:18px;padding:34px;background:#fff;display:flex;flex-direction:column}
.plan.hot{border:2px solid var(--brand);box-shadow:0 24px 60px -30px rgba(13,148,136,.5);position:relative}
.plan.hot::before{content:"Most popular";position:absolute;top:-13px;left:34px;background:var(--brand);color:#fff;font-size:12px;font-weight:600;padding:4px 12px;border-radius:99px}
.price{font-size:48px;font-weight:700;color:var(--ink);letter-spacing:-.03em;margin:18px 0 4px}.price small{font-size:15px;color:var(--muted);font-weight:500;letter-spacing:0}
.plan ul{list-style:none;padding:0;margin:26px 0 30px;font-size:15px;flex:1}
.plan li{padding:7px 0 7px 28px;position:relative}.plan li::before{content:"✓";position:absolute;left:0;color:var(--brand);font-weight:700}
.plan .btn{justify-content:center;width:100%}
table.cmp{width:100%;border-collapse:collapse;margin-top:48px;font-size:15px;background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden}
.cmp th,.cmp td{padding:16px 22px;border-bottom:1px solid var(--line);text-align:left}.cmp th{color:var(--ink);background:var(--soft)}
.cmp td:not(:first-child),.cmp th:not(:first-child){text-align:center}.cmp tr:last-child td{border-bottom:0}
.split{display:grid;grid-template-columns:1fr 1fr;gap:72px;align-items:center}
.visual{border-radius:20px;border:1px solid var(--line);background:linear-gradient(160deg,#f0fdfa,#fff);min-height:340px;padding:32px}
.article{max-width:720px;margin:0 auto}
.article h1{font-size:clamp(34px,4.6vw,52px)}
.article p{font-size:18px;line-height:1.8;margin-top:24px;color:#334155}
.article h2{font-size:28px;margin-top:48px}
.meta{display:flex;align-items:center;gap:12px;margin-top:28px;font-size:14px}
.post{display:block;text-decoration:none;border:1px solid var(--line);border-radius:18px;overflow:hidden;background:#fff;transition:.15s}.post:hover{box-shadow:0 20px 50px -30px rgba(15,23,42,.35);transform:translateY(-2px)}
.post .img{height:200px;background:linear-gradient(135deg,#99f6e4,#0d9488)}.post div.t{padding:26px}.post h3{font-size:22px;margin:10px 0}
.pw-demo{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:50;display:flex;align-items:center;gap:12px;background:#0f172a;color:#cbd5e1;font-size:13px;padding:9px 10px 9px 16px;border-radius:99px;box-shadow:0 12px 30px rgba(15,23,42,.35);white-space:nowrap}
.pw-demo b{color:#fff}.pw-demo a{background:#fff;color:#0f172a;text-decoration:none;font-weight:600;padding:6px 12px;border-radius:99px}
@media (max-width:900px){
  header nav{display:none}.grid3,.grid4,.plans,.stats{grid-template-columns:1fr}.split{grid-template-columns:1fr;gap:40px}
  footer .cols{grid-template-columns:1fr 1fr}.app .body{grid-template-columns:1fr}.app .side,.app .list{display:none}
  .pad{padding:80px 0}.cta{padding:56px 24px}.pw-demo span{display:none}
}`;

function layout(base: string, title: string, body: string, origin: string, siteId: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Brightnote</title>
<meta name="description" content="Brightnote turns scattered notes into a searchable knowledge base for your team.">
<script defer src="${origin}/t.js" data-site="${esc(siteId)}"></script>
<style>${CSS}</style></head><body>
<header class="top"><div class="c">
  <a class="logo" href="${base}"><i>B</i>Brightnote</a>
  <nav><a href="${base}/features" data-spa>Features</a><a href="${base}/pricing">Pricing</a><a href="${base}/blog">Blog</a><a href="${base}#testimonials">Customers</a></nav>
  <div class="right"><a class="btn btn-g" href="${base}/pricing">Log in</a><a class="btn btn-p" href="${base}/thank-you">Start free trial</a></div>
</div></header>
${body}
<footer class="foot"><div class="c">
  <div class="cols">
    <div><a class="logo" href="${base}"><i>B</i>Brightnote</a><p>Your team&rsquo;s second brain. Notes, docs and tasks that link together.</p></div>
    <div><h4>Product</h4><a href="${base}/features" data-spa>Features</a><a href="${base}/pricing">Pricing</a><a href="${base}#integrations">Integrations</a></div>
    <div><h4>Company</h4><a href="${base}/blog">Blog</a><a href="mailto:hello@brightnote.app">Contact</a><a href="https://github.com/brightnote" rel="noreferrer">GitHub</a></div>
    <div><h4>Resources</h4><a href="${base}#faq">FAQ</a><a href="${base}/blog/how-we-write">Writing guide</a></div>
    <div><h4>Get the newsletter</h4><p>One email a month. No spam.</p>
      <form onsubmit="event.preventDefault();this.innerHTML='<p style=&quot;color:#5eead4&quot;>Thanks, you&rsquo;re subscribed.</p>'" aria-label="Newsletter signup"><input type="email" placeholder="you@company.com" aria-label="Email"><button class="btn btn-b">Subscribe</button></form></div>
  </div>
  <div class="legal"><span>&copy; 2026 Brightnote, Inc.</span><span>Privacy &middot; Terms &middot; Security</span></div>
</div></footer>
<div class="pw-demo"><span><b>Pagewise demo site.</b> Clicks and scrolling here show up in your dashboard.</span><a href="/sites/${esc(siteId)}">Open dashboard &rarr;</a></div>
<script>
  // Fake single-page-app navigation for the Features links.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-spa]');
    if (!a) return; e.preventDefault();
    history.pushState({}, '', a.getAttribute('href'));
    document.title = 'Features · Brightnote';
    document.querySelector('main').innerHTML = ${JSON.stringify(features(base))};
    window.scrollTo(0, 0);
  });
</script>
</body></html>`;
}

function features(base: string) {
  return `<section id="everything" class="pad"><div class="c split">
  <div><span class="eyebrow">Features</span><h1>Everything in one place.</h1><p class="lead">Notes, docs and tasks that link to each other, so the context you need is always one click away.</p>
    <div class="btns"><a class="btn btn-p" href="${base}/thank-you">Start free trial</a></div></div>
  <div class="visual"><span class="tag">Linked</span><span class="tag">Searchable</span><div class="ln m"></div><div class="ln"></div><div class="ln s"></div><div class="ln m"></div><div class="ln"></div><div class="ln s"></div></div>
</div></section>
<section id="offline" class="pad soft"><div class="c split">
  <div class="visual"><span class="tag">Offline</span><div class="ln"></div><div class="ln s"></div><div class="ln m"></div><div class="ln"></div></div>
  <div><span class="eyebrow">Works anywhere</span><h2>Works offline.</h2><p class="lead">Keep writing on the plane. Everything syncs the moment you&rsquo;re back online, with no conflicts to resolve.</p></div>
</div></section>
<section id="cta" class="pad"><div class="c"><div class="cta"><h2>Ready to try it?</h2><p class="lead" style="margin:16px auto 0;color:#cbd5e1">14 days of Pro, free. No card needed.</p>
  <div class="btns"><a class="btn btn-b" href="${base}/thank-you">Start free trial</a><a class="btn btn-g" href="${base}/pricing">See pricing</a></div></div></div></section>`;
}

function page(base: string, parts: string[]): { title: string; body: string } {
  const slug = parts.join("/");
  if (slug === "pricing") return {
    title: "Pricing",
    // Plain <div>s on purpose: exercises the tracker's wrapper-descent path.
    body: `<main>
<div id="plans" class="pad center"><div class="c">
  <span class="eyebrow">Pricing</span><h1>Simple pricing.</h1><p class="lead">Start free. Upgrade when your team grows. Every plan includes unlimited notes.</p>
  <div class="plans">
    <div class="plan"><h3>Free</h3><p>For individuals getting organised.</p><div class="price">$0<small> / forever</small></div>
      <ul><li>Unlimited notes</li><li>2 devices</li><li>7-day history</li></ul><a class="btn btn-g" href="${base}/thank-you">Get started</a></div>
    <div class="plan hot"><h3>Pro</h3><p>For professionals who live in their notes.</p><div class="price">$8<small> / month</small></div>
      <ul><li>Everything in Free</li><li>Unlimited devices</li><li>AI search</li><li>Full version history</li></ul><a class="btn btn-b" href="${base}/thank-you">Buy Pro</a></div>
    <div class="plan"><h3>Team</h3><p>For teams sharing one knowledge base.</p><div class="price">$20<small> / user / mo</small></div>
      <ul><li>Everything in Pro</li><li>Shared workspaces</li><li>Admin &amp; SSO</li><li>Priority support</li></ul><button class="btn btn-p" onclick="pagewise('track','Contact sales clicked')">Contact sales</button></div>
  </div>
</div></div>
<div id="compare" class="pad soft"><div class="c">
  <div class="center"><h2>Compare plans</h2></div>
  <table class="cmp"><tr><th>Feature</th><th>Free</th><th>Pro</th><th>Team</th></tr>
    <tr><td>Notes</td><td>Unlimited</td><td>Unlimited</td><td>Unlimited</td></tr>
    <tr><td>Devices</td><td>2</td><td>Unlimited</td><td>Unlimited</td></tr>
    <tr><td>Version history</td><td>7 days</td><td>Forever</td><td>Forever</td></tr>
    <tr><td>AI search</td><td>&mdash;</td><td>&check;</td><td>&check;</td></tr>
    <tr><td>Shared workspaces</td><td>&mdash;</td><td>&mdash;</td><td>&check;</td></tr>
    <tr><td>SSO &amp; audit log</td><td>&mdash;</td><td>&mdash;</td><td>&check;</td></tr></table>
</div></div>
<div id="faq" class="pad"><div class="c">
  <div class="center"><h2>Frequently asked questions</h2></div>
  <div class="faq">
    <details open><summary>Can I cancel any time?</summary><p>Yes. Cancel from settings in two clicks and you keep access until the end of the billing period.</p></details>
    <details><summary>Is there a free trial of Pro?</summary><p>Every new account gets 14 days of Pro, free. No card needed.</p></details>
    <details><summary>Do you offer discounts?</summary><p>Students, non-profits and open-source maintainers get 50% off. Just email us.</p></details>
  </div>
</div></div>
</main>`,
  };
  if (slug === "thank-you") return {
    title: "Welcome",
    body: `<main><section class="pad center hero" style="min-height:70vh"><div class="c">
  <div class="num" style="margin:0 auto 24px;width:56px;height:56px;font-size:26px;border-radius:16px">&check;</div>
  <h1>Welcome aboard.</h1><p class="lead">Your 14-day Pro trial has started. Check your inbox for a link to the app.</p>
  <div class="btns" style="justify-content:center"><a class="btn btn-p" href="${base}">Back to home</a><a class="btn btn-g" href="${base}/blog">Read the blog</a></div>
</div></section></main>`,
  };
  if (slug === "blog") return {
    title: "Blog",
    body: `<main><section class="pad"><div class="c">
  <span class="eyebrow">Blog</span><h1>Notes on writing and thinking.</h1><p class="lead">Ideas from the Brightnote team on capturing knowledge and working faster.</p>
  <div class="grid3">
    <a class="post" href="${base}/blog/how-we-write"><div class="img"></div><div class="t"><span class="tag">Writing</span><h3>How we write 10x faster</h3><p>The system our team uses to go from scattered notes to finished docs.</p></div></a>
    <a class="post" href="${base}/blog/how-we-write"><div class="img" style="background:linear-gradient(135deg,#bfdbfe,#3b82f6)"></div><div class="t"><span class="tag">Product</span><h3>Linking notes the right way</h3><p>Why backlinks beat folders for anything you want to find again.</p></div></a>
    <a class="post" href="${base}/blog/how-we-write"><div class="img" style="background:linear-gradient(135deg,#fde68a,#f59e0b)"></div><div class="t"><span class="tag">Teams</span><h3>A wiki people actually use</h3><p>Three habits that keep a team knowledge base alive.</p></div></a>
  </div>
</div></section></main>`,
  };
  if (slug === "blog/how-we-write") {
    const para = [
      "Most writing time isn't spent writing. It's spent looking for the thing you wrote last month, the link someone shared in chat, or the decision that was made in a meeting nobody took notes in.",
      "When we started tracking our own time, we found that a two-hour document took about forty minutes to write and eighty minutes to research. The fix wasn't writing faster. It was finding faster.",
      "So we changed one habit: every note links to at least one other note. A meeting note links to the project. A project links to its decisions. A decision links to the data behind it.",
      "Six months later, the same two-hour document takes us about twenty minutes. Not because we type faster, but because everything we need is already connected.",
    ];
    return {
      title: "How we write 10x faster",
      body: `<main><section id="article" class="pad"><div class="c article">
  <span class="tag">Writing</span>
  <h1 style="margin-top:18px">How we write 10x faster</h1>
  <div class="meta"><span class="av" style="background:#0d9488">M</span><span><b style="color:var(--ink)">Maya Chen</b><br>Head of Content &middot; 6 min read</span></div>
  ${para.map(p => `<p>${p}</p>`).join("")}
  <h2>Start with links, not folders</h2>
  ${para.slice().reverse().map(p => `<p>${p}</p>`).join("")}
  <h2>Write the summary first</h2>
  ${para.map(p => `<p>${p}</p>`).join("")}
</div></section>
<section id="cta" class="pad"><div class="c"><div class="cta"><h2>Try Brightnote</h2><p class="lead" style="margin:16px auto 0;color:#cbd5e1">The note-taking app built around links.</p>
  <div class="btns"><a class="btn btn-b" href="${base}/pricing">See pricing</a><a class="btn btn-g" href="${base}/thank-you">Start free trial</a></div></div></div></section></main>`,
    };
  }
  if (slug === "features") return { title: "Features", body: `<main>${features(base)}</main>` };

  const testimonials = [
    ["Changed how our whole team works. We stopped asking “where’s that doc?” in Slack.", "Priya Raman", "COO, Meridian Health", "#0d9488"],
    ["Finally, one place for everything. Onboarding new hires takes days instead of weeks.", "Daniel Okafor", "Engineering Manager, Atlas Freight", "#6366f1"],
    ["The search is uncanny. I find notes I forgot I ever wrote.", "Sofia Marín", "Founder, Beacon Studio", "#f59e0b"],
  ];
  const integrations = [
    ["Slack", "Save messages as notes", "#4a154b"], ["Google Drive", "Link docs and sheets", "#1a73e8"], ["GitHub", "Reference issues and PRs", "#24292f"], ["Figma", "Embed live designs", "#a259ff"],
    ["Linear", "Sync tasks both ways", "#5e6ad2"], ["Notion", "Import in one click", "#111"], ["Zoom", "Auto-notes from calls", "#2d8cff"], ["Calendar", "Notes for every meeting", "#ea4335"],
  ];
  return {
    title: "Your second brain, finally organised",
    body: `<main>
<section id="hero" class="hero center"><div class="c">
  <a class="pill" href="${base}/features" data-spa><b>New</b>AI search across every note &rarr;</a>
  <h1>Your second brain, finally organised.</h1>
  <p class="lead">Brightnote turns scattered notes, docs and links into one searchable knowledge base your whole team can use.</p>
  <div class="btns" style="justify-content:center"><a class="btn btn-p" href="${base}/thank-you">Start free trial</a><a class="btn btn-g" href="${base}/pricing">See pricing</a></div>
  <div class="logos"><span>Trusted by 20,000 teams, including</span><span>Meridian Health</span><span>Atlas Freight</span><span>Beacon Studio</span><span>Halcyon Labs</span><span>Summit Capital</span></div>
  <div class="app"><div class="bar"><i></i><i></i><i></i></div><div class="body">
    <div class="side"><div class="on">All notes</div><div>Projects</div><div>Meetings</div><div>Decisions</div><div>Shared with me</div></div>
    <div class="list"><div class="on"><b>Q3 launch plan</b>Linked to 6 notes &middot; 2h ago</div><div><b>Pricing research</b>Linked to 3 notes &middot; yesterday</div><div><b>Weekly sync, Oct 9</b>Meeting &middot; 3 days ago</div><div><b>Hiring rubric</b>Shared &middot; last week</div></div>
    <div class="doc"><h4>Q3 launch plan</h4><span class="tag">Project</span><span class="tag">Marketing</span><div class="ln m"></div><div class="ln"></div><div class="ln s"></div><div class="ln m"></div><div class="ln s"></div></div>
  </div></div>
</div></section>

<section id="how-it-works" class="pad soft"><div class="c center">
  <span class="eyebrow">How it works</span><h2>From scattered to searchable in three steps.</h2>
  <div class="grid3" style="text-align:left">
    <div class="card"><div class="num">1</div><h3>Capture</h3><p>Write notes, clip pages, or forward emails. Everything lands in one inbox, on any device.</p></div>
    <div class="card"><div class="num">2</div><h3>Link</h3><p>Connect notes to projects, people and decisions. Brightnote suggests links as you type.</p></div>
    <div class="card"><div class="num">3</div><h3>Find</h3><p>Ask a question in plain English and get the answer, with the notes it came from.</p></div>
  </div>
</div></section>

<section id="testimonials" class="pad"><div class="c center">
  <span class="eyebrow">Customers</span><h2>Loved by 20,000 teams.</h2>
  <div class="stats"><div><b>20k+</b>teams</div><div><b>4.9/5</b>average rating</div><div><b>2M</b>notes linked every week</div></div>
  <div class="grid3" style="text-align:left">
    ${testimonials.map(([q, n, r, c]) => `<div class="card"><p class="quote">&ldquo;${q}&rdquo;</p><div class="who"><span class="av" style="background:${c}">${n[0]}</span><span><b>${n}</b>${r}</span></div></div>`).join("")}
  </div>
</div></section>

<section id="integrations" class="pad soft"><div class="c center">
  <span class="eyebrow">Integrations</span><h2>Works with the tools you already use.</h2>
  <p class="lead">Slack, Google Drive, GitHub and 40 more. Set up in a click, no code needed.</p>
  <div class="grid4" style="text-align:left">
    ${integrations.map(([n, d, c]) => `<div class="card int"><span class="ic" style="background:${c}">${n[0]}</span><div><b>${n}</b><p>${d}</p></div></div>`).join("")}
  </div>
</div></section>

<section id="faq" class="pad"><div class="c">
  <div class="center"><span class="eyebrow">FAQ</span><h2>Frequently asked questions</h2></div>
  <div class="faq">
    <details open><summary>Is my data private?</summary><p>Yes. Notes are encrypted at rest and in transit, and we never train models on your content.</p></details>
    <details><summary>Can I import from other apps?</summary><p>One-click import from Notion, Evernote, Google Docs and Markdown files.</p></details>
    <details><summary>Does it work offline?</summary><p>Yes, on desktop and mobile. Changes sync when you reconnect.</p></details>
    <details><summary>How much does it cost?</summary><p>Free for individuals. Pro is $8 a month. <a href="${base}/pricing">See all plans</a>.</p></details>
  </div>
  <div class="cta" style="margin-top:96px"><h2>Start your second brain today.</h2><p class="lead" style="margin:16px auto 0;color:#cbd5e1">14 days of Pro, free. No card needed.</p>
    <div class="btns"><a class="btn btn-b" href="${base}/thank-you">Start free trial</a><a class="btn btn-g" href="${base}/pricing">See pricing</a></div></div>
</div></section>
</main>`,
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ siteId: string; page?: string[] }> }) {
  const { siteId, page: parts } = await params;
  const user = await currentUser();
  const site = await getSite(siteId);
  if (!site || !user || site.user_id !== user.id) return new Response("Demo not found. Open it from your dashboard while signed in.", { status: 404 });
  const origin = appOrigin(req);
  const base = `/demo/${siteId}`;
  const p = page(base, parts ?? []);
  return new Response(layout(base, p.title, p.body, origin, siteId), { headers: { "content-type": "text/html; charset=utf-8" } });
}
