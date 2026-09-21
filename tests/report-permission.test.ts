import { it, expect } from "vitest";
import {
  createDatabase,
  bootstrap,
  asUser,
  ADMIN,
  MEMBER,
  OUTSIDER,
  draft,
} from "./db-harness";
it("enforces report grants, invitation inheritance, revocation and assignment independently", async () => {
  const db = await createDatabase();
  try {
    await bootstrap(db);
    await asUser(
      db,
      ADMIN,
      "select public.invite_member('member@example.com','committee')",
    );
    await asUser(db, MEMBER, "select public.claim_membership()");
    const f = (
      await asUser<{ id: string }>(
        db,
        ADMIN,
        "select public.save_festival($1) id",
        [{ ...draft(), member_ids: [MEMBER] }],
      )
    ).rows[0].id;
    const overview = (u: string) =>
      asUser(db, u, "select public.finance_overview($1)", [f]);
    await expect(overview(MEMBER)).rejects.toThrow("Report permission");
    await expect(overview(ADMIN)).resolves.toBeDefined();
    const grant = {
      user_id: MEMBER,
      role: "committee",
      active: true,
      version: (
        await db.query<{ version: number }>(
          "select version from public.society_memberships where user_id=$1",
          [MEMBER],
        )
      ).rows[0].version,
      festival_ids: [f],
      can_view_reports: true,
    };
    await expect(
      asUser(db, MEMBER, "select public.update_member($1)", [grant]),
    ).rejects.toThrow();
    await expect(
      asUser(
        db,
        MEMBER,
        "update public.society_memberships set can_view_reports=true where user_id=$1",
        [MEMBER],
      ),
    ).rejects.toThrow();
    await asUser(db, ADMIN, "select public.update_member($1)", [grant]);
    await expect(overview(MEMBER)).resolves.toBeDefined();
    await expect(
      asUser(db, MEMBER, "select public.finance_report($1)", [f]),
    ).rejects.toThrow();
    await expect(
      asUser(db, MEMBER, "select private.finance_overview_base($1)", [f]),
    ).rejects.toThrow();
    await asUser(db, ADMIN, "select public.update_member($1)", [
      { ...grant, version: grant.version + 1, can_view_reports: false },
    ]);
    await expect(overview(MEMBER)).rejects.toThrow("Report permission");
    await asUser(
      db,
      ADMIN,
      "select public.invite_member('outsider@example.com','committee','{}',true)",
    );
    await asUser(db, OUTSIDER, "select public.claim_membership()");
    const inherited = (
      await db.query<{ can_view_reports: boolean }>(
        "select can_view_reports from public.society_memberships where user_id=$1",
        [OUTSIDER],
      )
    ).rows[0];
    expect(inherited.can_view_reports).toBe(true);
    await expect(overview(OUTSIDER)).rejects.toThrow("Festival access");
  } finally {
    await db.close();
  }
}, 30000);
