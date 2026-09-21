# Radhe Festival

Committee application for festival collections, money custody, expenses, meals, catering, special events, and final reports.

**Status: admin foundation ready for deployment. Google OAuth activation is required for live sign-in.**

Target stack: Next.js with TypeScript and Supabase (Postgres, Auth, private Storage). Repository: public `Prishi-Enterprise/festival-management`, independently versioned under the PrishiAI workspace.

- [Local development guide](docs/DEVELOPMENT.md): start local Supabase and Next.js, configure Google sign-in, and run checks.
- [Product and delivery plan](docs/PLAN.md): scope, confirmed contribution rules, workflows, reports, milestones, local testing, and hosting setup.
- [Technical implementation document](docs/IMPLEMENTATION.md): schema, accounting rules, permissions, transaction design, migration, tests, and deployment runbook.
- [Workbook analysis](docs/WORKBOOK_ANALYSIS.md): findings from all 12 sheets and reconciliation issues to resolve before importing historical accounts.

The source workbook describes 2025. Its rates are historical; the new rules supplied on 21 September 2026 take precedence. The next festival's dates and year remain to be configured.

Use **Supabase Free** and **Vercel Hobby**. The only hosted Supabase project is `pokeislmfmfuqgfkxmzp` (main/production). Development uses local Supabase. Hosted branches require Pro and are not part of this setup. Do not use main as a disposable development database or create another hosted project.

The Vercel project [`radhe-festival`](https://vercel.com/prishi-ai/radhe-festival) has been created and `radhe.prishi.in` attached. The GoDaddy CNAME and welcome deployment are verified. The owner has made the existing repository public to enable Vercel Git integration; no second repository is planned. Deployment still follows local end-to-end acceptance. See [Hosting and environment setup](docs/HOSTING.md) for exact DNS, environment mapping and remaining decisions.

Google sign-in is invite-only. The only initial admin is `shivamastha@gmail.com`; admins can onboard committee Google accounts and appoint additional admins. Admins manage festival days, blocks/flats and charges. Ordinary committee members enter inflow/expenses, edit only their own entries until an admin confirms and locks them, and see a general overview; detailed financial reports are admin-only. Only an admin can unlock an entry for correction, which requires confirmation again. Resident self-service and payment gateway integration are deferred.

The original workbook, resident lists, receipts, exports, and credentials are excluded from Git. The documents contain aggregate analysis and illustrative examples, not a production data import.

Admin foundation checks: 20 embedded-PostgreSQL/validation tests, lint, TypeScript and production build pass. Real Google OAuth requires the owner to configure the Google client. Vercel deploys main automatically. GitHub Actions setup is deferred because the connected GitHub token does not have workflow scope.
