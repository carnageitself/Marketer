// lib/dns/connect.ts
// State for the "sign in to your DNS provider" round trip. The pending flow
// lives in a short-lived httpOnly cookie; the callback only proceeds when the
// `state` the provider hands back matches it (CSRF protection), and site
// ownership is checked again against the signed-in user.
import "server-only";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

export type Via = "cloudflare" | "domainconnect";
export type Intent = "dns" | "worker" | "worker_remove";
export interface Flow { state: string; siteId: string; via: Via; intent: Intent; verifier?: string; provider?: string }

export const FLOW_COOKIE = "pw_connect";
const MAX_AGE = 15 * 60;

export const newState = () => randomBytes(24).toString("base64url");

export function withFlow(res: NextResponse, flow: Flow) {
  res.cookies.set(FLOW_COOKIE, Buffer.from(JSON.stringify(flow)).toString("base64url"), {
    httpOnly: true, sameSite: "lax", path: "/api/connect", maxAge: MAX_AGE, secure: process.env.NODE_ENV === "production",
  });
  return res;
}

export function readFlow(req: Request & { cookies: { get(n: string): { value: string } | undefined } }, state: string | null): Flow | null {
  const raw = req.cookies.get(FLOW_COOKIE)?.value;
  if (!raw || !state) return null;
  try {
    const flow = JSON.parse(Buffer.from(raw, "base64url").toString()) as Flow;
    return flow.state === state ? flow : null;
  } catch { return null; }
}

/** Back to the setup page with a result banner; clears the pending flow. */
export function finish(origin: string, siteId: string | null, ok: boolean, msg: string) {
  const url = new URL(siteId ? `/sites/${siteId}/setup` : "/sites", origin);
  url.searchParams.set("connect", ok ? "ok" : "error");
  url.searchParams.set("msg", msg.slice(0, 300));
  const res = NextResponse.redirect(url);
  res.cookies.set(FLOW_COOKIE, "", { path: "/api/connect", maxAge: 0 });
  return res;
}
