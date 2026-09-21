import { expect, it } from "vitest";
import { attendancePage, matchesAttendance } from "../src/lib/attendance-list";
it("finds flats despite dash style, spacing and case, or by number alone", () => {
  for (const search of ["101", "a-101", "A 101", "A–101"])
    expect(matchesAttendance(search, "A–101")).toBe(true);
  expect(matchesAttendance("202", "A–101")).toBe(false);
  expect(matchesAttendance("abc-123", "A–101", "abc-123-def")).toBe(true);
});
it("limits each page to ten and clamps after filtering shrinks results", () => {
  const rows = Array.from({ length: 23 }, (_, i) => i);
  expect(attendancePage(rows, 0).items).toEqual(rows.slice(0, 10));
  expect(attendancePage(rows, 1).items).toEqual(rows.slice(10, 20));
  expect(attendancePage(rows, 2).items).toEqual([20, 21, 22]);
  expect(attendancePage([1, 2], 2)).toMatchObject({
    page: 0,
    total: 2,
    items: [1, 2],
  });
  expect(attendancePage([], 5)).toMatchObject({ page: 0, total: 0, items: [] });
});
