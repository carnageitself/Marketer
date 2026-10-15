import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { Icon, Logo, type IconName } from "@/components/icons";
import Pricing from "@/components/Pricing";

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: "sections", title: "Section-level analytics", body: "Every block on every page is detected automatically. See how far people read and how long each section holds them." },
  { icon: "target", title: "Tied to conversions", body: "Compare readers with non-readers. Find the testimonial, demo or pricing table that actually moves people to buy." },
  { icon: "sparkle", title: "What to fix next", body: "A plain-language list of the biggest drop-offs, skimmed sections and pages where visits end, ranked by impact." },
  { icon: "bolt", title: "Setup does itself", body: "Paste your domain. We find your DNS provider, host and platform, then install the tag or add the DNS records for you." },
  { icon: "shield", title: "No cookie banner", body: "Visitors are counted with a hash that rotates daily. Nothing is stored in the browser and IPs are never kept." },
  { icon: "visitors", title: "Visit replay", body: "Follow a single visit page by page and section by section, with every click in order. No screen recording needed." },
];

const COMPARE: [string, string, string, string, string][] = [
  ["", "Pagewise", "Google Analytics 4", "Hotjar / Clarity", "Plausible / Fathom"],
  ["Knows what's on each page", "yes", "no", "Heatmaps only", "no"],
  ["Sections linked to conversions", "yes", "no", "no", "no"],
  ["Tells you what to fix", "yes", "no", "no", "no"],
  ["Automatic setup", "yes", "no", "no", "no"],
  ["No cookie banner needed", "yes", "no", "no", "yes"],
  ["Simple to read", "yes", "no", "yes", "yes"],
];

const FUNNEL = [
  { name: "Hero", reach: 100, lift: null },
  { name: "How it works", reach: 78, lift: 1.3 },
  { name: "Testimonials", reach: 31, lift: 2.4 },
  { name: "Integrations", reach: 24, lift: 1.1 },
  { name: "FAQ", reach: 12, lift: 0.9 },
];

