# Hosting and environments

Updated 21 September 2026. This supersedes earlier single-project and Google-only planning assumptions.

| Environment | Supabase | Application |
| --- | --- | --- |
| Dummy/dev | `pokeislmfmfuqgfkxmzp`, Tokyo `ap-northeast-1` | Vercel Preview branch `codex/launch-candidate` |
| Final production | `gfxtoblbiravcdwgerxw`, Mumbai `ap-south-1` | `https://radhe.prishi.in`, live on Mumbai, 21 September 2026 |
| Local | Supabase on Colima | `http://localhost:3000` |

Both hosted projects belong to `prishi-ai-ventures` on Free. Vercel Hobby project `radhe-festival` belongs to `prishi-ai`. One public repository, `Prishi-Enterprise/festival-management`, is connected. Main deploys to Production; the candidate branch deploys to Preview. The owner authorized production deployment for the demonstration on 21 September 2026.

Production is live on Mumbai. Release `33c4d3e` deployed successfully to `radhe.prishi.in`; the live OTP request created the official admin Auth identity in Mumbai. Preview URL/key variables point explicitly to Tokyo and `NEXT_PUBLIC_APP_ENV=dev`. Preview callbacks and signout use Vercel's branch/deployment URL. Public URL/key values are embedded at build time. The app uses user sessions and database authorization, never a service-role key.

## Prepared Mumbai database

Migrations 001–011 are applied. Fresh bootstrap uses only `sb@prishi.in` as the initial admin invitation. `node scripts/production-migrations.mjs` emits the fresh-production migration payload without rewriting historical migrations. Do not apply that bootstrap to an existing database.

The owner requested copying the flats dossier after initially choosing an empty database. All 224 flats are copied: A/B/C/D, 56 each. No development festival, meal calendar, finance entries or operational test records were copied.

Resend SMTP is saved, OTP is six digits with a ten-minute expiry, and the owner disabled the separate Confirm email setting. App membership still requires an invited address and OTP authentication. Site URL is `https://radhe.prishi.in`, with exact `/auth/callback` redirect configured. The Before User Created admission hook is enabled for `public.before_user_created`. The live OTP request for `sb@prishi.in` succeeded; completion of the emailed code and first admin sign-in remains the owner handoff. Google remains coming soon.

## Authorized production cutover

1. Complete [the acceptance checklist](ACCEPTANCE.md) against Tokyo and resolve findings.
2. Verify Mumbai Auth admission hook, SMTP/OTP and official admin invitation. Keep test finance data out of Mumbai.
3. Set Vercel Production Supabase URL and publishable key together to Mumbai, `NEXT_PUBLIC_APP_ENV=prod`, and `APP_URL=https://radhe.prishi.in`.
4. Merge/push the approved candidate to main, rebuild and verify domain, sign-in, roles and empty production totals. Do not promote a Preview build with Tokyo values embedded.
5. Configure the live festival, rates, meal calendar and committee membership in Mumbai. Tokyo remains dummy/test; do not delete it.

A deployment rollback does not reverse database migrations. If production begins accepting entries, reconcile them before any database rollback; never route concurrent live writes to both databases.

## Domain and safeguards

GoDaddy CNAME `radhe` points to `34da08b98725dead.vercel-dns-017.com`; the custom domain is attached in Vercel. Preserve unrelated DNS and Resend records. Marketplace integration is not required.

Run lint, typecheck, tests and production build before release. Current candidate passes all checks (56 tests). GitHub Actions remains deferred; Vercel performs its build automatically.

Supabase advisor findings for RPC-only tables without direct policies and intentional SECURITY DEFINER functions were reviewed: direct writes are revoked and authenticated RPCs check membership/role internally. The anonymous guest-pass RPC is intentionally read-only and exposes only bearer-pass event/meal/count/status information, not resident names or finances.

Never commit workbook files, resident exports, credentials or private operational data. This is a public repository.
