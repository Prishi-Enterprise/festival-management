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
let festival: string;
const rows = (names: string[], version = 0) =>
  draft().days.flatMap((d) =>
    names.map((meal) => ({
      meal,
      service_date: d.service_date,
      coverage: "fixed",
      guest_rate: 5000,
      version,
    })),
  );
const save = (services: ReturnType<typeof rows>, user = ADMIN) =>
  asUser(db, user, "select save_meal_calendar($1,$2)", [festival, services]);
beforeAll(async () => {
  db = await createDatabase();
  await bootstrap(db);
  festival = (
    await asUser<{ id: string }>(db, ADMIN, "select save_festival($1) id", [
      draft(),
    ])
  ).rows[0].id;
});
afterAll(async () => {
  await db?.close();
});
it("supports arbitrary named meals and preserves IDs when adding another", async () => {
  await save(rows(["Prasad", "Evening snacks"]));
  const before = (await db.query("select id from meal_services order by id"))
    .rows;
  await save([
    ...rows(["Prasad", "Evening snacks"], 1),
    ...rows(["Community lunch"]),
  ]);
  const after = (
    await db.query(
      "select id from meal_services where meal <> 'Community lunch' order by id",
    )
  ).rows;
  expect(after).toEqual(before);
});
it("rejects incomplete days and case-insensitive duplicate names", async () => {
  await expect(
    save(rows(["Prasad", "Evening snacks", "Community lunch"], 2).slice(1)),
  ).rejects.toThrow("every festival date");
  await expect(save(rows(["Dinner", "dinner"]))).rejects.toThrow(
    "distinct meal names",
  );
});
it("prevents omitted saved meals and stale updates", async () => {
  await expect(save(rows(["Prasad"], 2))).rejects.toThrow("Keep saved meals");
  await expect(
    save(rows(["Prasad", "Evening snacks", "Community lunch"], 0)),
  ).rejects.toThrow("changed");
});
it("does not allow committee users to configure meals", async () => {
  await expect(
    save(rows(["Prasad", "Evening snacks", "Community lunch"], 2), MEMBER),
  ).rejects.toThrow();
});
it("renames and removes unused meals without changing other service IDs", async () => {
  await asUser(db, ADMIN, "select manage_meal($1,'Prasad','Snacks')", [
    festival,
  ]);
  expect(
    (await db.query("select id from meal_services where meal='Snacks'")).rows,
  ).toHaveLength(2);
  await asUser(db, ADMIN, "select manage_meal($1,'Snacks',null)", [festival]);
  expect(
    (await db.query("select id from meal_services where meal='Snacks'")).rows,
  ).toHaveLength(0);
});
it("persists custom child age brackets and rejects invalid ranges", async () => {
  const id = (
    await asUser<{ id: string }>(db, ADMIN, "select save_festival($1) id", [
      {
        ...draft(),
        rates: { ...draft().rates, child_min_age: 5, child_max_age: 12 },
      },
    ])
  ).rows[0].id;
  const result = (
    await asUser<{
      v: { age_brackets: { child_min_age: number; child_max_age: number } };
    }>(db, ADMIN, "select operations_data($1) v", [id])
  ).rows[0].v;
  expect(result.age_brackets).toEqual({ child_min_age: 5, child_max_age: 12 });
  await expect(
    asUser(db, ADMIN, "select save_festival($1)", [
      {
        ...draft(),
        rates: { ...draft().rates, child_min_age: 12, child_max_age: 5 },
      },
    ]),
  ).rejects.toThrow("ordered");
});
it("allows enabling unused meals after enrollment while protecting existing entitlements and check-ins", async () => {
  await asUser(db, ADMIN, "select add_flats('A',array['101'])");
  const flat = (await db.query<{ id: string }>("select id from flats limit 1"))
    .rows[0].id;
  const fid = (
    await asUser<{ id: string }>(db, ADMIN, "select save_festival($1) id", [
      { ...draft(), flat_ids: [flat] },
    ])
  ).rows[0].id;
  const initial = rows(["Dinner"]).map((r) => ({
    ...r,
    coverage: "not_served",
  }));
  await asUser(db, ADMIN, "select save_meal_calendar($1,$2)", [fid, initial]);
  const enrollment = (
    await db.query<{ id: string }>(
      'insert into flat_enrollments(festival_id,flat_id,members,fixed_rate,created_by) values($1,$2,\'[{"name":"Resident"}]\',0,$3) returning id',
      [fid, flat, ADMIN],
    )
  ).rows[0].id;
  const enabled = initial.map((r) => ({ ...r, coverage: "fixed", version: 1 }));
  await asUser(db, ADMIN, "select save_meal_calendar($1,$2)", [fid, enabled]);
  expect(
    (
      await db.query(
        "select id from meal_services where festival_id=$1 and coverage='fixed'",
        [fid],
      )
    ).rows,
  ).toHaveLength(2);
  await expect(
    asUser(db, ADMIN, "select save_meal_calendar($1,$2)", [
      fid,
      enabled.map((r) => ({ ...r, coverage: "package", version: 2 })),
    ]),
  ).rejects.toThrow("Existing enrolled meal coverage");
  const extra = rows(["Snacks"]).map((r) => ({ ...r, coverage: "not_served" }));
  await asUser(db, ADMIN, "select save_meal_calendar($1,$2)", [
    fid,
    [...enabled.map((r) => ({ ...r, version: 2 })), ...extra],
  ]);
  const service = (
    await db.query<{ id: string }>(
      "select id from meal_services where festival_id=$1 and meal='Snacks' order by service_date limit 1",
      [fid],
    )
  ).rows[0].id;
  await db.query(
    "insert into resident_checkins(enrollment_id,service_id,attended) values($1,$2,0)",
    [enrollment, service],
  );
  await expect(
    asUser(db, ADMIN, "select save_meal_calendar($1,$2)", [
      fid,
      [
        ...enabled.map((r) => ({ ...r, version: 3 })),
        ...extra.map((r) => ({ ...r, coverage: "fixed", version: 1 })),
      ],
    ]),
  ).rejects.toThrow("check-ins or catering");
});
