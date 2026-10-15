// app/demo/[siteId]/[[...page]]/route.ts
// A small fake marketing site with the real tracker on it, so a new account
// can see data arrive without touching their own website. Deliberately has NO
// data-section attributes: home uses <section> tags, pricing is plain <div>s,
// and /features is reached by an SPA-style pushState, so all three detection
// paths in public/t.js get exercised.
import { appOrigin, getSite } from "@/lib/sites";
import { currentUser } from "@/lib/auth";

export const runtime = "nodejs";

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function layout(base: string, title: string, body: string, origin: string, siteId: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Acme Notes</title>
<script defer src="${origin}/t.js" data-site="${esc(siteId)}"></script>
<style>
  *{box-sizing:border-box} body{margin:0;font:16px/1.6 system-ui,sans-serif;color:#1d1d1f;background:#fff}
  header{display:flex;justify-content:space-between;align-items:center;padding:18px 6vw;border-bottom:1px solid #eee;position:sticky;top:0;background:#fff}
  nav a{margin-left:22px;color:#444;text-decoration:none} .wrap{padding:90px 6vw;max-width:1100px;margin:auto}
  h1{font-size:52px;line-height:1.1;margin:0 0 18px} h2{font-size:34px;margin:0 0 14px}
  .btn{display:inline-block;background:#4f46e5;color:#fff;padding:13px 22px;border-radius:10px;text-decoration:none;border:0;font-size:16px;cursor:pointer}
  .ghost{background:#eef;color:#4f46e5;margin-left:10px} .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}
  .card{border:1px solid #eee;border-radius:14px;padding:24px} .alt{background:#f7f7fb} footer{padding:60px 6vw;background:#111;color:#aaa}
  .tall{min-height:520px}
</style></head><body>
<header><b>Acme Notes</b><nav><a href="${base}">Home</a><a href="${base}/features" data-spa>Features</a><a href="${base}/pricing">Pricing</a><a href="${base}/blog">Blog</a></nav></header>
${body}
<footer><p>© Acme Notes · <a style="color:#aaa" href="mailto:hi@acme.test">hi@acme.test</a> · <a style="color:#aaa" href="https://github.com">GitHub</a></p></footer>
<script>
  // Fake single-page-app navigation for the Features link.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-spa]');
    if (!a) return; e.preventDefault();
    history.pushState({}, '', a.getAttribute('href'));
    document.title = 'Features · Acme Notes';
    document.querySelector('main').innerHTML = ${JSON.stringify(features(base))};
  });
</script>
</body></html>`;
}

function features(base: string) {
  return `<section class="wrap tall"><h2>Everything in one place</h2><p>Notes, tasks and docs that link together.</p></section>
<section class="wrap tall alt"><h2>Works offline</h2><p>Keep writing on the plane.</p></section>
<section class="wrap tall"><h2>Ready to try it?</h2><a class="btn" href="${base}/thank-you">Start free trial</a></section>`;
}

function page(base: string, slug: string): { title: string; body: string } {
  if (slug === "pricing") return {
    title: "Pricing",
    body: `<main><div class="wrap tall"><h1>Simple pricing</h1><p>Start free. Upgrade when your team grows.</p></div>
<div class="wrap tall alt"><div class="grid">
  <div class="card"><h3>Free</h3><p>$0 forever</p><a class="btn ghost" href="${base}/thank-you">Get started</a></div>
  <div class="card"><h3>Pro</h3><p>$8 / month</p><a class="btn" href="${base}/thank-you">Buy Pro</a></div>
  <div class="card"><h3>Team</h3><p>$20 / month</p><button class="btn" onclick="pagewise('track','Contact sales clicked')">Contact sales</button></div>
</div></div>
<div class="wrap tall"><h2>Frequently asked questions</h2><p><b>Can I cancel?</b> Any time.</p><p><b>Is there a trial?</b> 14 days of Pro, free.</p></div></main>`,
  };
  if (slug === "thank-you") return {
    title: "Welcome",
    body: `<main><section class="wrap tall"><h1>Welcome aboard 🎉</h1><p>Your trial has started.</p><a class="btn" href="${base}">Back home</a></section></main>`,
  };
  if (slug === "blog") return {
    title: "Blog",
    body: `<main><section class="wrap tall"><h1>How we write 10x faster</h1><p>${"Long article text. ".repeat(60)}</p></section>
<section class="wrap tall alt"><h2>Try Acme Notes</h2><a class="btn" href="${base}/pricing">See pricing</a></section></main>`,
  };
  if (slug === "features") return { title: "Features", body: `<main>${features(base)}</main>` };
  return {
    title: "Home",
    body: `<main>
<section class="wrap tall"><h1>Your second brain, finally organised</h1><p>Acme Notes turns scattered notes into a searchable knowledge base.</p>
  <a class="btn" href="${base}/thank-you">Start free trial</a><a class="btn ghost" href="${base}/pricing">See pricing</a></section>
<section class="wrap tall alt" id="how-it-works"><h2>How it works</h2><div class="grid"><div class="card">Capture</div><div class="card">Link</div><div class="card">Find</div></div></section>
<section class="wrap tall"><h2>Loved by 20,000 teams</h2><div class="grid"><div class="card">“Changed how we work.” — Dana</div><div class="card">“Finally, one place.” — Lee</div></div></section>
<section class="wrap tall alt"><h2>Integrations</h2><p>Slack, Google Drive, GitHub and 40 more.</p></section>
<section class="wrap tall"><h2>Start today</h2><form onsubmit="event.preventDefault();this.innerHTML='Thanks!'" aria-label="Newsletter signup"><input placeholder="you@company.com"> <button class="btn">Subscribe</button></form></section>
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
  const p = page(base, parts?.[0] ?? "");
  return new Response(layout(base, p.title, p.body, origin, siteId), { headers: { "content-type": "text/html; charset=utf-8" } });
}
