# Context prompt for Claude chat

Paste everything below the line into a new Claude chat to bring it up to speed.

---

You're helping me build a startup. Here's where things stand.

## The idea

**Pagewise** (working name) is website analytics that works on any website: WordPress, Shopify, Webflow, Wix, Squarespace, Next.js, plain HTML. A customer signs up, enters their domain, and the app does the setup for them. It works out where their DNS is hosted, what they host on and what the site is built with, then gives them one script tag (or installs it for them) and configures their DNS automatically.

The pitch: **"See which parts of your website make you money, and what to fix next."**

How we differ from the competition:
- Google Analytics 4 knows *pages* but not *what's on them*, and it's confusing to use.
- Microsoft Clarity and Hotjar show heatmaps and recordings, but you have to work out the meaning yourself, and they don't connect to revenue.
- Plausible and Fathom are simple and privacy-friendly, but shallow.
- Contentsquare does section-level analysis, but at enterprise prices.

Our angle is **section-level analytics tied to conversions**: how far people read, which sections they actually read, and which sections make visitors convert. Example: "visitors who read your testimonials convert 2.4× more, but only 30% of visitors reach that section." That comes with a plain-language "what to fix next" list. No cookies by default, so no cookie banner is needed. Target customers are small SaaS products, indie founders and small businesses, not enterprises.

Where the idea came from: I built an internal admin panel (ERP) for my product, Preciprocal (preciprocal.com). Its Marketing tab reads first-party analytics from a tracker on my landing page. Pagewise turns that tracker and Marketing tab into a multi-customer product.

## What's built (the MVP, working locally)

Stack: **Next.js 16** (App Router; `params` and `cookies()` are async, and middleware is now called `proxy`), React 19, Tailwind 4, TypeScript. Database: any Postgres via `DATABASE_URL`. Without it, the app uses an embedded Postgres (PGlite) in `./.data`, so it runs with zero setup. The schema is created automatically on first request. Accounts use email and password (scrypt hashes, server-side sessions in an httpOnly cookie).

**Tracker (`public/t.js`).** One tag: `<script defer src="https://APP/t.js" data-site="pw_xxx"></script>`.
- Collects page views, including single-page-app route changes (it hooks pushState and replaceState).
- Measures active time on page (only while the tab is visible) and maximum scroll depth.
- Auto-detects sections with no tagging needed: it uses `[data-section]` when present, otherwise top-level `<section>` elements, otherwise it descends through wrapper divs to the real content blocks. Sticky and fixed elements are ignored.
- Records each section's time on screen and how much of it was visible.
- Records clicks, classified as internal, app (a link to another subdomain of the same site), external, anchor, mailto, tel, button or form submission. Each click is tagged with the section it happened in.
- Supports custom events: `pagewise('track', name, props)`.
- Never collects what visitors type, and stores no cookies.
- Sends data with sendBeacon or keepalive fetch as text/plain, which avoids CORS preflight requests. It also sends a page's data at the moment a link is clicked, because sends during page unload get cancelled.

**Collector (`app/api/collect`).**
- Checks the site ID and that the request comes from the site's own domain.
- Filters bots.
- The visitor key is a sha256 of IP, user agent, a salt, the day and the site ID, so it rotates daily and needs no cookie. A persistent ID in localStorage is used only if the site enables consent mode. Global Privacy Control is respected. The IP is never stored.
- Visits are assigned on the server: a new visit starts after 30 minutes of inactivity.
- Classifies channels: organic, social, AI assistants (ChatGPT, Perplexity, Claude…), referral, paid (UTM tags or click IDs like gclid), email, direct.
- Country comes from Vercel or Cloudflare edge headers.

**Tables:** users, auth_sessions, sites, visits, pageviews, section_views, clicks, custom_events. Every analytics row carries `site_id`.

**Automation (`lib/dns/`).**
- Domain scan:
  - Nameservers identify the DNS provider (Cloudflare, GoDaddy, Vercel, DigitalOcean, Netlify, Route 53, Namecheap, and about 15 more).
  - A and CNAME records plus response headers identify the hosting.
  - The homepage HTML identifies the platform (WordPress, Shopify, Wix, Squarespace, Webflow, Framer, Ghost, Next.js, Nuxt, Astro, single-page apps, plain HTML).
  - Uses public resolvers, and the homepage fetch is protected against SSRF.
- Automatic DNS setup with a token the customer pastes once (never stored):
  - Creates a TXT ownership record and, once deployed, a first-party `t.<domain>` CNAME so ad blockers don't drop tracking.
  - Supports Cloudflare, Vercel, DigitalOcean, GoDaddy and Netlify. It never overwrites existing records.
- Zero-code install for sites behind Cloudflare's proxy: deploys a Cloudflare Worker that adds the tag to every HTML page. It can be removed from the app.
- WordPress: generates a plugin zip with the site's tag built in.
- The setup page checks every 8 seconds whether the tag is installed and the DNS records are live.

**Dashboard tabs:**
- Overview: KPIs with change vs the previous period, a chart, live visitors, and automatic insights.
- Sources: channels, sources, UTM campaigns, landing pages, devices, browsers, operating systems, countries.
- Pages: views, visitors, time on page, scroll depth, entrances and exits. A per-page view shows scroll reach, where visitors came from and went next, and clicks with CTR. Also page-to-page flow.
- **Sections**: a reading funnel showing each section's reach, read time, engagement (3s+), clicks, and the conversion rate of readers vs non-readers as a multiplier. Hidden when fewer than 5 visits are on either side.
- Visitors: a list of visits plus a replay of each visit, showing pages, time per section and clicks.
- Settings: conversion goals, the privacy mode, delete site.

**Goals and insights.** New sites get default conversion goals: clicks to an app subdomain, sign-up or buy-style buttons, and thank-you pages. The rule-based insights cover: the biggest section drop-off, sections that drive conversions, sections that get skimmed, the best-converting source, pages with shallow scrolling, the pages where visits end, and changes in traffic.

**Testing tools:** a built-in demo website at `/demo/<siteId>` and `npm run simulate -- <siteId> 150 <baseUrl>`, which sends realistic visits through the real collector.

**Tested:** the full flow with headless Chrome, scanning real domains, and the build and lint.
**Not tested yet:** automatic DNS setup and the Cloudflare Worker install against real provider accounts.

## Key files

`public/t.js` (tracker) · `app/api/collect/route.ts` · `lib/enrich.ts` · `lib/dns/detect.ts` · `lib/dns/providers.ts` · `lib/dns/records.ts` · `lib/stats.ts` (all reports and insights) · `lib/schema.ts` · `lib/db.ts` · `components/Setup.tsx` · `components/Dashboard.tsx` · `components/DashboardTabs.tsx`

## Not done yet

- Deployment: Vercel plus hosted Postgres, `APP_URL`, `ANALYTICS_SALT`, and for first-party tracking `CNAME_TARGET` plus a Vercel API token so customer subdomains get HTTPS certificates.
- Rate limiting on the collector, and moving to ClickHouse or Tinybird when traffic grows. Reports are currently computed from raw events on every request.
- Domain Connect (one-click DNS without a token), Route 53 and Namecheap APIs.
- Password reset, team members, billing for Pagewise itself.
- Linking Stripe revenue to sections ("which section makes the most money").
- Timezones (charts are in UTC).
- AI-written suggestions to fix weak sections, and A/B testing a section with the same script.

## How I'd like you to help

I'm a solo founder. Be direct, tell me when an idea is weak or already done by someone else, and give recommendations rather than long lists of options. When we talk code, keep it consistent with the stack and files above.