export default async function Home() {
  if (await currentUser()) redirect("/sites");
  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3.5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5"><Logo size={26} /><span className="text-[15px] font-semibold tracking-tight">Pagewise</span></Link>
          <nav className="hidden gap-6 text-[13.5px] text-muted md:flex">
            <a href="#features" className="hover:text-ink">Features</a>
            <a href="#compare" className="hover:text-ink">Compare</a>
            <a href="#setup" className="hover:text-ink">Setup</a>
            <a href="#pricing" className="hover:text-ink">Pricing</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/login" className="rounded-lg px-3 py-2 text-[13.5px] font-medium text-muted hover:text-ink">Log in</Link>
            <Link href="/login?mode=signup" className="rounded-lg bg-accent px-3.5 py-2 text-[13.5px] font-medium text-on-accent shadow-card hover:bg-accent-hover">Get started</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative">
          <div className="pointer-events-none absolute left-1/2 top-0 h-130 w-[900px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 pb-24 pt-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:px-8 lg:pt-28">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-[12.5px] font-medium text-muted shadow-card">
                <span className="h-1.5 w-1.5 rounded-full bg-good" />Works on any website
              </span>
              <h1 className="mt-6 text-[42px] font-semibold leading-[1.05] tracking-tight sm:text-[56px]">
                See which parts of your website make you money.
              </h1>
              <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-muted">
                Pagewise shows how far people read, which sections they actually read, and which ones turn visitors into customers.
                Then it tells you what to fix next.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/login?mode=signup" className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-5 text-[14px] font-medium text-on-accent shadow-card hover:bg-accent-hover">
                  Start free<Icon name="arrowRight" size={15} />
                </Link>
                <Link href="/login" className="inline-flex h-11 items-center rounded-lg border border-line bg-panel px-5 text-[14px] font-medium shadow-card hover:bg-panel-2">Log in</Link>
              </div>
              <p className="mt-5 text-[12.5px] text-faint">One script tag · WordPress, Shopify, Webflow, Wix, Squarespace, Next.js, HTML</p>
            </div>

            {/* Product preview */}
            <div className="rounded-2xl border border-line bg-panel p-2 shadow-pop">
              <div className="rounded-xl border border-line bg-bg p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[13px] font-semibold">Reading funnel · /</div>
                    <div className="text-[12px] text-muted">Last 30 days · 4,812 views</div>
                  </div>
                  <span className="rounded-full bg-good-soft px-2 py-0.5 text-[11.5px] font-medium text-good">Live</span>
                </div>
                <div className="mt-5 space-y-3.5">
                  {FUNNEL.map(f => (
                    <div key={f.name}>
                      <div className="flex items-center justify-between text-[12.5px]">
                        <span className="font-medium">{f.name}</span>
                        <span className="flex items-center gap-2">
                          <span className="tabular text-muted">{f.reach}% reach</span>
                          {f.lift && <span className={`tabular rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${f.lift >= 1.5 ? "bg-good-soft text-good" : f.lift < 1 ? "bg-bad-soft text-bad" : "bg-panel-2 text-muted"}`}>{f.lift}× conv.</span>}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-panel-2"><div className="h-full rounded-full bg-accent" style={{ width: `${f.reach}%`, opacity: 0.35 + f.reach / 160 }} /></div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex gap-3 rounded-lg border border-line bg-panel p-3.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Icon name="sparkle" size={11} /></span>
                  <div>
                    <div className="text-[12.5px] font-semibold">Move “Testimonials” up</div>
                    <div className="mt-0.5 text-[12px] leading-relaxed text-muted">Visitors who read it convert 2.4× more, but only 31% of them get that far.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="border-t border-line bg-panel">
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <div className="text-[13px] font-semibold text-accent">Why Pagewise</div>
              <h2 className="mt-2 text-[34px] font-semibold leading-tight tracking-tight">Analytics that know what&apos;s on the page.</h2>
              <p className="mt-4 text-[15.5px] leading-relaxed text-muted">Most tools count page views. Pagewise measures the sections inside them and connects each one to revenue.</p>
            </div>
            <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(f => (
                <div key={f.title} className="bg-panel p-7">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent"><Icon name={f.icon} size={18} /></span>
                  <h3 className="mt-5 text-[15px] font-semibold">{f.title}</h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="compare" className="border-t border-line">
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
            <h2 className="text-[34px] font-semibold leading-tight tracking-tight">How it compares</h2>
            <p className="mt-4 max-w-2xl text-[15.5px] leading-relaxed text-muted">Section-level analysis used to mean enterprise tools and enterprise prices. Pagewise is built for small SaaS teams, founders and small businesses.</p>
            <div className="mt-10 overflow-x-auto rounded-2xl border border-line bg-panel shadow-card">
              <table className="w-full min-w-[680px] text-[13.5px]">
                <thead>
                  <tr className="border-b border-line">
                    {COMPARE[0].map((h, i) => <th key={i} className={`px-5 py-4 text-left font-semibold ${i === 1 ? "bg-accent-soft/60 text-accent" : ""}`}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.slice(1).map(row => (
                    <tr key={row[0]} className="border-b border-line last:border-0">
                      {row.map((c, i) => (
                        <td key={i} className={`px-5 py-3.5 ${i === 0 ? "font-medium" : "text-muted"} ${i === 1 ? "bg-accent-soft/60" : ""}`}>
                          {c === "yes" ? <Icon name="check" size={16} strokeWidth={2.5} className={i === 1 ? "text-accent" : "text-good"} /> : c === "no" ? <span className="text-faint">—</span> : c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="setup" className="border-t border-line bg-panel">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.2fr] lg:px-8">
            <div>
              <h2 className="text-[34px] font-semibold leading-tight tracking-tight">Live in two minutes.</h2>
              <p className="mt-4 text-[15.5px] leading-relaxed text-muted">No developer needed. Pagewise works out how your site is built and gives you the one install path that fits.</p>
            </div>
            <ol className="space-y-4">
              {[
                ["Paste your domain", "We look up your nameservers, hosting and platform: Cloudflare, GoDaddy, Vercel, WordPress, Shopify and more."],
                ["We install it for you", "A zero-code Cloudflare install, a ready-made WordPress plugin, or one script tag with steps for your platform."],
                ["Watch the data arrive", "Setup checks itself every few seconds. Your first insights show up as soon as visitors do."],
              ].map(([t, b], i) => (
                <li key={t} className="flex gap-4 rounded-xl border border-line bg-bg p-5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-on-accent">{i + 1}</span>
                  <div>
                    <div className="text-[15px] font-semibold">{t}</div>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="pricing" className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <div className="text-[13px] font-semibold text-accent">Pricing</div>
              <h2 className="mt-2 text-[34px] font-semibold leading-tight tracking-tight">Start free. Upgrade when it pays for itself.</h2>
              <p className="mt-4 text-[15.5px] leading-relaxed text-muted">No credit card to start. Every plan includes automatic setup and cookie-free tracking.</p>
            </div>
            <div className="mt-12"><Pricing /></div>
          </div>
        </section>

        <section className="border-t border-line bg-panel">
          <div className="mx-auto max-w-7xl px-4 py-24 text-center sm:px-6 lg:px-8">
            <h2 className="mx-auto max-w-2xl text-[34px] font-semibold leading-tight tracking-tight">Find out what your website is really doing.</h2>
            <Link href="/login?mode=signup" className="mt-8 inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-5 text-[14px] font-medium text-on-accent shadow-card hover:bg-accent-hover">
              Start free<Icon name="arrowRight" size={15} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-[12.5px] text-muted sm:px-6 lg:px-8">
          <span className="flex items-center gap-2"><Logo size={20} />Pagewise</span>
          <span>Privacy-first website analytics. No cookies.</span>
        </div>
      </footer>
    </div>
  );
}
