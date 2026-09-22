import { afterEach, expect, it, vi } from "vitest";
import { appUrl } from "../src/lib/config";

afterEach(() => vi.unstubAllEnvs());

it("uses the custom dev domain on develop", () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop");
  vi.stubEnv("VERCEL_BRANCH_URL", "example-git-develop.vercel.app");
  vi.stubEnv("APP_URL", "https://dev.festivals.prishi.in");
  expect(appUrl()).toBe("https://dev.festivals.prishi.in");
});

it("keeps other previews on their own branch hostname", () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feature/test");
  vi.stubEnv("VERCEL_BRANCH_URL", "example-git-feature.vercel.app");
  vi.stubEnv("APP_URL", "https://festivals.prishi.in");
  expect(appUrl()).toBe("https://example-git-feature.vercel.app");
});

it("preserves the production origin", () => {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
  vi.stubEnv("APP_URL", "https://festivals.prishi.in/");
  expect(appUrl()).toBe("https://festivals.prishi.in");
});

it("falls back to preview hostname before a dev domain is configured", () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop");
  vi.stubEnv("APP_URL", "");
  vi.stubEnv("VERCEL_BRANCH_URL", "example-git-develop.vercel.app");
  expect(appUrl()).toBe("https://example-git-develop.vercel.app");
});

it("rejects an insecure public origin", () => {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("APP_URL", "http://festivals.prishi.in");
  expect(() => appUrl()).toThrow("HTTPS");
});
