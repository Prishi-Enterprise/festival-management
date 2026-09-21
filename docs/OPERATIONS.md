# Operations release

## Available now

- Festival desk for cash/online flat receipts, donations, expense bills, supplier advances/payments, holder transfers, opening funds, manual flat charges and refunds.
- Admin-created named cash/online accounts and supplier/reimbursement payees.
- Members see and edit only their own pending entries. Admins can review all entries, confirm and lock, unlock with a reason, or void pending entries. Admins cannot silently edit someone else's entry.
- Approved balances come from immutable signed postings. Unlock adds reversals; reconfirmation posts the new revision. All revisions are audited. Funds cannot be spent before their inflow is confirmed. Transfers conserve total funds. Refunds cannot exceed a flat's confirmed net payments.
- General aggregate overview only for assigned committee members granted Can view reports (off by default); named balances, supplier balances, flat statements, detailed register, CSV and print/PDF reports for admins.
- Meal calendar on each saved festival: breakfast/lunch/dinner individually covered by the fixed flat fee, per-person package, or not served. Lunch and dinner can both be selected. Guest prices are per service. No price is guessed if the default is blank. Under-seven resident pricing remains zero.
- No `is_dussehra` column or special-day readiness requirement. Calendar coverage is authoritative; the old applied migration remains historical and a new migration removes the column.

## Accounting conventions

Amounts are integer paise. A bill recognizes a cost but does not move cash. A supplier payment moves cash but does not recognize the same cost again. Supplier balances are computed at payee level: billed minus paid, with a negative value indicating an advance. Personal reimbursements use a named payee and the same bill/payment flow. Catering bills support allocation of confirmed supplier payments; general invoice allocation is not implemented.

A flat charge records a receivable, not a receipt. Charges currently require explicit admin entry and confirmation. Automated fixed/package/guest billing is deferred. Until then, do not interpret zero recorded charges as no liability. Cash/online split payments are entered separately.

The overview and report totals use confirmed revisions only. Pending entries are explicitly excluded and counted. Unlocking removes the entry from current approved totals until reconfirmation; history remains intact. Reports are live as-of exports, not immutable closing snapshots. CSV protects against spreadsheet formula injection.

Each submission has a stable request UUID. Identical retries of new entries are idempotent; changed payloads and stale revisions are rejected. Database checks enforce festival assignment, ownership, admin-only actions, cross-festival account integrity and direct-write denial. No service-role credential is used by the app.

## Candidate release — awaiting owner acceptance

Attendance, guest passes, catering quantities/payment allocation and event rosters are implemented in the launch candidate. Automatic billing remains deferred. See [ACCEPTANCE.md](ACCEPTANCE.md) for the final dev test.

Fixed-contribution receipts register named residents once. Split receipts reuse the enrollment. Confirmed net fixed receipts must cover the snapshotted fixed contribution before admission. Package receipts select a subset of these residents; only confirmed paid selections qualify for package services. Under-seven package selections can be registered at zero cost without creating a false money receipt. Additional people require guest registration.

Attendance is a dedicated day/meal page with flat/pass lookup and admitted headcounts. Guest registration creates a random, meal-specific shareable pass. Database checks reject over-admission, stale updates, cancelled passes and wrong-service check-in. Unlocking a qualifying payment prevents further resident admission while preserving history.

Catering tracks expected, admitted, ordered, served and billed quantities. Admins manage bills and allocate confirmed supplier payments without exceeding the available advance. Committee members see quantities without financial details. Special events support categories, participant rosters, check-in and CSV export.

Configure the meal calendar and rates before enrollment. The first fixed attendee list is immutable in this candidate; check names before saving. Attendance records headcounts rather than individual named checkboxes. Guest payment collection is manual; pass creation does not confirm payment.

## Verification and launch status

All 50 automated tests, lint, type checking and production build pass. Tests include authorization, payment eligibility/reversals, subset validation, free under-seven packages, pass limits, catering allocations and event permissions. Local browser testing confirmed resident enrollment, confirmed-payment admission and guest pass creation.

