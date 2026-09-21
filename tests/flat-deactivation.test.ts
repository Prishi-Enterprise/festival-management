import { beforeAll, afterAll, it, expect } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  createDatabase,
  bootstrap,
  asUser,
  ADMIN,
  MEMBER,
  draft,
} from "./db-harness";
let db: PGlite;
let flat: string, festival: string;
beforeAll(async () => {
  db = await createDatabase();
  await bootstrap(db);
  await asUser(db, ADMIN, "select public.add_flats('A',array['101'])");
  flat = (await db.query<{ id: string }>("select id from public.flats")).rows[0]
    .id;
  festival = (
    await asUser<{ id: string }>(
      db,
      ADMIN,
      "select public.save_festival($1) id",
      [{ ...draft(), flat_ids: [flat] }],
    )
  ).rows[0].id;
  await db.query(
    "insert into public.finance_entries(id,festival_id,created_by,kind,occurred_on,amount,description,flat_id,category) values(gen_random_uuid(),$1,$2,'charge','2026-10-11',100,'Historical charge',$3,'Fixed contribution')",
    [festival, ADMIN, flat],
  );
});
afterAll(async () => db.close());
it("only society admins can deactivate their own flats", async () => {
  await expect(
    asUser(db, MEMBER, "select public.deactivate_flats($1)", [[flat]]),
  ).rejects.toThrow();
  const other = (
    await db.query<{ id: string }>(
      "insert into public.societies(name) values('Other society') returning id",
    )
  ).rows[0].id;
  const foreignFlat = (
    await db.query<{ id: string }>(
      "insert into public.flats(society_id,block,flat_number) values($1,'Z','101') returning id",
      [other],
    )
  ).rows[0].id;
  await expect(
    asUser(db, ADMIN, "select public.deactivate_flats($1)", [[foreignFlat]]),
  ).rejects.toThrow("Choose flats in this society");
});
it("deactivation and replacement preserve historical identity and festival membership", async () => {
  await asUser(db, ADMIN, "select public.deactivate_flats($1)", [[flat]]);
  await asUser(db, ADMIN, "select public.add_flats('A',array['101'])");
  const rows = (
    await db.query<{ id: string; active: boolean }>(
      "select id,active from public.flats where block='A'",
    )
  ).rows;
  expect(rows).toHaveLength(2);
  expect(rows.find((r) => r.id === flat)?.active).toBe(false);
  expect(rows.find((r) => r.active)?.id).not.toBe(flat);
  expect(
    (
      await db.query<{ flat_id: string }>(
        "select flat_id from public.finance_entries",
      )
    ).rows[0].flat_id,
  ).toBe(flat);
  await asUser(db, ADMIN, "select public.save_festival($1)", [
    { ...draft(), id: festival, version: 1, flat_ids: [] },
  ]);
  expect(
    (
      await db.query(
        "select * from public.festival_flats where festival_id=$1 and flat_id=$2",
        [festival, flat],
      )
    ).rows,
  ).toHaveLength(1);
  await asUser(db, ADMIN, "select public.add_flats('A',array['101'])");
  expect(
    (await db.query("select id from public.flats where block='A'")).rows,
  ).toHaveLength(2);
});
it("inactive flats cannot join a new festival or receive a new enrollment", async () => {
  await expect(
    asUser(db, ADMIN, "select public.save_festival($1)", [
      { ...draft(), flat_ids: [flat] },
    ]),
  ).rejects.toThrow("Inactive flats");
  await expect(
    db.query(
      'insert into public.flat_enrollments(festival_id,flat_id,members,fixed_rate,created_by) values($1,$2,\'[{"name":"Resident"}]\',0,$3)',
      [festival, flat, ADMIN],
    ),
  ).rejects.toThrow("This flat is inactive");
});
