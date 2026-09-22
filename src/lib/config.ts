export function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
export function publicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error("Supabase dev connection is not configured.");
  return { url, key };
}
export function appUrl() {
  const canonicalDevUrl =
    process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === "develop"
      ? process.env.APP_URL
      : undefined;
  const previewHost =
    process.env.VERCEL_ENV === "preview"
      ? process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL
      : undefined;
  const url = new URL(
    canonicalDevUrl ||
      (previewHost
        ? `https://${previewHost}`
        : process.env.APP_URL || "http://localhost:3000"),
  );
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  ) {
    throw new Error("APP_URL must use HTTPS outside localhost.");
  }
  return url.origin;
}
