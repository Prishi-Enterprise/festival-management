import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import {
  createDatabase,
  bootstrap,
  asUser,
  ADMIN,
  OUTSIDER,
  draft,
} from "./db-harness";
import type { AttendanceData } from "../src/lib/attendance-data";
import {
  mealTotal,
  expectedDiners,
  type OperationsData,
} from "../src/lib/operations";
let db: PGlite,
  festival: string,
  fixed: string,
  packaged: string,
  unused: string;
const call = async (name: string, ...args: unknown[]) =>
  (
    await asUser<{ v: unknown }>(
      db,
      ADMIN,
      `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) v`,
      args,
    )
  ).rows[0].v;
const read = async (q: object = {}) =>
  (await call("attendance_data", festival, q)) as AttendanceData;
beforeAll(async () => {
  db = await createDatabase();
  await bootstrap(db);
  await call(
    "add_flats",
    "A",
    Array.from({ length: 24 }, (_, i) => String(101 + i)),
  );
  const flats = (
    await db.query<{ id: string }>("select id from flats order by flat_number")
  ).rows;
  festival = (await call("save_festival", {
    ...draft(),
    flat_ids: flats.map((f) => f.id),
  })) as string;
  await call(
    "save_meal_calendar",
    festival,
    ["2026-10-11", "2026-10-12"].flatMap((service_date) => [
      {
        meal: "lunch",
        service_date,
        coverage: "fixed",
        guest_rate: 10000,
        version: 0,
      },
      {
        meal: "dinner",
        service_date,
        coverage: "package",
        guest_rate: 10000,
        version: 0,
      },
      {
        meal: "snacks",
        service_date,
        coverage: "not_served",
        guest_rate: 0,
        version: 0,
      },
    ]),
  );
  const services = (
    await db.query<{ id: string; meal: string }>(
      "select id,meal from meal_services order by service_date",
    )
  ).rows;
  fixed = services.find((s) => s.meal === "lunch")!.id;
  packaged = services.find((s) => s.meal === "dinner")!.id;
  unused = services.find((s) => s.meal === "snacks")!.id;
  const account = randomUUID();
  await call("create_finance_resource", {
    id: account,
    festival_id: festival,
    kind: "account",
    label: "Cash",
    method: "cash",
    holder_id: ADMIN,
  });
  for (const [i, flat] of flats.entries()) {
    const members = [
      { id: randomUUID(), name: "Adult", age_group: "adult" },
      { id: randomUUID(), name: "Child", age_group: "child" },
      { id: randomUUID(), name: "Toddler", age_group: "under_seven" },
    ];
    const receipt = {
      id: randomUUID(),
      festival_id: festival,
      version: 0,
      kind: "collection",
      category: "Fixed contribution",
      category_other: "",
      contact_phone: `+9198765400${String(i).padStart(2, "0")}`,
      flat_id: flat.id,
      account_id: account,
      to_account_id: null,
      vendor_id: null,
      amount: 250000,
      occurred_on: "2026-10-11",
      description: "Fixture",
      reference: "",
      members,
    };
    await call("save_flat_payment", receipt);
    if (i !== 0)
      await call("review_finance_entry", receipt.id, 1, "confirm", "Fixture");
    const packageId = randomUUID();
    await call("save_flat_payment", {
      ...receipt,
      id: packageId,
      category: "Meal package",
      amount: 120000,
      member_ids: [members[0].id],
    });
    if (i % 2 === 0)
      await call("review_finance_entry", packageId, 1, "confirm", "Fixture");
  }
  await db.query(
    `insert into free_package_members select id,jsonb_build_array(members->2->>'id') from flat_enrollments where festival_id=$1`,
    [festival],
  );
  await db.query(
    `insert into resident_rsvps(enrollment_id,service_date,attendees) select id,'2026-10-11',1 from flat_enrollments where festival_id=$1`,
    [festival],
  );
  await db.query(
    `insert into guest_bookings(id,service_id,flat_id,adults,children,under_seven,note,cancelled,attended,created_by,version)
    select gen_random_uuid(),$1,id,2,1,0,'',false,0,$2,1 from flats order by flat_number limit 12`,
    [fixed, ADMIN],
  );
  await db.query(
    "update guest_bookings set cancelled=true where id=(select id from guest_bookings limit 1)",
  );
});
afterAll(async () => db.close());
it("matches existing eligibility and totals for fixed, paid/free package, pending receipts and RSVP with bounded pages", async () => {
  const old = (await call("operations_data", festival)) as OperationsData;
  for (const service of [fixed, packaged]) {
    const rows = old.attendance.filter((a) => a.service_id === service);
    const expected = {
      eligible: rows
        .filter((a) => a.confirmed)
        .reduce((n, a) => n + mealTotal(a), 0),
      rsvped: rows
        .filter((a) => a.confirmed)
        .reduce((n, a) => n + expectedDiners(old, a), 0),
      attended: rows.reduce((n, a) => n + a.attended, 0),
    };
    const seen = new Set<string>();
    for (let page = 0; page < 3; page++) {
      const next = await read({ service, resident_page: page });
      expect(next.totals).toEqual(expected);
      expect(next.enrollments.length).toBeLessThanOrEqual(10);
      expect(next.guests.length).toBeLessThanOrEqual(10);
      expect(next.resident_list.total).toBe(24);
      for (const a of next.attendance) {
        expect(seen.has(a.id)).toBe(false);
        seen.add(a.id);
        const before = rows.find((r) => r.id === a.id)!;
        expect([
          a.adults,
          a.children,
          a.under_seven,
          a.confirmed,
          a.attended,
          a.version,
        ]).toEqual([
          before.adults,
          before.children,
          before.under_seven,
          before.confirmed,
          before.attended,
          before.version,
        ]);
      }
    }
    expect(seen.size).toBe(24);
  }
});
it("normalizes flat/phone searches, clamps pages and keeps meal totals independent", async () => {
  const all = await read({ service: fixed });
  const found = await read({
    service: fixed,
    resident_search: "A–124",
    resident_page: 999,
  });
  expect(found.resident_list).toEqual({ page: 0, pages: 1, total: 1 });
  expect(
    found.flats.find((f) => f.id === found.enrollments[0].flat_id)?.flat_number,
  ).toBe("124");
  expect(found.totals).toEqual(all.totals);
  expect(
    (await read({ service: fixed, resident_search: "9876540023" }))
      .resident_list.total,
  ).toBe(1);
  expect(
    (await read({ service: fixed, resident_search: "%" })).resident_list.total,
  ).toBe(0);
});
it("looks up QR codes beyond the first page and rejects a guest pass for another meal", async () => {
  const last = await read({ service: fixed, resident_page: 2, guest_page: 1 });
  const enrollment = last.enrollments.at(-1)!;
  const resident = await read({
    service: fixed,
    kind: "resident",
    code: enrollment.attendance_code,
  });
  expect(resident.enrollments.map((e) => e.id)).toEqual([enrollment.id]);
  expect(resident.guests).toHaveLength(0);
  const guest = last.guests.at(-1)!;
  expect(
    (
      await read({ service: fixed, kind: "guest", code: guest.pass_code })
    ).guests.map((g) => g.id),
  ).toEqual([guest.id]);
  expect(
    (await read({ service: packaged, kind: "guest", code: guest.pass_code }))
      .guests,
  ).toHaveLength(0);
  expect((await read({ service: fixed, guest: guest.id })).guests[0].id).toBe(
    guest.id,
  );
});
it("keeps contacts accessible without coverage, with zero meal eligibility", async () => {
  const d = await read({ service: unused });
  expect(d.enrollments).toHaveLength(10);
  expect(d.totals.eligible).toBe(0);
});
it("denies anonymous/unassigned access and foreign meal IDs", async () => {
  await expect(
    asUser(db, OUTSIDER, "select attendance_data($1,'{}')", [festival]),
  ).rejects.toThrow("access");
  await expect(read({ service: randomUUID() })).rejects.toThrow("belong");
  await expect(
    db.transaction(async (tx) => {
      await tx.exec("set local role anon");
      await tx.query("select attendance_data($1,'{}')", [festival]);
    }),
  ).rejects.toThrow("permission denied");
});
it("shows fresh check-in versions and separate counts for each guest-package meal", async () => {
  const d = await read({ service: fixed, resident_page: 2 });
  const e = d.enrollments[0];
  await asUser(db, ADMIN, "select check_in_residents($1,$2,0,2)", [
    e.id,
    fixed,
  ]);
  const updated = await read({
    service: fixed,
    kind: "resident",
    code: e.attendance_code,
  });
  expect(updated.attendance[0].attended).toBe(2);
  expect(updated.attendance[0].version).toBe(1);
  await expect(
    asUser(db, ADMIN, "select check_in_residents($1,$2,0,3)", [e.id, fixed]),
  ).rejects.toThrow("changed");
  const packageId = randomUUID(),
    guestId = randomUUID();
  await db.query(
    "insert into guest_packages(id,festival_id,name,service_date,price,service_ids) values($1,$2,'Two meals','2026-10-11',20000,$3)",
    [packageId, festival, [fixed, packaged]],
  );
  await db.query(
    `insert into guest_bookings(id,service_id,flat_id,adults,children,under_seven,note,created_by,package_id,package_name,unit_price,included_services)
    values($1,$2,$3,2,0,0,'',$4,$5,'Two meals',20000,$6)`,
    [guestId, fixed, e.flat_id, ADMIN, packageId, [fixed, packaged]],
  );
  await db.query("insert into guest_meal_checkins values($1,$2,1),($1,$3,2)", [
    guestId,
    fixed,
    packaged,
  ]);
  for (const [service, count] of [
    [fixed, 1],
    [packaged, 2],
  ] as const) {
    const next = await read({ service, guest: guestId });
    expect(next.guests[0].attended).toBe(count);
    expect(next.guests[0].checkins).toEqual([
      { service_id: service, attended: count },
    ]);
    const old = (await call("operations_data", festival)) as OperationsData;
    expect(next.totals.attended).toBe(
      old.attendance
        .filter((a) => a.service_id === service)
        .reduce((n, a) => n + a.attended, 0),
    );
  }
});
it("confirmed refunds remove eligibility without hiding the recorded attendance", async () => {
  const d = await read({ service: fixed, resident_page: 2 });
  const e = d.enrollments[0];
  await db.query(
    `insert into finance_entries(id,festival_id,created_by,status,kind,occurred_on,amount,description,category,account_id,flat_id,confirmed_by,confirmed_at)
    select gen_random_uuid(),festival_id,created_by,'confirmed','refund',occurred_on,amount,'Refund fixture',category,account_id,flat_id,confirmed_by,confirmed_at
    from finance_entries where festival_id=$1 and flat_id=$2 and category='Fixed contribution' and kind='collection'`,
    [festival, e.flat_id],
  );
  const next = await read({
    service: fixed,
    kind: "resident",
    code: e.attendance_code,
  });
  expect(next.enrollments[0].eligible).toBe(false);
  expect(mealTotal(next.attendance[0])).toBe(0);
  expect(next.attendance[0].attended).toBe(2);
  expect(
    (
      await read({
        service: packaged,
        kind: "resident",
        code: e.attendance_code,
      })
    ).attendance[0].adults,
  ).toBe(0);
});
it("denies another society context even to this festival's administrator", async () => {
  await expect(
    db.transaction(async (tx) => {
      await tx.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers',$2,true)",
        [ADMIN, JSON.stringify({ "x-society-id": randomUUID() })],
      );
      await tx.exec("set local role authenticated");
      await tx.query("select attendance_data($1,'{}')", [festival]);
    }),
  ).rejects.toThrow("access");
});
