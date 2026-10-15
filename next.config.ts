import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Both database drivers stay as plain Node modules: PGlite ships a WASM
  // Postgres that must not be bundled, and postgres.js uses Node sockets.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  async headers() {
    return [
      {
        // The tracker is loaded from every customer site.
        source: "/t.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=300, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
