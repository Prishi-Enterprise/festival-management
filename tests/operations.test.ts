import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { OperationsData } from "../src/lib/operations";
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
let db: PGlite,
  f: string,
  flat: string,
  cash: string,
  vendor: string,
  fixedMeal: string,
  packageMeal: string,
  enrollment: string;
const people = [
  { id: randomUUID(), name: "Resident adult", age_group: "adult" },
  { id: randomUUID(), name: "Resident child", age_group: "child" },
  { id: randomUUID(), name: "Resident toddler", age_group: "under_seven" },
];
const call = (name: string, p: unknown, user = MEMBER) =>
  asUser(db, user, `select public.${name}($1) v`, [p]);
const review = (id: string, version: number, action = "confirm") =>
  asUser(
    db,
    ADMIN,
    "select public.review_finance_entry($1,$2,$3,'Test review')",
    [id, version, action],
  );
function receipt(category = "Fixed contribution", amount = 250000) {
  return {
    id: randomUUID(),
    festival_id: f,
    version: 0,
    kind: "collection",
    category,
    category_other: "",
    flat_id: flat,
    account_id: cash,
    to_account_id: null,
    vendor_id: null,
    amount,
    occurred_on: "2026-10-11",
    description: "Test receipt",
    reference: "",
  };
}
async function data(user = MEMBER) {
  return (
    await asUser<{ v: OperationsData }>(
      db,
      user,
      "select public.operations_data($1) v",
      [f],
    )
  ).rows[0].v;
}
beforeAll(async () => {
  db = await createDatabase();
  await bootstrap(db);
  await asUser(
    db,
    ADMIN,
    "select public.invite_member('member@example.com','committee')",
  );
  await asUser(db, MEMBER, "select public.claim_membership()");
  await asUser(db, ADMIN, "select public.add_flats('A',array['101'])");
  flat = (await db.query<{ id: string }>("select id from public.flats")).rows[0]
    .id;
  f = (
    await asUser<{ v: string }>(
      db,
      ADMIN,
      "select public.save_festival($1) v",
      [{ ...draft(), flat_ids: [flat], member_ids: [MEMBER] }],
    )
  ).rows[0].v;
  cash = randomUUID();
  vendor = randomUUID();
  await call(
    "create_finance_resource",
    {
      id: cash,
      festival_id: f,
      kind: "account",
      label: "Member cash",
      method: "cash",
      holder_id: MEMBER,
    },
    ADMIN,
  );
  await call(
    "create_finance_resource",
    { id: vendor, festival_id: f, kind: "vendor", label: "Caterer" },
    ADMIN,
  );
  fixedMeal = randomUUID();
  packageMeal = randomUUID();
  await db.query(
    "insert into public.meal_services(id,festival_id,service_date,meal,coverage,guest_rate) values($1,$3,'2026-10-11','lunch','fixed',20000),($2,$3,'2026-10-11','dinner','package',20000)",
    [fixedMeal, packageMeal, f],
  );
});
afterAll(async () => db.close());
it("fixed enrollment is atomic, idempotent and requires full confirmed contribution for admission", async () => {
  const p = { ...receipt(), members: people };
  await call("save_flat_payment", p);
  await call("save_flat_payment", p);
  expect(
    (await db.query("select * from public.flat_enrollments")).rows,
  ).toHaveLength(1);
  enrollment = (
    await db.query<{ id: string }>("select id from public.flat_enrollments")
  ).rows[0].id;
  await expect(
    asUser(db, MEMBER, "select public.check_in_residents($1,$2,0,1)", [
      enrollment,
      fixedMeal,
    ]),
  ).rejects.toThrow("eligible");
  await review(p.id, 1);
  let d = await data();
  expect(
    d.attendance.find((a) => a.id === enrollment && a.service_id === fixedMeal)!
      .adults,
  ).toBe(1);
  await asUser(db, MEMBER, "select public.check_in_residents($1,$2,0,2)", [
    enrollment,
    fixedMeal,
  ]);
  await expect(
    asUser(db, MEMBER, "select public.check_in_residents($1,$2,0,2)", [
      enrollment,
      fixedMeal,
    ]),
  ).rejects.toThrow("changed");
  await expect(
    asUser(db, MEMBER, "select public.check_in_residents($1,$2,1,4)", [
      enrollment,
      fixedMeal,
    ]),
  ).rejects.toThrow("exceeds");
  await review(p.id, 2, "unlock");
  d = await data();
  expect(
    d.attendance.find((a) => a.id === enrollment && a.service_id === fixedMeal)!
      .confirmed,
  ).toBe(false);
  expect(
    d.attendance.find((a) => a.id === enrollment && a.service_id === fixedMeal)!
      .attended,
  ).toBe(2);
  await expect(
    asUser(db, MEMBER, "select public.check_in_residents($1,$2,1,3)", [
      enrollment,
      fixedMeal,
    ]),
  ).rejects.toThrow("eligible");
  await review(p.id, 3);
});
it("package attendees must be a subset and only confirmed package receipts enable them", async () => {
  await expect(
    call("save_flat_payment", {
      ...receipt("Meal package", 120000),
      member_ids: [randomUUID()],
    }),
  ).rejects.toThrow("fixed attendees");
  const p = { ...receipt("Meal package", 120000), member_ids: [people[0].id] };
  await call("save_flat_payment", p);
  await call("save_flat_payment", p);
  await expect(
    call("save_flat_payment", { ...p, member_ids: [people[1].id] }),
  ).rejects.toThrow("Retry changed");
  expect(
    (await data()).attendance.find(
      (a) => a.id === enrollment && a.service_id === packageMeal,
    )!.adults,
  ).toBe(0);
  await review(p.id, 1);
  expect(
    (await data()).attendance.find(
      (a) => a.id === enrollment && a.service_id === packageMeal,
    )!.adults,
  ).toBe(1);
  expect(
    (await data()).attendance.find(
      (a) => a.id === enrollment && a.service_id === packageMeal,
    )!.children,
  ).toBe(0);
  await expect(
    call("save_finance_entry", { ...p, version: 1 }),
  ).rejects.toThrow("flat payment form");
});
it("guest passes enforce service, quantity, cancellation, cutoff and stale-update checks", async () => {
  const g = {
    id: randomUUID(),
    service_id: fixedMeal,
    flat_id: flat,
    version: 0,
    adults: 2,
    children: 0,
    under_seven: 1,
    note: "",
    cancelled: false,
  };
  const guestEntry = {
    ...receipt("Guest meals", 60000),
    ...g,
    guest_id: null,
    payment_mode: "collected",
  };
  await expect(call("save_guest_booking", g)).rejects.toThrow(
    "Create a guest entry",
  );
  await call("save_guest_payment", guestEntry);
  await call("save_guest_payment", guestEntry);
  const saved = (await data()).guests.find((x) => x.id === g.id)!;
  const pass = (
    await db.query<{ v: { count: number; flat_id?: string } }>(
      "select public.guest_pass($1) v",
      [saved.pass_code],
    )
  ).rows[0].v;
  expect(pass.count).toBe(3);
  expect(pass.flat_id).toBeUndefined();
  await expect(
    asUser(db, MEMBER, "select public.check_in_guest($1,$2,1,1)", [
      g.id,
      packageMeal,
    ]),
  ).rejects.toThrow("different meal");
  await expect(
    asUser(db, MEMBER, "select public.check_in_guest($1,$2,1,4)", [
      g.id,
      fixedMeal,
    ]),
  ).rejects.toThrow();
  await asUser(db, MEMBER, "select public.check_in_guest($1,$2,1,2)", [
    g.id,
    fixedMeal,
  ]);
  await expect(
    asUser(db, MEMBER, "select public.check_in_guest($1,$2,1,3)", [
      g.id,
      fixedMeal,
    ]),
  ).rejects.toThrow("changed");
  await expect(
    call("save_guest_booking", { ...g, version: 2, cancelled: true }),
  ).rejects.toThrow();
  await asUser(db, MEMBER, "select public.check_in_guest($1,$2,2,0)", [
    g.id,
    fixedMeal,
  ]);
  await call("save_guest_booking", { ...g, version: 3, cancelled: true });
  await expect(
    asUser(db, MEMBER, "select public.check_in_guest($1,$2,4,1)", [
      g.id,
      fixedMeal,
    ]),
  ).rejects.toThrow("cancelled");
  await asUser(
    db,
    ADMIN,
    "select public.set_meal_access($1,1,true,null,'Close list')",
    [fixedMeal],
  );
  await expect(
    call("save_guest_payment", { ...guestEntry, id: randomUUID() }),
  ).rejects.toThrow("closed");
});
it("catering generates one bill and allocations cannot exceed a confirmed supplier payment", async () => {
  const c = {
    id: randomUUID(),
    service_id: fixedMeal,
    version: 0,
    bill_version: 0,
    vendor_id: vendor,
    ordered: 10,
    served: 9,
    billed: 10,
    unit_rate: 20000,
    extras: 0,
    note: "",
  };
  await call("save_catering", c, ADMIN);
  await call("save_catering", c, ADMIN);
  const run = (await data(ADMIN)).catering![0];
  expect(
    (await db.query("select * from public.finance_entries where kind='bill'"))
      .rows,
  ).toHaveLength(1);
  await review(run.bill_id!, 1);
  await expect(
    call(
      "save_catering",
      { ...c, version: 1, bill_version: 1, ordered: 11 },
      ADMIN,
    ),
  ).rejects.toThrow("unlock");
  const pay = {
    ...receipt("Catering", 100000),
    kind: "payment",
    flat_id: null,
    vendor_id: vendor,
  };
  await call("save_finance_entry", pay);
  await review(pay.id, 1);
  await asUser(
    db,
    ADMIN,
    "select public.allocate_catering_payment($1,$2,100000,0)",
    [c.id, pay.id],
  );
  await expect(
    asUser(
      db,
      ADMIN,
      "select public.allocate_catering_payment($1,$2,100001,1)",
      [c.id, pay.id],
    ),
  ).rejects.toThrow("exceeds");
  await expect(review(pay.id, 2, "unlock")).rejects.toThrow("allocations");
  const committee = await data();
  expect(committee.finance).toBeUndefined();
  expect(committee.allocations).toBeUndefined();
  expect(committee.catering_quantities).toHaveLength(1);
});
it("events enforce categories, ownership, duplicate enrollment and closed registration", async () => {
  const event = {
    id: randomUUID(),
    festival_id: f,
    version: 0,
    title: "Mahila Aarati",
    service_date: "2026-10-11",
    category: "Mahila Aarati",
    category_other: "",
    registration_closed: false,
  };
  await expect(call("save_festival_event", event)).rejects.toThrow();
  await call("save_festival_event", event, ADMIN);
  const p = {
    id: randomUUID(),
    event_id: event.id,
    version: 0,
    flat_id: flat,
    name: "Test participant",
    category: "Adult",
    category_other: "",
    sequence: 1,
    theme: "",
    note: "",
    cancelled: false,
  };
  await call("save_event_participant", p);
  await call("save_event_participant", p);
  await expect(
    call("save_event_participant", { ...p, id: randomUUID() }),
  ).rejects.toThrow();
  await call(
    "save_festival_event",
    { ...event, version: 1, registration_closed: true },
    ADMIN,
  );
  await expect(
    call("save_event_participant", {
      ...p,
      id: randomUUID(),
      name: "Another resident",
    }),
  ).rejects.toThrow("closed");
  await asUser(db, MEMBER, "select public.check_in_event($1,1,true)", [p.id]);
});
it("unassigned users cannot read operations or admit attendees, and direct writes are denied", async () => {
  await expect(data(OUTSIDER)).rejects.toThrow("access");
  await expect(
    asUser(db, OUTSIDER, "select public.check_in_residents($1,$2,0,1)", [
      enrollment,
      fixedMeal,
    ]),
  ).rejects.toThrow();
  await expect(
    asUser(db, MEMBER, "update public.guest_bookings set attended=1"),
  ).rejects.toThrow("permission");
});
it("under-seven package registration is free and cannot be used for adults", async () => {
  const before = (await db.query("select id from public.finance_entries")).rows
    .length;
  await call("save_flat_payment", {
    ...receipt("Meal package", 0),
    member_ids: [people[2].id],
  });
  expect(
    (await db.query("select id from public.finance_entries")).rows.length,
  ).toBe(before);
  expect(
    (await data()).attendance.find(
      (a) => a.id === enrollment && a.service_id === packageMeal,
    )!.under_seven,
  ).toBe(1);
  await expect(
    call("save_flat_payment", {
      ...receipt("Meal package", 0),
      member_ids: [people[0].id],
    }),
  ).rejects.toThrow("under-seven");
});

