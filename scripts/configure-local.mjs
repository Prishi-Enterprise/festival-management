import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

if (existsSync(".env.local")) {
  throw new Error(
    ".env.local already exists; preserve it and update its local values manually.",
  );
}
const status = JSON.parse(
  execFileSync(
    resolve("node_modules/.bin/supabase"),
    ["status", "-o", "json"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    },
  ),
);
const url = new URL(status.API_URL);
if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
  throw new Error(
    "Refusing to configure local development against a hosted database.",
  );
}
const key = status.PUBLISHABLE_KEY || status.ANON_KEY;
if (!key || /[\r\n]/.test(key))
  throw new Error("Local public key is missing or invalid.");
writeFileSync(
  ".env.local",
  `NEXT_PUBLIC_SUPABASE_URL=${url.origin}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key}\nNEXT_PUBLIC_APP_ENV=dev\nAPP_URL=http://localhost:3000\n`,
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Configured .env.local for local Supabase. No service-role key was copied.",
);
