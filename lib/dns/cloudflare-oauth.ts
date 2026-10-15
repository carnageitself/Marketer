// lib/dns/cloudflare-oauth.ts
// "Sign in with Cloudflare": OAuth 2.0 authorization code + PKCE against
// Cloudflare's self-managed OAuth clients (dash → Manage account → OAuth
// clients). The access token is used for the one action the customer asked
// for (DNS records or the Worker install) and then revoked, so, like a pasted
// token, nothing is kept.
//
// Configured with CLOUDFLARE_OAUTH_CLIENT_ID and CLOUDFLARE_OAUTH_CLIENT_SECRET.
// CLOUDFLARE_OAUTH_SCOPES overrides the scopes; they must match the ones the
// client was created with (list valid ids: GET /client/v4/oauth/scopes).
import "server-only";
import { createHash, randomBytes } from "node:crypto";

const AUTHORIZE = "https://dash.cloudflare.com/oauth2/auth";
const TOKEN = "https://dash.cloudflare.com/oauth2/token";
const REVOKE = "https://dash.cloudflare.com/oauth2/revoke";
// DNS records + zone lookup for verification, Workers for the zero-code install.
const DEFAULT_SCOPES = "account:read zone:read dns_records:edit workers_scripts:write workers_routes:write";

export function cloudflareOAuth() {
  const clientId = process.env.CLOUDFLARE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.CLOUDFLARE_OAUTH_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret, scopes: process.env.CLOUDFLARE_OAUTH_SCOPES || DEFAULT_SCOPES } : null;
}

export function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function authorizeUrl(redirectUri: string, state: string, challenge: string): string {
  const cfg = cloudflareOAuth();
  if (!cfg) throw new Error("Cloudflare sign-in isn't configured");
  const qs = new URLSearchParams({
    response_type: "code", client_id: cfg.clientId, redirect_uri: redirectUri, scope: cfg.scopes,
    state, code_challenge: challenge, code_challenge_method: "S256",
  });
  return `${AUTHORIZE}?${qs}`;
}

const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`).toString("base64")}`;

export async function exchangeCode(code: string, verifier: string, redirectUri: string): Promise<string> {
  const cfg = cloudflareOAuth();
  if (!cfg) throw new Error("Cloudflare sign-in isn't configured");
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: basic(cfg.clientId, cfg.clientSecret) },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({})) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) throw new Error(data.error_description ?? data.error ?? `Cloudflare sign-in failed (${res.status})`);
  return data.access_token;
}

/** Best effort: the token is short-lived anyway. */
export async function revoke(token: string) {
  const cfg = cloudflareOAuth();
  if (!cfg) return;
  await fetch(REVOKE, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: basic(cfg.clientId, cfg.clientSecret) },
    body: new URLSearchParams({ token, token_type_hint: "access_token" }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
}