it("links payee dues to passes without cash, and reconciles only confirmed settlements", async () => {
  const p = {
    ...receipt("Guest meals", 40000),
    service_id: packageMeal,
    guest_id: null,
    payment_mode: "payee_due",
    account_id: null,
    vendor_id: vendor,
    adults: 2,
    children: 0,
    under_seven: 0,
    note: "",
  };
  const before = (await db.query("select * from public.finance_entries")).rows
    .length;
  await call("save_guest_payment", p);
  await call("save_guest_payment", p);
  expect(
    (await db.query("select * from public.finance_entries")).rows,
  ).toHaveLength(before);
  expect((await data()).guests.find((g) => g.id === p.id)?.payment_status).toBe(
    "payee_due",
  );
  await asUser(db, MEMBER, "select public.check_in_guest($1,$2,1,1)", [
    p.id,
    packageMeal,
  ]);
  const settle = {
    ...receipt("Guest meals", 20000),
    service_id: packageMeal,
    guest_id: p.id,
    payment_mode: "collected",
  };
  await call("save_guest_payment", settle);
  await call("save_guest_payment", settle);
  const due = async (user = MEMBER) =>
    (
      await asUser<{ v: { id: string; confirmed: number; pending: number }[] }>(
        db,
        user,
        "select public.guest_due_report($1) v",
        [f],
      )
    ).rows[0].v.find((d) => d.id === p.id)!;
  expect(await due()).toMatchObject({ confirmed: 0, pending: 20000 });
  await expect(
    call("save_guest_payment", { ...settle, id: randomUUID(), amount: 30000 }),
  ).rejects.toThrow("exceeds");
  await expect(
    call("save_finance_entry", { ...settle, version: 1, kind: "donation" }),
  ).rejects.toThrow("pass link");
  await review(settle.id, 1);
  expect(await due()).toMatchObject({ confirmed: 20000, pending: 0 });
  await review(settle.id, 2, "unlock");
  expect(await due()).toMatchObject({ confirmed: 0, pending: 20000 });
  await expect(
    call("save_guest_payment", { ...p, guest_id: p.id, version: 1 }),
  ).rejects.toThrow("Payments already exist");
  await expect(
    asUser(db, OUTSIDER, "select public.guest_due_report($1)", [f]),
  ).rejects.toThrow();
  await expect(
    asUser(db, MEMBER, "select * from public.guest_dues"),
  ).rejects.toThrow();
});
it("rolls back pass creation if its receipt is invalid and rejects cross-festival or wrong-flat links", async () => {
  const p = {
    ...receipt("Guest meals", 20000),
    service_id: packageMeal,
    guest_id: null,
    payment_mode: "collected",
    adults: 1,
    children: 0,
    under_seven: 0,
    note: "",
  };
  await expect(
    call("save_guest_payment", { ...p, account_id: randomUUID() }),
  ).rejects.toThrow();
  expect(
    (await db.query("select * from public.guest_bookings where id=$1", [p.id]))
      .rows,
  ).toHaveLength(0);
  await expect(
    call("save_guest_payment", { ...p, festival_id: randomUUID() }),
  ).rejects.toThrow();
  await call("save_guest_payment", p);
  await expect(
    call("save_guest_payment", {
      ...p,
      id: randomUUID(),
      guest_id: p.id,
      flat_id: randomUUID(),
    }),
  ).rejects.toThrow("same flat");
  await expect(
    call("save_guest_payment", { ...p, adults: 2 }),
  ).rejects.toThrow();
  expect(
    (
      await db.query(
        "select * from public.guest_receipt_links where guest_id=$1",
        [p.id],
      )
    ).rows,
  ).toHaveLength(1);
  await expect(
    call("save_guest_payment", { ...p, id: randomUUID() }, OUTSIDER),
  ).rejects.toThrow();
});
