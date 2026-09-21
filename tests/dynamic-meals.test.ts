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
