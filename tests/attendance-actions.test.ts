import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  refresh: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  requireMember: async () => ({ supabase: { rpc: mocks.rpc } }),
}));
vi.mock("@/lib/operations", async () => await import("../src/lib/operations"));
vi.mock("next/cache", () => ({
  refresh: mocks.refresh,
  revalidatePath: mocks.revalidatePath,
}));
import { saveOperation } from "../src/app/desk/operations-actions";
const input = {
  id: "11111111-1111-4111-8111-111111111111",
  service_id: "22222222-2222-4222-8222-222222222222",
  version: 1,
  attended: 2,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ error: null });
});
it("saves check-ins without forcing the whole desk to reload", async () => {
  for (const operation of ["resident_checkin", "guest_checkin"] as const)
    expect(await saveOperation(operation, input)).toEqual({ ok: true });
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.revalidatePath).not.toHaveBeenCalledWith("/desk", "layout");
  expect(mocks.revalidatePath).toHaveBeenCalledWith(
    "/desk/[id]/operations",
    "page",
  );
});
it("keeps optimistic version conflicts visible without claiming a save", async () => {
  mocks.rpc.mockResolvedValue({
    error: { code: "P0001", message: "Attendance changed. Refresh and retry." },
  });
  expect(await saveOperation("guest_checkin", input)).toEqual({
    ok: false,
    error: "Attendance changed. Refresh and retry.",
  });
  expect(mocks.revalidatePath).not.toHaveBeenCalled();
});
