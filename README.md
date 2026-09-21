# Radhe Festival

Committee application for festival collections, money custody, expenses, meals, catering, special events, and final reports.

**Status: planning complete; application implementation has not started.**

Target stack: Next.js with TypeScript and Supabase (Postgres, Auth, private Storage). Repository: private `prishi-ai/festival-management`, independently versioned under the PrishiAI workspace.

- [Product and delivery plan](docs/PLAN.md): scope, confirmed contribution rules, workflows, reports, milestones, hosting recommendation, and open decisions.
- [Technical implementation document](docs/IMPLEMENTATION.md): schema, accounting rules, permissions, transaction design, migration, tests, and deployment runbook.
- [Workbook analysis](docs/WORKBOOK_ANALYSIS.md): findings from all 12 sheets and reconciliation issues to resolve before importing historical accounts.

The source workbook describes 2025. Its rates are historical; the new rules supplied on 21 September 2026 take precedence. The next festival's dates and year remain to be configured.

Google sign-in is invite-only. The only initial admin is `shivamastha@gmail.com`; admins can onboard committee Google accounts and appoint additional admins. Admins manage festival days, blocks/flats and charges. Ordinary committee members enter inflow/expenses, edit only their own entries and see a general overview; detailed financial reports are admin-only. Resident self-service and payment gateway integration are deferred.

The original workbook, resident lists, receipts, exports, and credentials are excluded from Git. The documents contain aggregate analysis and illustrative examples, not a production data import.
