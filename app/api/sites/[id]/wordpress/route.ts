// app/api/sites/[id]/wordpress/route.ts
// A ready-made WordPress plugin with this site's tag baked in:
// Plugins → Add New → Upload Plugin → Activate. No theme editing.
import { NextResponse } from "next/server";
import { appOrigin, requireSite, scriptOrigin } from "@/lib/sites";
import { zip } from "@/lib/zip";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const r = await requireSite((await params).id);
  if (r instanceof NextResponse) return r;
  const { site } = r;
  const src = `${scriptOrigin(site, appOrigin(req))}/t.js`;
  const php = `<?php
/**
 * Plugin Name: Pagewise Analytics
 * Description: Adds the Pagewise tracker for ${site.domain} to every page. Cookieless by default.
 * Version: 1.0.0
 * Author: Pagewise
 */
if (!defined('ABSPATH')) exit;

add_action('wp_head', function () {
  // Don't count logged-in editors browsing their own site.
  if (is_user_logged_in() && current_user_can('edit_posts')) return;
  echo '<script defer src="' . esc_url(${JSON.stringify(src).replace(/"/g, "'")}) . '" data-site="' . esc_attr('${site.id}') . '"></script>' . "\\n";
}, 1);
`;
  const body = zip([{ name: "pagewise-analytics/pagewise-analytics.php", data: php }]);
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="pagewise-analytics.zip"`,
    },
  });
}
