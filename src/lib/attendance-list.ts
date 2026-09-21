export function matchesAttendance(search: string, ...values: string[]) {
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[\s–—-]/g, "");
  const needle = normalize(search);
  return values.some((value) => normalize(value).includes(needle));
}
export function attendancePage<T>(rows: T[], requestedPage: number) {
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  const page = Math.min(Math.max(0, requestedPage), pages - 1);
  return {
    items: rows.slice(page * 10, page * 10 + 10),
    page,
    pages,
    total: rows.length,
  };
}
