import { it, expect } from "vitest";
import {
  createDatabase,
  bootstrap,
  asUser,
  ADMIN,
  MEMBER,
  draft,
} from "./db-harness";
it("finance permission includes reports and cross-author confirmation but not unlock or admin powers", async () => {
  const db = await createDatabase();
  try {
    await bootstrap(db);
    await asUser(
      db,
      ADMIN,
      "select invite_member('member@example.com','committee','{}',false,true)",
    );
    await asUser(db, MEMBER, "select claim_membership()");
    expect(
      (
        await db.query<{
          can_view_reports: boolean;
          can_manage_finance: boolean;
        }>(
          "select can_view_reports,can_manage_finance from society_memberships where user_id=$1",
          [MEMBER],
        )
      ).rows[0],
    ).toEqual({ can_view_reports: true, can_manage_finance: true });
    await asUser(db, ADMIN, "select add_flats('A',array['101'])");
    const flat = (await db.query<{ id: string }>("select id from flats"))
      .rows[0].id;
    const f = (
      await asUser<{ id: string }>(db, ADMIN, "select save_festival($1) id", [
        { ...draft(), flat_ids: [flat], member_ids: [MEMBER] },
      ])
    ).rows[0].id;
    const make = async (fid: string) =>
      (
        await db.query<{ id: string }>(
          "insert into finance_entries(id,festival_id,created_by,kind,occurred_on,amount,description,flat_id,category) values(gen_random_uuid(),$1,$2,'charge','2026-10-11',100,'Test charge',$3,'Fixed contribution') returning id",
          [fid, ADMIN, flat],
        )
      ).rows[0].id;
    const e = await make(f);
    expect(
      (
        await asUser(db, MEMBER, "select id from finance_entries where id=$1", [
          e,
        ])
      ).rows,
    ).toHaveLength(1);
    await asUser(db, MEMBER, "select finance_overview($1)", [f]);
    await asUser(db, MEMBER, "select review_finance_entry($1,1,'confirm','')", [
      e,
    ]);
    await expect(
      asUser(
        db,
        MEMBER,
        "select review_finance_entry($1,2,'unlock','Correction')",
        [e],
      ),
    ).rejects.toThrow("Admin access");
    await expect(
      asUser(db, MEMBER, "select add_flats('B',array['101'])"),
    ).rejects.toThrow();
    const other = (
      await asUser<{ id: string }>(db, ADMIN, "select save_festival($1) id", [
        draft(),
      ])
    ).rows[0].id;
    const otherEntry = await make(other);
    expect(
      (
        await asUser(db, MEMBER, "select id from finance_entries where id=$1", [
          otherEntry,
        ])
      ).rows,
    ).toHaveLength(0);
    await expect(
      asUser(db, MEMBER, "select review_finance_entry($1,1,'confirm','')", [
        otherEntry,
      ]),
    ).rejects.toThrow();
    const version = (
      await db.query<{ version: number }>(
        "select version from society_memberships where user_id=$1",
        [MEMBER],
      )
    ).rows[0].version;
    await asUser(db, ADMIN, "select update_member($1)", [
      {
        user_id: MEMBER,
        role: "committee",
        active: true,
        version,
        festival_ids: [f],
        can_view_reports: false,
        can_manage_finance: false,
      },
    ]);
    const pending = await make(f);
    expect(
      (
        await asUser(db, MEMBER, "select id from finance_entries where id=$1", [
          pending,
        ])
      ).rows,
    ).toHaveLength(0);
    await expect(
      asUser(db, MEMBER, "select review_finance_entry($1,1,'confirm','')", [
        pending,
      ]),
    ).rejects.toThrow("Finance & accounts");
  } finally {
    await db.close();
  }
});
