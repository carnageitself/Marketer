// Per-platform install steps. The detected platform is shown first.
export interface Guide { id: string; name: string; steps: (snippet: string, siteId: string, origin: string) => string[]; code?: (snippet: string, siteId: string, origin: string) => string }

const src = (snippet: string) => snippet.match(/src="([^"]+)"/)?.[1] ?? "";

export const GUIDES: Guide[] = [
  {
    id: "wordpress", name: "WordPress",
    steps: () => [
      "Download the plugin below (it already contains your site ID).",
      "In WordPress: Plugins → Add New → Upload Plugin → choose the zip → Install Now → Activate.",
      "That's it. Visits from logged-in editors aren't counted, so check from a private window.",
    ],
  },
  {
    id: "shopify", name: "Shopify",
    steps: () => ["Online Store → Themes → ⋯ → Edit code.", "Open layout/theme.liquid.", "Paste the tag just before </head> and Save."],
  },
  {
    id: "wix", name: "Wix",
    steps: () => ["Settings → Custom code (under Advanced) → + Add Custom Code.", "Paste the tag, choose All pages, place it in Head, Apply.", "Requires a Premium plan with a connected domain."],
  },
  {
    id: "squarespace", name: "Squarespace",
    steps: () => ["Settings → Developer tools → Code injection.", "Paste the tag into Header and Save."],
  },
  {
    id: "webflow", name: "Webflow",
    steps: () => ["Site settings → Custom code.", "Paste the tag into Head code, Save, then Publish the site."],
  },
  {
    id: "framer", name: "Framer",
    steps: () => ["Site Settings → General → Custom Code.", "Paste the tag in “Start of <head> tag”, then Publish."],
  },
  {
    id: "ghost", name: "Ghost",
    steps: () => ["Settings → Code injection.", "Paste the tag into Site Header and Save."],
  },
  {
    id: "nextjs", name: "Next.js",
    steps: () => ["Add this to your root layout (app/layout.tsx) inside <body>. Route changes are tracked automatically."],
    code: (snippet, siteId) => `import Script from "next/script";\n\n<Script src="${src(snippet)}" data-site="${siteId}" strategy="afterInteractive" />`,
  },
  {
    id: "spa", name: "React / Vue / Vite",
    steps: () => ["Paste the tag into index.html, inside <head>. Route changes are tracked automatically."],
  },
  {
    id: "gtm", name: "Google Tag Manager",
    steps: () => ["Tags → New → Custom HTML.", "Paste the tag, trigger: All Pages (Initialization). Submit / Publish."],
  },
  {
    id: "html", name: "HTML / anything else",
    steps: () => ["Paste the tag into every page, inside <head>. If your site has a shared header/template file, put it there once."],
  },
];

export function guideFor(platformId: string | undefined): string {
  if (!platformId) return "html";
  if (GUIDES.some(g => g.id === platformId)) return platformId;
  if (["nuxt", "gatsby", "astro"].includes(platformId)) return "spa";
  return "html";
}
