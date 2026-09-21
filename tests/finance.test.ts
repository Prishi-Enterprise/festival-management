import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import {
  ADMIN,
  MEMBER,
  OUTSIDER,
  asUser,
  bootstrap,
  createDatabase,
  draft,
} from "./db-harness";
let db: PGlite;
let festival: string;
let flat: string;
let cash: string;
let online: string;
let vendor: string;
async function save(input: Record<string, unknown>, user = MEMBER) {
  return asUser(db, user, "select public.save_finance_entry($1)", [input]);
}
function entry(kind: string, amount = 10000) {
  return {
    id: randomUUID(),
    festival_id: festival,
    version: 0,
    kind,
    occurred_on: "2026-09-21",
    amount,
    description: "Test entry",
    category: "Other",
    category_other: "Test category",
    reference: "",
    account_id: cash,
    to_account_id: null,
    flat_id:
      kind === "collection" || kind === "refund" || kind === "charge"
        ? flat
        : null,
    vendor_id: kind === "bill" || kind === "payment" ? vendor : null,
  };
}
async function review(
  id: string,
  version: number,
  action = "confirm",
  user = ADMIN,
  reason = "Correction required",
) {
  return asUser(db, user, "select public.review_finance_entry($1,$2,$3,$4)", [
    id,
    version,
    action,
    reason,
  ]);
}
async function totals() {
  return (
    await asUser<{ v: Record<string, number> }>(
      db,
      MEMBER,
      "select public.finance_overview($1) v",
      [festival],
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
  festival = (
    await asUser<{ v: string }>(
      db,
      ADMIN,
      "select public.save_festival($1) v",
      [{ ...draft(), flat_ids: [flat], member_ids: [MEMBER] }],
    )
  ).rows[0].v;
  cash = randomUUID();
  online = randomUUID();
  vendor = randomUUID();
  for (const x of [
    {
      id: cash,
      kind: "account",
      label: "Member cash",
      method: "cash",
      holder_id: MEMBER,
    },
    {
      id: online,
      kind: "account",
      label: "Admin online",
      method: "online",
      holder_id: ADMIN,
    },
    { id: vendor, kind: "vendor", label: "Caterer" },
  ])
    await asUser(db, ADMIN, "select public.create_finance_resource($1)", [
      { ...x, festival_id: festival },
    ]);
});
afterAll(async () => {
  await db.close();
});
describe("Finance ownership, approval and custody", () => {
  let receipt: ReturnType<typeof entry>;
  it("records a retry exactly once and leaves unconfirmed money out of totals", async () => {
    receipt = entry("collection", 50000);
    await save(receipt);
    await save(receipt);
    expect(
      (await db.query("select id from public.finance_entries")).rows,
    ).toHaveLength(1);
    expect((await totals()).cash).toBe(0);
    await expect(save({ ...receipt, amount: 60000 })).rejects.toThrow(
      "changed",
    );
  });
  it("blocks other owners, non-admin confirmation, direct writes and unassigned access", async () => {
    await expect(save({ ...receipt, version: 1 }, ADMIN)).rejects.toThrow(
      "creator",
    );
    await expect(review(receipt.id, 1, "confirm", MEMBER)).rejects.toThrow(
      "Admin access",
    );
    await expect(save(entry("donation"), OUTSIDER)).rejects.toThrow(
      "Festival access",
    );
    await expect(
      asUser(db, MEMBER, "update public.finance_entries set amount=1"),
    ).rejects.toThrow("permission denied");
    await expect(
      asUser(db, MEMBER, "select public.finance_report($1)", [festival]),
    ).rejects.toThrow("Admin access");
  });
  it("confirms once, locks editing, unlocks with reversal and reconfirms revised amount", async () => {
    await review(receipt.id, 1);
    expect((await totals()).cash).toBe(50000);
    await expect(review(receipt.id, 1)).rejects.toThrow("changed");
    await expect(
      save({ ...receipt, version: 2, amount: 60000 }),
    ).rejects.toThrow("locked");
    await expect(review(receipt.id, 2, "unlock", ADMIN, "")).rejects.toThrow(
      "reason",
    );
    await review(receipt.id, 2, "unlock");
    expect((await totals()).cash).toBe(0);
    await save({ ...receipt, version: 3, amount: 60000 });
    await review(receipt.id, 4);
    expect((await totals()).cash).toBe(60000);
    expect(
      (
        await db.query(
          "select id from public.finance_postings where entry_id=$1",
          [receipt.id],
        )
      ).rows,
    ).toHaveLength(3);
  });
  it("transfers conserve funds and prevent overdrafts", async () => {
    const t = { ...entry("transfer", 20000), to_account_id: online };
    await save(t);
    await review(t.id, 1);
    expect((await totals()).cash).toBe(40000);
    expect((await totals()).online).toBe(20000);
    const tooMuch = entry("payment", 50000);
    await save(tooMuch);
    await expect(review(tooMuch.id, 1)).rejects.toThrow("Insufficient");
    await review(tooMuch.id, 1, "void", MEMBER);
    await expect(review(receipt.id, 5, "unlock")).rejects.toThrow("dependent");
  });
  it("keeps supplier advance payments separate from recognized bill costs", async () => {
    const pay = entry("payment", 10000);
    await save(pay);
    await review(pay.id, 1);
    const bill = { ...entry("bill", 15000), account_id: null };
    await save(bill);
    await review(bill.id, 1);
    const t = await totals();
    expect(t.expenses).toBe(15000);
    expect(t.payments).toBe(10000);
    expect(t.cash).toBe(30000);
    const r = (
      await asUser<{ r: { vendors: { billed: number; paid: number }[] } }>(
        db,
        ADMIN,
        "select public.finance_report($1) r",
        [festival],
      )
    ).rows[0].r;
    expect(r.vendors[0]).toMatchObject({ billed: 15000, paid: 10000 });
  });
  it("does not expose other members' entries or named balances to committee", async () => {
    const donation = entry("donation", 2000);
    await save(donation, ADMIN);
    await review(donation.id, 1);
    expect(
      (
        await asUser(
          db,
          MEMBER,
          "select * from public.finance_entries where id=$1",
          [donation.id],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (await asUser(db, MEMBER, "select * from public.finance_postings")).rows,
    ).toHaveLength(0);
    expect((await totals()).collections).toBe(62000);
  });
  it("rejects forged kinds, fractional amounts, self-transfers and cross-festival accounts", async () => {
    await expect(
      save({ ...entry("bill"), account_id: cash }),
    ).rejects.toThrow();
    await expect(save(entry("opening"))).rejects.toThrow("Admin access");
    await expect(save(entry("donation", 1.5))).rejects.toThrow("integer paise");
    await expect(
      save({ ...entry("transfer"), to_account_id: cash }),
    ).rejects.toThrow();
    const other = (
      await asUser<{ v: string }>(
        db,
        ADMIN,
        "select public.save_festival($1) v",
        [draft()],
      )
    ).rows[0].v;
    await expect(
      save({ ...entry("donation"), festival_id: other }, ADMIN),
    ).rejects.toThrow();
  });
  it("uses charges and net receipts for flat statements without treating charges as cash", async () => {
    const charge = { ...entry("charge", 70000), account_id: null };
    await save(charge, ADMIN);
    await review(charge.id, 1);
    const refund = entry("refund", 1000);
    await save(refund);
    await review(refund.id, 1);
    const r = (
      await asUser<{ r: { flats: { charged: number; paid: number }[] } }>(
        db,
        ADMIN,
        "select public.finance_report($1) r",
        [festival],
      )
    ).rows[0].r;
    expect(r.flats[0]).toMatchObject({ charged: 70000, paid: 59000 });
    expect((await totals()).cash).toBe(31000);
  });
});
it("rejects refunds beyond the flat's confirmed payments", async () => {
  const excess = entry("refund", 70000);
  await save(excess);
  await expect(review(excess.id, 1)).rejects.toThrow("Refund exceeds");
  await review(excess.id, 1, "void", MEMBER);
});
describe("Configurable meal coverage", () => {
  let services: {
    service_date: string;
    meal: string;
    coverage: string;
    guest_rate: number | null;
    version: number;
  }[];
  it("supports fixed lunch + dinner on any day and package lunch on another", async () => {
    services = draft().days.flatMap((d, i) =>
      ["breakfast", "lunch", "dinner"].map((meal) => ({
        service_date: d.service_date,
        meal,
        coverage:
          i === 0
            ? meal === "breakfast"
              ? "not_served"
              : "fixed"
            : meal === "lunch"
              ? "package"
              : "not_served",
        guest_rate: meal === "lunch" ? 25000 : null,
        version: 0,
      })),
    );
    await asUser(db, ADMIN, "select public.save_meal_calendar($1,$2)", [
      festival,
      services,
    ]);
    expect(
      (
        await asUser(
          db,
          MEMBER,
          "select * from public.meal_services where coverage='fixed'",
        )
      ).rows,
    ).toHaveLength(2);
  });
  it("removes the special-day flag and permits ready setup without it", async () => {
    const columns = await db.query(
      "select column_name from information_schema.columns where table_name='festival_days' and column_name='is_dussehra'",
    );
    expect(columns.rows).toHaveLength(0);
    const ready = {
      ...draft(),
      status: "ready",
      flat_ids: [flat],
      rates: {
        ...draft().rates,
        guest: 10000,
        household_policy: "all_residents",
        guest_age_policy: "same_rate",
      },
    };
    await asUser(db, ADMIN, "select public.save_festival($1)", [ready]);
  });
  it("rejects stale edits, missing meal rows, invalid dates and committee changes", async () => {
    await expect(
      asUser(db, ADMIN, "select public.save_meal_calendar($1,$2)", [
        festival,
        services,
      ]),
    ).rejects.toThrow("changed");
    await expect(
      asUser(db, ADMIN, "select public.save_meal_calendar($1,$2)", [
        festival,
        services.slice(1),
      ]),
    ).rejects.toThrow("every festival date");
    await expect(
      asUser(db, MEMBER, "select public.save_meal_calendar($1,$2)", [
        festival,
        services,
      ]),
    ).rejects.toThrow("Admin access");
    await expect(
      asUser(db, ADMIN, "select public.save_meal_calendar($1,$2)", [
        festival,
        services.map((s) => ({ ...s, version: 1, service_date: "2027-01-01" })),
      ]),
    ).rejects.toThrow();
  });
});
