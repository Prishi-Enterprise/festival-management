# Radhe Festival

Committee application for festival collections, money custody, expenses, meals, catering, special events, and final reports.

**Status: public welcome page ready; full application under development.**

Target stack: Next.js with TypeScript and Supabase (Postgres, Auth, private Storage). Repository: public `Prishi-Enterprise/festival-management`, independently versioned under the PrishiAI workspace.

- [Product and delivery plan](docs/PLAN.md): scope, confirmed contribution rules, workflows, reports, milestones, local testing, and deferred hosting decision.
- [Technical implementation document](docs/IMPLEMENTATION.md): schema, accounting rules, permissions, transaction design, migration, tests, and deployment runbook.
- [Workbook analysis](docs/WORKBOOK_ANALYSIS.md): findings from all 12 sheets and reconciliation issues to resolve before importing historical accounts.

The source workbook describes 2025. Its rates are historical; the new rules supplied on 21 September 2026 take precedence. The next festival's dates and year remain to be configured.

Use **Supabase Free** with separate **dev** and **prod** database environments. Build and test Next.js on localhost against dev; use prod for the committee launch. Vercel or another app host will be evaluated after local acceptance. Promote reviewed schema migrations and approved live configuration, not the dev test dataset. No paid backend plan or app-hosting subscription is required for the local phase.

Google sign-in is invite-only. The only initial admin is `shivamastha@gmail.com`; admins can onboard committee Google accounts and appoint additional admins. Admins manage festival days, blocks/flats and charges. Ordinary committee members enter inflow/expenses, edit only their own entries until an admin confirms and locks them, and see a general overview; detailed financial reports are admin-only. Only an admin can unlock an entry for correction, which requires confirmation again. Resident self-service and payment gateway integration are deferred.

The original workbook, resident lists, receipts, exports, and credentials are excluded from Git. The documents contain aggregate analysis and illustrative examples, not a production data import.

## Welcome-page release

`public/` contains the standalone welcome page using the supplied Radhe Infinity logo and its gold/navy palette. Vercel serves only this directory. `main` deploys to `https://radhe.prishi.in`; development branches do not deploy automatically. This release has no login, API, database connection or environment-variable requirements. The Next.js admin application remains on its separate development branch in this same repository.

Preview locally with `python3 -m http.server 3001 --directory public`.
