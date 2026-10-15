// lib/db.ts
// One query function over two drivers:
//   DATABASE_URL set   → postgres.js against any Postgres (Supabase, Neon, RDS…)
//   DATABASE_URL unset → PGlite, an embedded Postgres stored in ./.data, so the
//                        app runs locally with zero setup.
// The schema is created on first use, so there is no migration step to run.
//
// Driver differences to keep in mind when writing SQL here: postgres.js
// returns bigint/numeric as strings while PGlite returns numbers, so every
// aggregate is cast explicitly (::int or ::float8).
import "server-only";
import { SCHEMA } from "./schema";

type Row = Record<string, unknown>;
type Runner = { query: (text: string, params: unknown[]) => Promise<Row[]>; exec: (text: string) => Promise<void> };

const g = globalThis as unknown as { __pwDb?: Promise<Runner> };

async function connect(): Promise<Runner> {
  const url = process.env.DATABASE_URL;
  let runner: Runner;
  if (url) {
    const postgres = (await import("postgres")).default;
    const sql = postgres(url, { max: 5, idle_timeout: 20, prepare: false, onnotice: () => {} });
    runner = {
      query: async (text, params) => (await sql.unsafe(text, params as never[])) as unknown as Row[],
      exec: async text => { await sql.unsafe(text); },
    };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const path = await import("node:path");
    const fs = await import("node:fs");
    const dir = path.join(process.cwd(), ".data", "pglite");
    fs.mkdirSync(dir, { recursive: true });
    const db = await PGlite.create(dir);
    // PGlite runs one statement at a time; queue calls so concurrent requests
    // don't interleave inside a multi-step write.
    let chain: Promise<unknown> = Promise.resolve();
    const serial = <T>(fn: () => Promise<T>) => {
      const next = chain.then(fn, fn);
      chain = next.catch(() => {});
      return next;
    };
    runner = {
      query: (text, params) => serial(async () => (await db.query<Row>(text, params)).rows),
      exec: text => serial(async () => { await db.exec(text); }),
    };
  }
  await runner.exec(SCHEMA);
  return runner;
}

function runner() {
  if (!g.__pwDb) g.__pwDb = connect().catch(e => { g.__pwDb = undefined; throw e; });
  return g.__pwDb;
}

export async function q<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await (await runner()).query(text, params)) as T[];
}

export async function one<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(text, params))[0] ?? null;
}
