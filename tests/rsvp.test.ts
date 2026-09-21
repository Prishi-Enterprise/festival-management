import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { createDatabase, bootstrap, asUser, ADMIN, draft } from "./db-harness";
let db: PGlite,
  f: string,
  flat: string,
  account: string,
  code: string,
  enrollment: string,
  date: string;
const member = { id: randomUUID(), name: "Test member", age_group: "adult" };
async function anon(sql: string, args: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role anon");
    return tx.query<Record<string, unknown>>(sql, args);
  });
}
beforeAll(async () => {
  db = await createDatabase();
  await bootstrap(db);
  date = (
    await db.query<{ d: string }>(
      "select ((now() at time zone 'Asia/Kolkata')::date+1)::text d",
    )
  ).rows[0].d;
  await asUser(db, ADMIN, "select add_flats('A',array['101'])");
  flat = (await db.query<{ id: string }>("select id from flats")).rows[0].id;
  const setup = {
    ...draft(),
    day_count: 1,
    start_date: date,
    days: [{ day_number: 1, service_date: date, label: "First day" }],
    flat_ids: [flat],
  };
  f = (
    await asUser<{ id: string }>(db, ADMIN, "select save_festival($1) id", [
      setup,
    ])
  ).rows[0].id;
  await asUser(db, ADMIN, "select save_meal_calendar($1,$2)", [
    f,
    ["breakfast", "lunch", "dinner"].map((meal) => ({
      meal,
      service_date: date,
      coverage: "fixed",
      guest_rate: 0,
      version: 0,
    })),
  ]);
  account = randomUUID();
  await asUser(db, ADMIN, "select create_finance_resource($1)", [
    {
      id: account,
      festival_id: f,
      kind: "account",
      label: "Cash",
      method: "cash",
      holder_id: ADMIN,
    },
  ]);
  const input = {
    id: randomUUID(),
    festival_id: f,
    kind: "collection",
    category: "Fixed contribution",
    category_other: "",
    amount: 250000,
    flat_id: flat,
    account_id: account,
    version: 0,
    description: "Fixed contribution",
    reference: "",
    occurred_on: date,
    members: [member],
  };
  await expect(
    asUser(db, ADMIN, "select save_flat_payment($1)", [input]),
  ).rejects.toThrow("phone");
  await asUser(db, ADMIN, "select save_flat_payment($1)", [
    { ...input, contact_phone: "+919876543210" },
  ]);
  const e = (
    await db.query<{ id: string; rsvp_code: string }>(
      "select id,rsvp_code from flat_enrollments",
    )
  ).rows[0];
  code = e.rsvp_code;
  enrollment = e.id;
});
afterAll(async () => db.close());
it("private link defaults to all fixed attendees without exposing names or full phone", async () => {
  const r = (await anon("select resident_rsvp($1) v", [code])).rows[0].v as {
    maximum: number;
    phone_hint: string;
    days: { attendees: number }[];
  };
  expect(r.maximum).toBe(1);
  expect(r.phone_hint).toBe("3210");
  expect(r.days[0].attendees).toBe(1);
  expect(JSON.stringify(r)).not.toContain("Test member");
  expect(JSON.stringify(r)).not.toContain("+919876543210");
  expect(
    (await anon("select resident_rsvp($1) v", [randomUUID()])).rows[0].v,
  ).toBeNull();
  await expect(anon("select * from flat_enrollments")).rejects.toThrow(
    "permission",
  );
});
it("unauthenticated RSVP edits enforce limits, day, optimistic version and eligibility separation", async () => {
  await expect(
    anon("select save_resident_rsvp($1,$2,2,0)", [code, date]),
  ).rejects.toThrow("exceed");
  await anon("select save_resident_rsvp($1,$2,0,0)", [code, date]);
  await expect(
    anon("select save_resident_rsvp($1,$2,1,0)", [code, date]),
  ).rejects.toThrow("changed");
  await expect(
    anon("select save_resident_rsvp($1,'2000-01-01',1,0)", [code]),
  ).rejects.toThrow("closed");
  expect((await db.query("select * from resident_checkins")).rows).toHaveLength(
    0,
  );
  expect(
    (
      await db.query<{ v: boolean }>("select private.fixed_paid($1) v", [
        enrollment,
      ])
    ).rows[0].v,
  ).toBe(false);
  await anon("select save_resident_rsvp($1,$2,1,1)", [code, date]);
});
it("admin can replace contact and revoke old bearer link; closed dates cannot change", async () => {
  await asUser(db, ADMIN, "select update_flat_contact($1,$2,true)", [
    enrollment,
    "+919999999999",
  ]);
  expect(
    (await anon("select resident_rsvp($1) v", [code])).rows[0].v,
  ).toBeNull();
  await expect(
    anon("select save_resident_rsvp($1,$2,0,2)", [code, date]),
  ).rejects.toThrow("not available");
  code = (
    await db.query<{ rsvp_code: string }>(
      "select rsvp_code from flat_enrollments",
    )
  ).rows[0].rsvp_code;
  await db.query(
    "update meal_services set attendance_locked=true where festival_id=$1",
    [f],
  );
  await expect(
    anon("select save_resident_rsvp($1,$2,0,2)", [code, date]),
  ).rejects.toThrow("closed");
});
