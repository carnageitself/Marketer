# Pagewise (MVP)

Website analytics that works on any site: WordPress, Shopify, Webflow, Wix, Squarespace, Next.js, plain HTML.
A customer signs up, pastes their domain, and the app:

1. **Scans the domain**: nameservers → DNS provider, A/CNAME + headers → hosting, homepage HTML → platform.
2. **Gives the right install path** for that platform: one script tag, a ready-made WordPress plugin, or, for sites
   behind Cloudflare's proxy, a zero-code install that deploys a Cloudflare Worker to inject the tag.
3. **Configures DNS automatically** through the provider's API (Cloudflare, Vercel, DigitalOcean, GoDaddy, Netlify).
   It adds a TXT ownership record and, once deployed with `CNAME_TARGET`, a first-party `t.<domain>` CNAME so ad
   blockers don't drop data. Other providers get copy-paste records. Everything is checked automatically every 8s.
4. **Shows the Marketing-tab metrics**: visitors, visits, views, bounce, active time, conversion, channels, sources,
   campaigns, landing pages, devices, countries, page stats, scroll depth, clicks/CTR, page flow, entry/exit,
   section reading funnel, visit replay. On top of those: **which sections make people convert** and a plain-language
   "what to fix next" list.

## Run it

```bash
npm install
npm run dev            # http://localhost:3000, no env vars needed
```

Create an account, add a website, then open the **demo website** link on the setup page to generate real data, or
send ~150 realistic visits through the real collector:

```bash
npm run simulate -- <siteId> 150 http://localhost:3000
```

(The simulator sends the demo page's Referer, which the collector accepts for any site; it writes only to the site
id you pass. Then pick "Last 24 hours".)

## How it works

| Piece | File |
|---|---|
| Tracker (one script tag, ~6 KB gzipped before minifying, no cookies) | `public/t.js` |
| Collector: origin check, bot filter, daily anonymous hash, server-side visits | `app/api/collect/route.ts` |
| Source / channel / device enrichment | `lib/enrich.ts` |
| Domain scan (DNS provider, host, platform) | `lib/dns/detect.ts` |
| DNS provider APIs + Cloudflare Worker install | `lib/dns/providers.ts` |
| Every report and the insights | `lib/stats.ts` |
| Schema (applied automatically) | `lib/schema.ts` |

**Sections without tagging.** The tracker uses `[data-section]` when present, else top-level `<section>` elements,
else descends through wrapper divs (`#__next`, `#root`, page builders) to the real content blocks. Sticky/fixed bars
are ignored. Names come from `aria-label`, the first heading, or the element id.

**Privacy.** By default visitors are a hash of IP + user agent + salt + day, rotating daily, with nothing stored in the
browser, so no cookie banner is needed. Sites that collect consent can turn on persistent IDs (`data-persistent="true"`
or `pagewise('consent', true)`). The IP is never stored. Global Privacy Control is honoured. Provider API tokens are
used for one request and never saved.

**Conversions** come from goals. New sites get defaults that catch most flows with no setup: clicks to an app
subdomain, sign-up/buy-style buttons, thank-you pages. Editable in Settings; custom events via
`pagewise('track', 'Signed up')`.

## Deploying

Set `DATABASE_URL` (any Postgres), `ANALYTICS_SALT` and `APP_URL`. Country data comes from Vercel/Cloudflare edge
headers. For first-party tracking, point a hostname at your deployment, set `CNAME_TARGET` to it, and on Vercel set
`VERCEL_API_TOKEN` + `VERCEL_PROJECT_ID` so customer subdomains get certificates automatically.

## Not in the MVP yet

- Rate limiting on `/api/collect`, and a move to a column store (ClickHouse/Tinybird) at high volume. Reports are
  computed from raw events on every request, which is fine for thousands of visits per day per site.
- Domain Connect (one-click DNS at GoDaddy/IONOS without a token) needs registering a template with each provider.
- Route 53 / Namecheap APIs, password reset, team members, billing, Stripe revenue per section.
- Timezones: charts bucket by UTC.
