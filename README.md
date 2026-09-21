# Radhe Festival

Committee application for festival collections, money custody, expenses, meals, catering, special events, and final reports.

**Status: admin foundation and six-digit email login are live. Finance workflows and configurable meal coverage are implemented and locally verified for the next release.**

Target stack: Next.js with TypeScript and Supabase (Postgres, Auth, private Storage). Repository: public `Prishi-Enterprise/festival-management`, independently versioned under the PrishiAI workspace.

- [Local development guide](docs/DEVELOPMENT.md): start local Supabase and Next.js, configure Google sign-in, and run checks.
- [Product and delivery plan](docs/PLAN.md): scope, confirmed contribution rules, workflows, reports, milestones, local testing, and hosting setup.
- [Technical implementation document](docs/IMPLEMENTATION.md): schema, accounting rules, permissions, transaction design, migration, tests, and deployment runbook.
- [Workbook analysis](docs/WORKBOOK_ANALYSIS.md): findings from all 12 sheets and reconciliation issues to resolve before importing historical accounts.

The source workbook describes 2025. Its rates are historical; the new rules supplied on 21 September 2026 take precedence. The next festival's dates and year remain to be configured.

Use **Supabase Free** and **Vercel Hobby**. The only hosted Supabase project is `pokeislmfmfuqgfkxmzp` (main/production). Development uses local Supabase. Hosted branches require Pro and are not part of this setup. Do not use main as a disposable development database or create another hosted project.

The Vercel project [`radhe-festival`](https://vercel.com/prishi-ai/radhe-festival) has been created and `radhe.prishi.in` attached. The GoDaddy CNAME and welcome deployment are verified. The owner has made the existing repository public to enable Vercel Git integration; no second repository is planned. Deployment still follows local end-to-end acceptance. See [Hosting and environment setup](docs/HOSTING.md) for exact DNS, environment mapping and remaining decisions.

Email OTP sign-in is invite-only; Google is retained as coming soon. The final-launch official admin will be `sb@prishi.in`; the current development admin is `prishi.ai.ventures@gmail.com`. admins can onboard committee email accounts and appoint additional admins. Admins manage festival days, blocks/flats and charges. Ordinary committee members enter inflow/expenses, edit only their own entries until an admin confirms and locks them, and see a general overview; detailed financial reports are admin-only. Only an admin can unlock an entry for correction, which requires confirmation again. Resident self-service and payment gateway integration are deferred.

The original workbook, resident lists, receipts, exports, and credentials are excluded from Git. The documents contain aggregate analysis and illustrative examples, not a production data import.

Admin foundation checks: 33 embedded-PostgreSQL/validation tests, lint, TypeScript and production build pass. See [Email authentication](docs/EMAIL_AUTH.md) for OTP setup and Google activation later. Vercel deploys main automatically. GitHub Actions setup is deferred because the connected GitHub token does not have workflow scope.

- [Email authentication](docs/EMAIL_AUTH.md): Resend delivery, OTP templates, initial admin and testing.

- [Operations release](docs/OPERATIONS.md): implemented finance and meal-calendar behavior, accounting conventions, tests and remaining delivery work.
