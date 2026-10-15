// app/api/auth/route.ts — sign up, log in, log out.
import { NextResponse } from "next/server";
import { endSession, hashPassword, newId, startSession, verifyPassword } from "@/lib/auth";
import { one } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { action?: string; email?: string; password?: string; name?: string };
  if (body.action === "logout") {
    await endSession();
    return NextResponse.json({ ok: true });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

  if (body.action === "signup") {
    if (await one("select 1 from users where email = $1", [email])) {
      return NextResponse.json({ error: "An account with this email already exists. Log in instead." }, { status: 409 });
    }
    const id = newId("u");
    await one("insert into users (id, email, name, pass_hash) values ($1, $2, $3, $4) returning id",
      [id, email, (body.name ?? "").trim().slice(0, 80) || null, await hashPassword(password)]);
    await startSession(id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "login") {
    const user = await one<{ id: string; pass_hash: string }>("select id, pass_hash from users where email = $1", [email]);
    if (!user || !(await verifyPassword(password, user.pass_hash))) {
      return NextResponse.json({ error: "Wrong email or password" }, { status: 401 });
    }
    await startSession(user.id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
