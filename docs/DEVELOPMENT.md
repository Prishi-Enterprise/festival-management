# Local development

Use Node 24 and the local Supabase stack. The hosted project `pokeislmfmfuqgfkxmzp` is production, not a development target.

## Start the stack

```sh
npm ci
colima start --cpu 2 --memory 4 --disk 30
npx supabase start
npx supabase status
```

Run `npm run db:env` to create `.env.local` from local stack status without copying privileged keys. It refuses to overwrite an existing file. Alternatively, copy `.env.example` to `.env.local` and set the local API URL and matching publishable/anon key shown by `supabase status`; do not copy the service-role key into the app. Keep `APP_URL=http://localhost:3000` and `NEXT_PUBLIC_APP_ENV=dev`. Run `npm run dev` and open `http://localhost:3000`.

The local stack applies `supabase/migrations/` on initialization. `npx supabase db reset --local` recreates the disposable local database from migrations and removes local test data. Never run a linked or remote reset. No hosted project needs linking during development.

## Google sign-in

1. Create a Google OAuth Web client for development, with redirect URI `http://127.0.0.1:54321/auth/v1/callback`. This is the local Supabase Auth callback, not the Next.js app callback.
2. Set `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` and `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` in the shell environment used to start Supabase. Keep secrets out of Git.
3. Set `enabled = true` in the `[auth.external.google]` section of `supabase/config.toml` and restart the local stack. The committed default is disabled until credentials exist.
4. The configured admission hook allows previously invited accounts only. The migration creates the one-time invitation for the initial admin. Sign in using the approved initial admin Google account. No development authentication bypass exists in the application.
5. Add approved Google test users to the consent screen if the Google app is in testing mode. Test an uninvited account too: it must be rejected.

The app exchanges the OAuth code, verifies the Google identity and claims the database invitation. Existing deactivated memberships cannot reactivate themselves. An invite creates onboarding permission in the database; it does not send email. Share the sign-in URL manually.

## Current admin scope

- Google login, invite claim and server-side role checks.
- Admin overview; festival creation/editing with configurable dates, charges, blocks/flats and committee assignments.
- People onboarding, invitation revocation, role changes and activation/deactivation; last-admin protection.
- Integer-paise prices, free under-seven rate, versioned rate history, audit events, database validation and row-level security.

Inflow, expenses, confirmation/locking, meals and financial reports are subsequent phases. The committee route currently shows assigned festivals only. Marking festival setup ready does not generate financial charges.

## Verification and release gate

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

The database suite runs the real migration in embedded PostgreSQL with synthetic Auth fixtures. It tests authorization and transaction behavior, but does not replace real Supabase/Google OAuth integration or browser acceptance.

Before release, test Google admission, festival save/reload, invitation/revocation, promotion, deactivation, and committee access with the real local stack. Test stale concurrent edits. Keep test accounts and records local.

Vercel Git is connected. `vercel.json` temporarily disables automatic Git deployments so pushing implementation work does not bypass local acceptance. After acceptance and production environment/Auth setup, enable the intended deployment branches explicitly. Preview deployments must not receive production Supabase credentials. Local Supabase is not reachable from Vercel previews.

Production starts empty. Apply the reviewed SQL migrations to create schema/permissions, then enter approved live configuration. Do not copy development data. See [HOSTING.md](HOSTING.md).
