import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  verify: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/config", () => ({ isConfigured: () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signInWithOtp: mocks.send, verifyOtp: mocks.verify },
    rpc: mocks.rpc,
  }),
}));
vi.mock(
  "@/lib/login-validation",
  async () => await import("../src/lib/login-validation"),
);
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
import { emailLogin } from "../src/app/login/actions";
function form(email: string, intent = "send") {
  const data = new FormData();
  data.set("email", email);
  data.set("intent", intent);
  return data;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockResolvedValue({ error: null });
});
it("keeps an uninvited typo address on the email step when Auth rejects it", async () => {
  mocks.send.mockResolvedValue({
    error: { status: 403, message: "This app requires an admin invitation." },
  });
  const result = await emailLogin(
    { email: "", step: "email" },
    form("prishi.ai.ventures@gmil.co"),
  );
  expect(result.step).toBe("email");
  expect(result.error).toContain("Check the address");
  expect(result.sent).toBeUndefined();
  expect(result.message).toBeUndefined();
  expect(mocks.verify).not.toHaveBeenCalled();
});
it("resets a rejected resend to the email step without a fake send timestamp", async () => {
  mocks.send.mockResolvedValue({ error: { status: 400 } });
  const result = await emailLogin(
    { email: "someone@example.com", step: "code", sent: 123 },
    form("someone@example.com", "resend"),
  );
  expect(result.step).toBe("email");
  expect(result.sent).toBeUndefined();
});
it("retains separate delivery and rate-limit messages", async () => {
  for (const [status, text] of [
    [429, "wait a minute"],
    [500, "temporarily unavailable"],
  ] as const) {
    mocks.send.mockResolvedValue({ error: { status } });
    const result = await emailLogin(
      { email: "", step: "email" },
      form("person@example.com"),
    );
    expect(result.step).toBe("email");
    expect(result.error).toContain(text);
    expect(result.sent).toBeUndefined();
  }
});
it("advances accepted requests and normalizes the invited email", async () => {
  const result = await emailLogin(
    { email: "", step: "email" },
    form(" Prishi.AI.Ventures@gmail.com "),
  );
  expect(result.step).toBe("code");
  expect(result.sent).toBeGreaterThan(0);
  expect(mocks.send).toHaveBeenCalledWith({
    email: "prishi.ai.ventures@gmail.com",
    options: { shouldCreateUser: true },
  });
});
it("rejects malformed emails without calling Auth", async () => {
  const result = await emailLogin(
    { email: "", step: "email" },
    form("not an email"),
  );
  expect(result.step).toBe("email");
  expect(mocks.send).not.toHaveBeenCalled();
});
