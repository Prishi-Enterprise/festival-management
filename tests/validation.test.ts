import { describe, expect, it } from "vitest";
import {
  festivalSchema,
  makeDays,
  rupeesToPaise,
  inviteSchema,
} from "../src/lib/validation";
import { draft } from "./db-harness";
describe("admin form validation", () => {
  it("converts exact money without rounding floating point", () => {
    expect(rupeesToPaise("1200.01")).toBe(120001);
    expect(rupeesToPaise("0")).toBe(0);
    expect(() => rupeesToPaise("1.234")).toThrow();
    expect(() => rupeesToPaise("-1")).toThrow();
  });
  it("generates calendar dates across year boundaries", () => {
    expect(makeDays("2026-12-31", 2).map((d) => d.service_date)).toEqual([
      "2026-12-31",
      "2027-01-01",
    ]);
  });
  it("validates draft and rejects premature ready state", () => {
    expect(festivalSchema.safeParse(draft()).success).toBe(true);
    expect(
      festivalSchema.safeParse({ ...draft(), status: "ready" }).success,
    ).toBe(false);
  });
  it("normalizes invitation case without changing Google aliases", () => {
    expect(
      inviteSchema.parse({
        email: " Member.Name+test@gmail.com ",
        role: "committee",
        festival_ids: [],
      }).email,
    ).toBe("member.name+test@gmail.com");
  });
});
