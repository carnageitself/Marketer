// app/api/auth/oauth/start/route.ts — GET ?provider=google|microsoft&next=/path
import { NextResponse, type NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { authorizeUrl, isLoginProvider } from "@/lib/oauth-login";
import { appOrigin } from "@/lib/sites";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get("provider");
  const origin = appOrigin(req);
  if (!isLoginProvider(provider)) return NextResponse.redirect(new URL("/login", origin));
  const next = req.nextUrl.searchParams.get("next") ?? "";
  const state = randomBytes(24).toString("base64url");
  const nonce = randomBytes(24).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  let url: string;
  try { url = authorizeUrl(provider, `${origin}/api/auth/oauth/callback/${provider}`, state, challenge, nonce); }
  catch (e) { return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(e instanceof Error ? e.message : String(e))}`, origin)); }
  const res = NextResponse.redirect(url);
  res.cookies.set("pw_oauth", Buffer.from(JSON.stringify({ provider, state, nonce, verifier, next })).toString("base64url"), {
    httpOnly: true, sameSite: "lax", path: "/api/auth/oauth", maxAge: 600, secure: process.env.NODE_ENV === "production",
  });
  return res;
}
