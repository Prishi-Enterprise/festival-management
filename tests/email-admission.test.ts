import { it, expect } from "vitest";
import { createDatabase, asUser, ADMIN, MEMBER, OUTSIDER } from "./db-harness";
it("email OTP onboarding requires a confirmed identity, OTP proof and an invitation", async () => {
  const db = await createDatabase();
  try {
    await db.exec(
      "update auth.identities set provider='email'; update auth.users set email_confirmed_at=null where id='" +
        ADMIN +
        "'",
    );
    await expect(
      asUser(db, ADMIN, "select public.claim_membership()", [], "email", "otp"),
    ).rejects.toThrow("verified");
    await db.exec(
      "update auth.users set email_confirmed_at=now() where id='" + ADMIN + "'",
    );
    await expect(
      asUser(
        db,
        ADMIN,
        "select public.claim_membership()",
        [],
        "email",
        "password",
      ),
    ).rejects.toThrow("verified");
    await asUser(
      db,
      ADMIN,
      "select public.claim_membership()",
      [],
      "email",
      "otp",
    );
    await expect(
      asUser(
        db,
        OUTSIDER,
        "select public.claim_membership()",
        [],
        "email",
        "otp",
      ),
    ).rejects.toThrow("invitation");
    await asUser(
      db,
      ADMIN,
      "select public.invite_member('member@example.com','committee')",
      [],
      "email",
      "otp",
    );
    await asUser(
      db,
      MEMBER,
      "select public.claim_membership()",
      [],
      "email",
      "otp",
    );
    expect(
      (
        await db.query(
          "select email,role from public.society_memberships order by role",
        )
      ).rows,
    ).toEqual([
      { email: "prishi.ai.ventures@gmail.com", role: "admin" },
      { email: "member@example.com", role: "committee" },
    ]);
    await db.exec(
      "update public.society_memberships set active=false where user_id='" +
        MEMBER +
        "'",
    );
    await expect(
      asUser(
        db,
        MEMBER,
        "select public.claim_membership()",
        [],
        "email",
        "otp",
      ),
    ).rejects.toThrow("inactive");
  } finally {
    await db.close();
  }
});
