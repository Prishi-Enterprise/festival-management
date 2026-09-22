import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.user }, rpc: mocks.rpc }),
}));
vi.mock(
  "@/lib/attendance-data",
  async () => await import("../src/lib/attendance-data"),
);
import { GET } from "../src/app/desk/[id]/attendance/records/route";
const id = "11111111-1111-4111-8111-111111111111";
const request = (query = "") =>
  GET(
    new Request(`https://example.test/desk/${id}/attendance/records?${query}`),
    { params: Promise.resolve({ id }) },
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ data: { user: { id } } });
  mocks.rpc.mockResolvedValue({ data: { attendance: [] }, error: null });
});
it("validates searches before accessing data", async () => {
  for (const query of [
    "resident_page=-1",
    "guest_page=NaN",
    "code=bad",
    "kind=guest",
    `resident_search=${"a".repeat(121)}`,
  ])
    expect((await request(query)).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("returns private uncached data with timing instrumentation", async () => {
  const response = await request("resident_page=2&resident_search=A-101");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("server-timing")).toMatch(/auth;dur=.*db;dur=/);
  expect(mocks.rpc).toHaveBeenCalledWith("attendance_data", {
    p_festival: id,
    p_query: {
      resident_page: 2,
      guest_page: 0,
      resident_search: "A-101",
      guest_search: "",
    },
  });
});
it("rejects signed-out users and preserves database permission checks", async () => {
  mocks.user.mockResolvedValueOnce({ data: { user: null } });
  expect((await request()).status).toBe(401);
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValueOnce({
    error: { code: "42501", message: "private database details" },
  });
  const response = await request();
  expect(response.status).toBe(403);
  expect(await response.text()).not.toContain("private database details");
});
