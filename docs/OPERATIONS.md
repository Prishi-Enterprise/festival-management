# Operations release

## Available now

- Festival desk for cash/online flat receipts, donations, expense bills, supplier advances/payments, holder transfers, opening funds, manual flat charges and refunds.
- Admin-created named cash/online accounts and supplier/reimbursement payees.
- Members see and edit only their own pending entries. Admins can review all entries, confirm and lock, unlock with a reason, or void pending entries. Admins cannot silently edit someone else's entry.
- Approved balances come from immutable signed postings. Unlock adds reversals; reconfirmation posts the new revision. All revisions are audited. Funds cannot be spent before their inflow is confirmed. Transfers conserve total funds. Refunds cannot exceed a flat's confirmed net payments.
- General aggregate overview for assigned committee members; named balances, supplier balances, flat statements, detailed register, CSV and print/PDF reports for admins.
- Meal calendar on each saved festival: breakfast/lunch/dinner individually covered by the fixed flat fee, per-person package, or not served. Lunch and dinner can both be selected. Guest prices are per service. No price is guessed if the default is blank. Under-seven resident pricing remains zero.
- No `is_dussehra` column or special-day readiness requirement. Calendar coverage is authoritative; the old applied migration remains historical and a new migration removes the column.

## Accounting conventions

Amounts are integer paise. A bill recognizes a cost but does not move cash. A supplier payment moves cash but does not recognize the same cost again. Supplier balances are computed at payee level: billed minus paid, with a negative value indicating an advance. Personal reimbursements use a named payee and the same bill/payment flow. Per-invoice payment allocation is not yet implemented.

A flat charge records a receivable, not a receipt. Charges currently require explicit admin entry and confirmation. Automated fixed/package/guest billing will be added with enrollment and attendance workflows. Until then, do not interpret zero recorded charges as no liability. Cash/online split payments are entered separately.

The overview and report totals use confirmed revisions only. Pending entries are explicitly excluded and counted. Unlocking removes the entry from current approved totals until reconfirmation; history remains intact. Reports are live as-of exports, not immutable closing snapshots. CSV protects against spreadsheet formula injection.

Each submission has a stable request UUID. Identical retries of new entries are idempotent; changed payloads and stale revisions are rejected. Database checks enforce festival assignment, ownership, admin-only actions, cross-festival account integrity and direct-write denial. No service-role credential is used by the app.

## Remaining delivery work

1. Household/package enrollment and automatic charge generation with rate snapshots.
2. Guest bookings, per-service dinner/meal lists, cutoff and attendance.
3. Catering plate counts and generated bills connected to the existing supplier advance/payment ledger; bill attachments and invoice allocations.
4. Mahila Aarati and Veshbusha rosters, sponsor/prasad schedules.
5. Reconciliation cash counts, immutable closing snapshots, XLSX export and full festival rehearsal.

The meal calendar is configurable now; it does not yet create enrollments, attendance or automatic charges. Saved service dates must stay in the festival calendar to preserve their identity. Operational test data exists only locally.

## Verification

Database tests cover ownership, admin confirmation, locked/stale edits, reversal/reconfirmation, double-submit retries, balance conservation, overdrafts, payee bill/payment separation, private detail restrictions, invalid and cross-festival references, configurable service coverage and removal of the special-day flag. Local browser acceptance saved and confirmed a ₹2,500 receipt, reconciled it in the report, and saved fixed lunch plus package dinner with distinct guest prices. Six-digit OTP delivery, verification and replay rejection passed locally.

## Official admin at final launch

`sb@prishi.in` is the official production administrator. The existing `prishi.ai.ventures@gmail.com` account remains available during development; it and `shivamastha@gmail.com` are personal emails. Before committee launch, invite the official address, verify real OTP delivery and admin access, and complete the personal-account access handover. Never remove the last working admin or rewrite an applied bootstrap migration. The highest role is currently `admin`; there is no separate superadmin tier.

## Deployment verification

Release `37dd063` deployed successfully to Vercel on 21 September 2026. The finance, meal-calendar and special-day-removal migrations are applied to the single hosted project. The database confirms `is_dussehra` is absent; no synthetic financial entries or meal services were inserted in production. The live admin page displays the new meal editor. A new six-digit code was delivered to Gmail and successfully authenticated the existing development admin. All 33 tests, lint, type checking and production build pass.
