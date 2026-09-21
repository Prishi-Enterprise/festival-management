import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  configured: vi.fn(() => true),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { signOut: mocks.signOut } }),
}));
vi.mock("@/lib/config", () => ({
  appUrl: () => "https://radhe.prishi.in",
  isConfigured: mocks.configured,
  publicConfig: () => ({ url: "https://example.supabase.co", key: "test-key" }),
}));
import { POST } from "../src/app/auth/signout/route";
function request(origin = "https://radhe.prishi.in") {
  return new NextRequest("https://radhe.prishi.in/auth/signout", {
    method: "POST",
    headers: {
      origin,
      cookie:
        "sb-example-auth-token.0=first; sb-example-auth-token.1=second; sb-example-auth-token-code-verifier=verifier; preference=keep",
    },
  });
}
describe("sign-out redirect", () => {
  beforeEach(() => {
    mocks.configured.mockReturnValue(true);
    mocks.signOut.mockReset().mockResolvedValue({ error: null });
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());
  it("redirects to login with a GET and expires all session chunks", async () => {
    const response = await POST(request());
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://radhe.prishi.in/login",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    for (const name of [
      "sb-example-auth-token.0",
      "sb-example-auth-token.1",
      "sb-example-auth-token-code-verifier",
    ]) {
      expect(response.cookies.get(name)?.maxAge).toBe(0);
    }
    expect(response.cookies.has("preference")).toBe(false);
  });
  it.each(["returned", "thrown"])(
    "still clears the browser session on a %s Auth error",
    async (mode) => {
      if (mode === "returned")
        mocks.signOut.mockResolvedValue({ error: new Error("expired") });
      else mocks.signOut.mockRejectedValue(new Error("offline"));
      const response = await POST(request());
      expect(response.status).toBe(303);
      expect(response.cookies.get("sb-example-auth-token.0")?.maxAge).toBe(0);
    },
  );
  it("rejects cross-origin submissions without changing the session", async () => {
    const response = await POST(request("https://unrelated.example"));
    expect(response.status).toBe(403);
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(response.cookies.getAll()).toHaveLength(0);
  });
  it("returns to login when the app has no Supabase configuration", async () => {
    mocks.configured.mockReturnValue(false);
    expect((await POST(request())).status).toBe(303);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
