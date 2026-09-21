import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
export const ADMIN = "11111111-1111-4111-8111-111111111111";
export const MEMBER = "22222222-2222-4222-8222-222222222222";
export const OUTSIDER = "33333333-3333-4333-8333-333333333333";
export async function createDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role supabase_auth_admin;
    create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb);
    create table auth.identities(user_id uuid, provider text, identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema public,auth to anon,authenticated,supabase_auth_admin;
    grant execute on all functions in schema auth to anon,authenticated,supabase_auth_admin;
  `);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202609210001_admin_foundation.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  for (const [id, email, name] of [
    [ADMIN, "shivamastha@gmail.com", "Shivam Bhavsar"],
    [MEMBER, "member@example.com", "Committee Member"],
    [OUTSIDER, "outsider@example.com", "Outside User"],
  ]) {
    await db.query("insert into auth.users values ($1,$2,now(),$3)", [
      id,
      email,
      JSON.stringify({ full_name: name }),
    ]);
    await db.query("insert into auth.identities values ($1, $2, $3)", [
      id,
      "google",
      JSON.stringify({ email, email_verified: true }),
    ]);
  }
  return db;
}
export async function asUser<T = Record<string, unknown>>(
  db: PGlite,
  userId: string,
  sql: string,
  args: unknown[] = [],
  provider = "google",
) {
  return db.transaction(async (tx) => {
    await tx.query(
      `select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)`,
      [userId, JSON.stringify({ sub: userId, app_metadata: { provider } })],
    );
    await tx.exec("set local role authenticated");
    return tx.query<T>(sql, args);
  });
}
export async function bootstrap(db: PGlite) {
  await asUser(db, ADMIN, "select public.claim_membership()");
}
export function draft() {
  return {
    name: "Navratri test",
    start_date: "2026-10-11",
    day_count: 2,
    status: "draft",
    version: 0,
    days: [
      {
        day_number: 1,
        service_date: "2026-10-11",
        label: "First day",
        is_dussehra: false,
      },
      {
        day_number: 2,
        service_date: "2026-10-12",
        label: "Dussehra",
        is_dussehra: true,
      },
    ],
    rates: {
      fixed: 250000,
      adult: 120000,
      child: 60000,
      under_seven: 0,
      guest: null,
      household_policy: "unconfirmed",
      guest_age_policy: "unconfirmed",
    },
    flat_ids: [],
    member_ids: [],
  };
}