Tokyo remains dummy/test. Mumbai (`ap-south-1`) has the schema and the requested 224 flats, with no festival or financial test data copied. The official initial production admin invitation is `sb@prishi.in`; personal accounts remain development accounts. Production cutover is explicitly on hold for the owner's final dev test. Google remains coming soon. The highest role is `admin`, with last-admin protection.

Remaining later work: automatic billing, attachments, reconciliation cash counts, immutable closing snapshots and XLSX export. These are not part of this candidate.

## Entry field catalogue

Common financial fields: entry date, amount, category dropdown, description and
optional reference. Other requires its own free-text category detail. Cash/online
is determined by the selected account; entry creator, revision and review status
are recorded automatically.

| Financial entry type | Additional fields |
| --- | --- |
| Fixed contribution (flat payment) | Flat, receiving account, one-time fixed attendees/members by age group |
| Meal-package payment (requested as “flat charge”) | Flat, receiving account, package attendees selected from fixed attendees only |
| Donation | Receiving account |
| Expense bill | Supplier/payee |
| Supplier payment / advance | Supplier/payee, paying account |
| Holder transfer | Source account, destination account |
| Opening funds (admin) | Receiving account |
| Manual amount due (admin) | Flat; records an amount due, not money collected |
| Flat refund | Flat, paying account |

Operational fields:

| Operation | Entered fields | Derived or system-controlled fields |
| --- | --- | --- |
| One-time flat enrollment | Flat; named residents with adult, child 7–10 or under-seven age group; package member selection | Fixed-payment confirmation eligibility; covered meals from calendar |
| Guest registration | Host flat; day and meal; guest counts by age group | Unique meal-specific pass; registered/admitted/remaining quantities |
| Attendance marking | Day and meal; flat/pass lookup; admitted count | Eligible quantity, payment state, remaining allowance, operator and timestamp |
| Catering | Day and meal; supplier; ordered, served and billed plates; rate per plate; extras; notes | Expected eligible resident/guest quantities, checked-in quantities, bill total |
| Catering payment allocation (admin) | Existing confirmed supplier payment, amount allocated to the selected meal | Remaining available advance, allocated paid amount, balance due |
| Special event (admin) | Title, date, category, registration open/closed | Event identifier |
| Event participant | Event, flat, participant name, category, sequence, theme, notes, cancellation | Creator, revision, attendance status |
| Event attendance | Event participant, attended status | Operator and audit history |

Operational forms and migrations are prepared for dev acceptance; the candidate has not been released to the production domain.

## Clarified payment terminology and payee setup

The owner uses “flat charge” to mean collecting the meal-package amount. Present
that workflow as **Meal-package payment** to distinguish it from the current
ledger's `charge` entry, which records an amount due and does not receive money.
Fixed-contribution and meal-package receipts must both post as `collection`, with
the appropriate fixed category and receiving cash/online account. Do not relabel
existing `charge` records as receipts or change their historical posting meaning.
Automatic receivable generation remains deferred.

The fixed-contribution form owns the one-time attendee enrollment. A second receipt
or a cash/online split must reuse that same enrollment rather than duplicate it.
Package attendees must come from that enrollment; extra people use guest
registration and a service-specific pass. Enforce subset membership in the
backend, not only a form count limit. Package receipt confirmation must not
substitute for confirmation of the fixed contribution required for resident
attendance eligibility. These workflows are implemented in the candidate.

Supplier/payee creation is already available to admins: open the festival's
finance desk, find **Money holders & payees**, choose **Supplier / reimbursement
payee**, enter a name and click **Add payee**. It then appears in the payee dropdown
for expense bills and supplier payments/advances. For a member's reimbursement,
add that person's name as the payee, record the expense bill against them, then
record the payment from the account reimbursing them. This records the cost once
and settles the payable without counting the payment as a second expense.

## Report access

Admins set **Can view reports** when inviting or managing a committee member in People & access. It permits the general financial overview for assigned festivals only. Detailed reports and financial exports remain admin-only. Existing and new committee memberships default to denied. Revocation takes effect on the next request; already viewed data cannot be recalled. Attendance, event rosters, catering quantities and access to own entries remain available without financial report permission.
