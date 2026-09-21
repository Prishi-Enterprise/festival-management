import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import {
  createDatabase,
  bootstrap,
  asUser,
  ADMIN,
  MEMBER,
  OUTSIDER,
  draft,
} from "./db-harness";
const RADHE = "00000000-0000-4000-8000-000000000001",
  SUPER = randomUUID();
let db: PGlite,
  second: string,
  fa: string,
  fb: string,
  flatA: string,
  flatB: string;
async function scoped<T = Record<string, unknown>>(
  user: string,
  society: string,
  sql: string,
  args: unknown[] = [],
) {
  return db.transaction(async (tx) => {
    await tx.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers',$2,true)",
      [user, JSON.stringify({ "x-society-id": society })],
    );
    await tx.exec("set local role authenticated");
    return tx.query<T>(sql, args);
  });
}
beforeAll(async () => {
  db = await createDatabase();
  await bootstrap(db);
  await db.query("insert into auth.users values($1,$2,now(),$3)", [
    SUPER,
    "sb@prishi.in",
    "{}",
  ]);
  second = (
    await asUser<{ id: string }>(db, SUPER, "select save_society($1) id", [
      { name: "Another society", version: 0 },
    ])
  ).rows[0].id;
  await scoped(
    SUPER,
    second,
    "select invite_member('outsider@example.com','admin')",
  );
  await asUser(db, OUTSIDER, "select claim_membership()");
  await scoped(ADMIN, RADHE, "select add_flats('A',array['101'])");
  await scoped(OUTSIDER, second, "select add_flats('A',array['101'])");
  flatA = (await scoped<{ id: string }>(ADMIN, RADHE, "select id from flats"))
    .rows[0].id;
  flatB = (
    await scoped<{ id: string }>(OUTSIDER, second, "select id from flats")
  ).rows[0].id;
  fa = (
    await scoped<{ id: string }>(ADMIN, RADHE, "select save_festival($1) id", [
      { ...draft(), flat_ids: [flatA] },
    ])
  ).rows[0].id;
  fb = (
    await scoped<{ id: string }>(
      OUTSIDER,
      second,
      "select save_festival($1) id",
      [{ ...draft(), flat_ids: [flatB] }],
    )
  ).rows[0].id;
});
afterAll(async () => db.close());
it("only official super admin manages societies; defaults preserve current branding", async () => {
  await expect(
    scoped(ADMIN, RADHE, "select save_society($1)", [
      { name: "Unauthorized", version: 0 },
    ]),
  ).rejects.toThrow("Super admin");
  const r = await asUser<{ v: { superadmin: boolean; societies: unknown[] } }>(
    db,
    SUPER,
    "select my_societies() v",
  );
  expect(r.rows[0].v.superadmin).toBe(true);
  expect(r.rows[0].v.societies).toHaveLength(2);
  expect(flatA).not.toBe(flatB);
});
it("RLS and RPCs deny spoofed society context, direct records and reports", async () => {
  expect(
    (await scoped(ADMIN, second, "select * from festivals")).rows,
  ).toHaveLength(0);
  expect(
    (await scoped(ADMIN, second, "select * from society_memberships")).rows,
  ).toHaveLength(0);
  expect(
    (await scoped(ADMIN, RADHE, "select * from festivals")).rows,
  ).toHaveLength(1);
  for (const fn of [
    "get_festival_detail",
    "finance_report",
    "operations_data",
    "finance_choices",
  ])
    await expect(
      scoped(ADMIN, RADHE, `select ${fn}($1)`, [fb]),
    ).rejects.toThrow();
  await expect(
    scoped(ADMIN, second, "select add_flats('B',array['201'])"),
  ).rejects.toThrow("Admin");
  await expect(
    scoped(ADMIN, RADHE, "select save_festival($1)", [
      { ...draft(), flat_ids: [flatB] },
    ]),
  ).rejects.toThrow("society");
  await expect(
    scoped(
      ADMIN,
      RADHE,
      "select invite_member('member@example.com','committee',array[$1::uuid])",
      [fb],
    ),
  ).rejects.toThrow("society");
});
it("same user has independent roles and assignments in two societies", async () => {
  await scoped(
    ADMIN,
    RADHE,
    "select invite_member('member@example.com','admin',array[$1::uuid])",
    [fa],
  );
  await scoped(
    OUTSIDER,
    second,
    "select invite_member('member@example.com','committee',array[$1::uuid])",
    [fb],
  );
  await asUser(db, MEMBER, "select claim_membership()");
  expect(
    (
      await asUser<{ v: { societies: unknown[] } }>(
        db,
        MEMBER,
        "select my_societies() v",
      )
    ).rows[0].v.societies,
  ).toHaveLength(2);
  expect(
    (
      await scoped<{ role: string }>(
        MEMBER,
        RADHE,
        "select role from society_memberships where user_id=$1",
        [MEMBER],
      )
    ).rows[0].role,
  ).toBe("admin");
  await expect(
    scoped(MEMBER, second, "select add_flats('B',array['201'])"),
  ).rejects.toThrow("Admin");
  const member = (
    await scoped<{ version: number }>(
      ADMIN,
      RADHE,
      "select version from society_memberships where user_id=$1",
      [MEMBER],
    )
  ).rows[0];
  await scoped(ADMIN, RADHE, "select update_member($1)", [
    {
      user_id: MEMBER,
      role: "committee",
      active: false,
      version: member.version,
      festival_ids: [],
    },
  ]);
  expect(
    (await scoped(MEMBER, second, "select * from festivals")).rows,
  ).toHaveLength(1);
  expect(
    (await scoped(MEMBER, RADHE, "select * from festivals")).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query(
        "select * from festival_memberships where user_id=$1 and festival_id=$2",
        [MEMBER, fb],
      )
    ).rows,
  ).toHaveLength(1);
});
it("logo upload policies allow only super admin", async () => {
  await db.exec(
    "grant usage on schema storage to authenticated;grant insert on storage.objects to authenticated;",
  );
  await expect(
    scoped(
      ADMIN,
      RADHE,
      "insert into storage.objects values(gen_random_uuid(),'society-logos','test.png')",
    ),
  ).rejects.toThrow("row-level security");
  await scoped(
    SUPER,
    second,
    "insert into storage.objects values(gen_random_uuid(),'society-logos','test.png')",
  );
});
