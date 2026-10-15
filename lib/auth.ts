// lib/auth.ts
// Email + password accounts with server-side sessions. Passwords are scrypt
// hashed; the session cookie holds a random token and only its sha256 is
// stored, so a database leak doesn't hand out live sessions.
import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { one, q } from "./db";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const SESSION_COOKIE = "pw_session";
const SESSION_DAYS = 30;

export interface SessionUser { id: string; email: string; name: string | null }

export const newId = (prefix: string, bytes = 12) => `${prefix}_${randomBytes(bytes).toString("base64url")}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [algo, saltHex, keyHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !keyHex) return false;
  const key = await scrypt(pw, Buffer.from(saltHex, "hex"), 64);
  const want = Buffer.from(keyHex, "hex");
  return key.length === want.length && timingSafeEqual(key, want);
}

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await q("insert into auth_sessions (token_hash, user_id, expires_at) values ($1, $2, $3)", [sha256(token), userId, expires.toISOString()]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", expires,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await q("delete from auth_sessions where token_hash = $1", [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Works in server components and route handlers. */
export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return one<SessionUser>(
    `select u.id, u.email, u.name from auth_sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [sha256(token)],
  );
}
