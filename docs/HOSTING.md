# Hosting and environment setup

Updated 21 September 2026. These decisions supersede earlier hosting and separate-project assumptions in the planning documents.

## Confirmed resources

| Resource | Configuration |
| --- | --- |
| Supabase | Free; existing main/production project `pokeislmfmfuqgfkxmzp` only |
| API URL | `https://pokeislmfmfuqgfkxmzp.supabase.co` |
| Vercel | Hobby, team `prishi-ai`, project `radhe-festival` |
| Vercel project ID | `prj_kJwaTxZAxf7PRzxEUimZ0XIEsQGG` |
| App domain | `radhe.prishi.in`; parent domain DNS managed at GoDaddy |
| Repository | Public `Prishi-Enterprise/festival-management`; single repository |

The Vercel project has been created without a deployment. The custom domain is attached to Production. The GoDaddy CNAME resolves to the assigned Vercel target. Vercel now shows No Deployment instead of Invalid Configuration. Domain setup is ready for the first release. No Supabase migration or plan upgrade was performed during hosting setup.

## DNS before deployment

In GoDaddy's DNS records for `prishi.in`, add:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| CNAME | `radhe` | `34da08b98725dead.vercel-dns-017.com` | Default |

This is the exact target shown by Vercel for this project, not a generic example. Inspect any existing `radhe` record before replacing it. Preserve apex, www, mail and other unrelated records. Refresh verification in [Vercel Domains](https://vercel.com/prishi-ai/radhe-festival/settings/domains) after DNS propagates. Domain attachment and DNS can precede the first deployment; a working application requires a successful deployment afterward.

## Local development confirmed

The Supabase dashboard confirms that both preview and persistent branches require upgrading this Free organization. The create-branch dialog quotes branch compute at $0.01344/hour, in addition to the paid plan. No upgrade or branch creation is authorized under the current Free constraint.

Confirmed by the owner: run the Supabase stack locally for development and keep this single hosted main project for production. Do not create another hosted project or treat schemas as isolated Supabase Auth environments. If hosted branching is chosen later, use a persistent dev branch with its own URL, keys and Auth configuration; it is not a second top-level project, but is separately billed infrastructure.

## Connecting the app to Supabase

A Marketplace integration is optional. The existing project can be used by setting the application's environment variables directly in Vercel. Do not use a Marketplace flow that creates a new Supabase project.

| Variable | Vercel Production value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://pokeislmfmfuqgfkxmzp.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key from that same project |
| `NEXT_PUBLIC_APP_ENV` | `prod` |
| `APP_URL` | `https://radhe.prishi.in` |

These settings have not yet been saved in Vercel. Do not assign Production credentials to Preview or local development. Public Next.js variables are embedded during the build; rebuild when changing the target. No service-role key is needed for the admin application: requests use the signed-in user's session and database authorization policies.

For production Google sign-in, configure the Google provider in Supabase, with Google's authorized redirect URI `https://pokeislmfmfuqgfkxmzp.supabase.co/auth/v1/callback`. Set Supabase's Site URL to `https://radhe.prishi.in` and allow the exact app callback `https://radhe.prishi.in/auth/callback`. Google client secrets belong in Supabase provider settings, never public app variables. Development uses its own callback and provider configuration. Real Google sign-in remains an acceptance requirement.

## Repository compatibility and release order

The owner made the existing repository public and explicitly chose to retain one repository. Public visibility has been verified through GitHub. This removes the private-organization repository restriction; Vercel Git integration is connected and verified in the dashboard. Hobby account/author checks still need verification. No second repository or paid upgrade is planned. Manual CLI deployment remains a fallback.

The public Git history includes the historical workbook analysis and financial control totals. This was disclosed to the owner before and after the visibility change. Keep all future resident records, credentials, workbook files and exports outside Git. Removing a file in a new commit does not erase its history.

1. Start local Supabase and configure the local Google OAuth callback. Git integration is verified; keep automatic deployment disabled until acceptance.
2. Complete local implementation, database authorization tests and real Google sign-in acceptance.
3. Complete GoDaddy DNS verification and production Auth configuration.
4. Initialize the empty production database with the reviewed versioned SQL migrations, bootstrap the approved initial admin and load approved live configuration. This is schema creation, not a transfer of development data; exclude development fixtures.
5. Set Vercel Production variables, enable the approved Git deployment branches in `vercel.json`, and release after local acceptance. Manual CLI deployment remains an alternative. Verify domain, TLS, sign-in and admin permissions before committee launch. A release rollback does not reverse database migrations.

MCP connections were reported connected by the owner, but Supabase and Vercel tools are not exposed in the active task tool list. Browser dashboards were used for the resource checks and empty Vercel project/domain creation. Reloading the task may expose the newly connected tools.

Sources: [Vercel manual deployment](https://vercel.com/docs/deployments), [Supabase branching](https://supabase.com/docs/guides/deployment/branching), [branching charges](https://supabase.com/docs/guides/platform/manage-your-usage/branching), [Vercel Git restrictions](https://vercel.com/docs/git), [Supabase/Vercel environment mapping](https://supabase.com/docs/guides/troubleshooting/vercel-integration-environment-variables-not-syncing-for-persistent-git-branches-b9191e).

## Admin release — 21 September 2026

The admin schema is applied to the hosted production project. Vercel Production has the Supabase URL, publishable key, app URL and `prod` label. No service-role key is used. The exact production callback is allowlisted and the Site URL is `https://radhe.prishi.in`.

The owner authorized deploying admin setup before Google OAuth acceptance. Google client configuration and a real first-admin sign-in remain required before operational use. Local browser checks cover flat creation, festival draft/save, assignments and invitations; database tests cover authorization and last-admin protection. No local fixtures are copied to production.

The security advisor flags seven authenticated SECURITY DEFINER RPCs. These are intentional: each enforces membership/admin authorization internally, uses a fixed empty search path, and denies direct table writes. The before-user-created hook is separately restricted to Supabase Auth.

GitHub Actions is deferred because the connected CLI token lacks workflow scope. Vercel builds main automatically; run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` before pushing.


## Authentication update — 21 September 2026

The active method is now email OTP through Supabase Auth and Resend, with Google shown as coming soon. This supersedes earlier Google-only instructions. The initial admin is `prishi.ai.ventures@gmail.com`. See [EMAIL_AUTH.md](EMAIL_AUTH.md) for current setup and acceptance steps.
