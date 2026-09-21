import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
beforeAll(async () => {
  db = await createDatabase();
});
afterAll(async () => {
  await db.close();
});
describe("Google admission and membership", () => {
  it("rejects an uninvited account", async () => {
    await expect(
      asUser(db, OUTSIDER, "select public.claim_membership()"),
    ).rejects.toThrow("invitation");
  });
  it("rejects non-Google sign-in even for the bootstrap email", async () => {
    await expect(
      asUser(db, ADMIN, "select public.claim_membership()", [], "email"),
    ).rejects.toThrow("Google");
  });
  it("claims exactly one initial admin and is safe to repeat", async () => {
    await bootstrap(db);
    await bootstrap(db);
    const { rows } = await db.query(
      "select role from public.society_memberships",
    );
    expect(rows).toEqual([{ role: "admin" }]);
    expect(
      (await db.query("select status from public.member_invitations")).rows,
    ).toEqual([{ status: "claimed" }]);
  });
  it("prevents direct writes and self-promotion via the Data API", async () => {
    await expect(
      asUser(
        db,
        OUTSIDER,
        `insert into public.society_memberships(user_id,email,role) values ($1,'evil@example.com','admin')`,
        [OUTSIDER],
      ),
    ).rejects.toThrow("permission denied");
    await expect(
      asUser(
        db,
        ADMIN,
        `update public.society_memberships set role='committee'`,
      ),
    ).rejects.toThrow("permission denied");
  });
  it("refuses to remove the last active admin", async () => {
    await expect(
      asUser(db, ADMIN, "select public.update_member($1)", [
        {
          user_id: ADMIN,
          role: "committee",
          active: true,
          version: 1,
          festival_ids: [],
        },
      ]),
    ).rejects.toThrow("one active admin");
  });
  it("allows admin onboarding, but rejects duplicate pending invitations", async () => {
    await asUser(
      db,
      ADMIN,
      `select public.invite_member('member@example.com','committee')`,
    );
    await expect(
      asUser(
        db,
        ADMIN,
        `select public.invite_member('MEMBER@example.com','committee')`,
      ),
    ).rejects.toThrow("already exists");
    await asUser(db, MEMBER, "select public.claim_membership()");
  });
  it("denies committee access to admin RPCs and other memberships", async () => {
    await expect(
      asUser(
        db,
        MEMBER,
        `select public.invite_member('new@example.com','admin')`,
      ),
    ).rejects.toThrow("Admin access");
    expect(
      (
        await asUser(
          db,
          MEMBER,
          "select user_id from public.society_memberships",
        )
      ).rows,
    ).toEqual([{ user_id: MEMBER }]);
    expect(
      (await asUser(db, MEMBER, "select * from public.member_invitations"))
        .rows,
    ).toEqual([]);
    await expect(
      asUser(db, MEMBER, "select public.before_user_created($1)", [
        { user: { email: "other@example.com" } },
      ]),
    ).rejects.toThrow("permission denied");
  });
  it("revokes pending invitations and admission hook denies unknown email", async () => {
    const { rows } = await asUser<{ invite_member: string }>(
      db,
      ADMIN,
      `select public.invite_member('outsider@example.com','committee')`,
    );
    await asUser(db, ADMIN, "select public.revoke_invitation($1)", [
      rows[0].invite_member,
    ]);
    await expect(
      asUser(db, OUTSIDER, "select public.claim_membership()"),
    ).rejects.toThrow("invitation");
    const result = await db.query<{ result: { error: { http_code: number } } }>(
      "select public.before_user_created($1) result",
      [{ user: { email: "unknown@example.com" } }],
    );
    expect(result.rows[0].result.error.http_code).toBe(403);
  });
});
describe("Festival setup, database validation and immutable rate history", () => {
  let festivalId: string;
  it("creates a configurable draft without guessing the guest rate", async () => {
    const result = await asUser<{ save_festival: string }>(
      db,
      ADMIN,
      "select public.save_festival($1)",
      [draft()],
    );
    festivalId = result.rows[0].save_festival;
    const detail = await asUser<{
      result: { days: unknown[]; rates: { guest: null } };
    }>(db, ADMIN, "select public.get_festival_detail($1) result", [festivalId]);
    expect(detail.rows[0].result.days).toHaveLength(2);
    expect(detail.rows[0].result.rates.guest).toBeNull();
  });
  it("rejects committee writes and access to unassigned festival detail", async () => {
    await expect(
      asUser(db, MEMBER, "select public.save_festival($1)", [draft()]),
    ).rejects.toThrow("Admin access");
    await expect(
      asUser(db, MEMBER, "select public.get_festival_detail($1)", [festivalId]),
    ).rejects.toThrow("Admin access");
    expect(
      (await asUser(db, MEMBER, "select id from public.festivals")).rows,
    ).toEqual([]);
  });
  it("rejects invalid calendars, fractional rates, nonzero under-seven and incomplete ready state", async () => {
    const wrongDate = draft();
    wrongDate.days[1].service_date = wrongDate.days[0].service_date;
    await expect(
      asUser(db, ADMIN, "select public.save_festival($1)", [wrongDate]),
    ).rejects.toThrow("Calendar");
    const wrongRate = draft();
    wrongRate.rates.adult = 1.5;
    await expect(
      asUser(db, ADMIN, "select public.save_festival($1)", [wrongRate]),
    ).rejects.toThrow("integer paise");
    const wrongChild = draft();
    wrongChild.rates.under_seven = 100;
    await expect(
      asUser(db, ADMIN, "select public.save_festival($1)", [wrongChild]),
    ).rejects.toThrow("zero");
    await expect(
      asUser(db, ADMIN, "select public.save_festival($1)", [
        { ...draft(), status: "ready" },
      ]),
    ).rejects.toThrow("before marking");
  });
  it("normalizes block/flat data and ignores duplicate additions", async () => {
    await asUser(
      db,
      ADMIN,
      `select public.add_flats('a',array['101','102','101'])`,
    );
    expect(
      (
        await db.query(
          "select block,flat_number from public.flats order by flat_number",
        )
      ).rows,
    ).toEqual([
      { block: "A", flat_number: "101" },
      { block: "A", flat_number: "102" },
    ]);
  });
  it("rejects stale edits and retains old pricing versions", async () => {
    const edited = {
      ...draft(),
      id: festivalId,
      version: 1,
      rates: { ...draft().rates, adult: 130000 },
      member_ids: [MEMBER],
    };
    await asUser(db, ADMIN, "select public.save_festival($1)", [edited]);
    await expect(
      asUser(db, ADMIN, "select public.save_festival($1)", [edited]),
    ).rejects.toThrow("changed");
    expect(
      (
        await db.query<{ amount: string }>(
          `select rates->>'adult' amount from public.pricing_versions where festival_id=$1 order by version`,
          [festivalId],
        )
      ).rows.map((r) => r.amount),
    ).toEqual(["120000", "130000"]);
    expect(
      (await asUser(db, MEMBER, "select id from public.festivals")).rows,
    ).toEqual([{ id: festivalId }]);
  });
  it("rejects a stale People form after festival assignment changes", async () => {
    await expect(
      asUser(db, ADMIN, "select public.update_member($1)", [
        {
          user_id: MEMBER,
          role: "committee",
          active: true,
          version: 1,
          festival_ids: [],
        },
      ]),
    ).rejects.toThrow("Membership changed");
    expect(
      (await asUser(db, MEMBER, "select id from public.festivals")).rows,
    ).toEqual([{ id: festivalId }]);
  });
  it("rejects invalid foreign keys atomically", async () => {
    const before = await db.query(
      "select count(*) count from public.festivals",
    );
    await expect(
      asUser(db, ADMIN, "select public.save_festival($1)", [
        { ...draft(), flat_ids: [OUTSIDER] },
      ]),
    ).rejects.toThrow();
    expect(
      (await db.query("select count(*) count from public.festivals")).rows,
    ).toEqual(before.rows);
  });
  it("revokes existing-session access immediately and never auto-reactivates membership", async () => {
    await asUser(db, ADMIN, "select public.update_member($1)", [
      {
        user_id: MEMBER,
        role: "committee",
        active: false,
        version: 2,
        festival_ids: [festivalId],
      },
    ]);
    expect(
      (await asUser(db, MEMBER, "select * from public.festivals")).rows,
    ).toEqual([]);
    await expect(
      asUser(db, MEMBER, "select public.claim_membership()"),
    ).rejects.toThrow("inactive");
  });
});
