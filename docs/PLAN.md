# Product and delivery plan

Version 1.0 · 21 September 2026 · Planning baseline

## Outcome

Replace the festival workbook with a phone-friendly committee application. Each receipt, expense, transfer, meal booking and event registration is entered once. Admins can see flat dues, each person's cash/online holdings, supplier balances and detailed reports. Committee members can enter inflow/expenses, edit their own entries, work with operational lists and see a general overview.

This delivery contains the plan, technical design and workbook analysis. Building and deploying the application is the next phase; no live backend or hosting subscription has been provisioned.

## Confirmed decisions

- Separate private GitHub repository: `prishi-ai/festival-management`, supplied by the owner and checked out inside the PrishiAI workspace with independent Git history.
- Next.js frontend/server application and Supabase backend.
- Supabase **Free** for now; the owner has reviewed the allowed usage. No paid-plan upgrade is part of the current scope.
- Use the Supabase **dev** database environment during development/testing and switch the launch application to the separate **prod** environment for committee use. Keep credentials, test data and live records separate.
- Build and test the complete application on localhost first. Select Vercel or another app host only after local end-to-end acceptance. Domain/hosting decisions do not block local development.
- Committee-only first release. Committee members enter information on behalf of flats and guests.
- Google sign-in through Supabase Auth, restricted to Google accounts previously onboarded/invited by an admin.
- The only initial admin is `shivamastha@gmail.com`. Admins can assign additional admins and manage committee membership.
- Admins configure festival days, blocks/flats and charges on the festival page. Rates remain in the database and ordinary committee members cannot edit them. This latest requirement supersedes the earlier database-only rate-management preference.
- Committee members can register inflow/expenses and edit their own entries until an admin confirms and locks each entry. Only an admin can unlock it for correction; it then requires confirmation again. General overview is available to committee members; detailed financial reports are admin-only.
- Under-seven meal contribution is ₹0. These children still count as people attending.
- Domain details will be supplied later. Use an existing-domain subdomain rather than buying another domain.
- Historical workbook rates describe 2025 and do not override the rules below.

## Contribution and meal rules

| Charge | Confirmed rule | Application behavior |
| --- | --- | --- |
| Compulsory flat contribution | ₹2,500 per flat | One flat charge per festival, regardless of optional dinner enrollment |
| Adult dinner package | ₹1,200 per person | One package charge covering dinners from 2nd through 9th Navratri |
| Child dinner package | ₹600 per child aged 7–10 inclusive | Same package coverage; keep age classification at festival start |
| Under-seven | ₹0 | Record enrollment and attendance without creating a payment due |
| Guest meal | Per-person rate for the specific day's meal | Admin configures by meal service; stored in DB; rate not yet supplied for the new festival |

Treat people above ten as the adult pricing band, and age 7 through 10 as the child band. This is a pricing category, separate from legal adulthood or event age groups. Date of birth is optional: a committee-entered age/category at festival start is sufficient unless exact-age tracking is wanted.

The fixed contribution covers mandap, decoration, prasad, DJ, puja arrangements, daily breakfast, first-day dinner, and Dussehra lunch and dinner. Dussehra meals were explicitly included in the user's first list; the shorter repeated list does not revoke them.

The household headcount covered by the flat fee has not been specified. Proposed default for confirmation: all registered resident members, with guests charged separately. The database must represent the policy explicitly before live billing. Under-seven ₹0 is confirmed for resident meal contributions; any separate guest age concession needs confirmation before guest booking opens.

Use explicit meal services, with date, meal type and coverage rule. Package eligibility, RSVP count, actual attendance and caterer-billed plates are separate values. A paid package is not proof of attendance, and a zero-price attendee is still a diner. Package no-shows do not automatically reduce the charge; cancellation/refund policy remains to be confirmed.

Illustrative calculation: one flat + two adults + one child aged 8 + one child aged 5 = ₹2,500 + ₹2,400 + ₹600 + ₹0 = **₹5,500** before guests or donations. Two guests at a hypothetical ₹200 service rate add ₹400. ₹200 is an example, not the configured new guest rate.

## First release

| Module | Included functionality | Completion condition |
| --- | --- | --- |
| Festival setup (admin only) | Create festival, configure day count/dates, blocks/flats, fixed/adult/child/guest charges, free-child rule and meal calendar | Flat/age/package rules are validated before charges are generated |
| Flat accounts | Search by block/flat, enrollment counts, charge breakdown, receipts, credit and outstanding amount | Split and partial payments reconcile to a flat statement |
| Collections | Cash, UPI/bank receipts, donations, collector, destination account, reference and receipt number | Receipt appears exactly once in reports and its destination balance |
| Money holders | Named cash wallets and online accounts; transfers and cash counts | Account balances derive from transactions and show reconciliation differences |
| Expenses | Bills, categories, supplier, attachment, due/part-paid/paid status, advances and personal reimbursements | Bill cost and payment totals are separate and traceable |
| Daily meals | Flat-wise resident/child/guest counts, confirmation, cutoff, print/export and check-in | A usable dinner sheet exists for every selected date |
| Catering | Ordered/served/billed plates, per-service buying rates, extras, advances, settlements | Daily and cumulative vendor reports reconcile without duplicate expenses |
| Special events | Mahila Aarati, Veshbusha/Beshbusha and other rosters; sponsors and prasad schedule | Printable participant lists with optional linked contributions |
| Reports | Dashboard, final summary, detailed report, CSV/XLSX and print-to-PDF | The same approved records produce every financial total |
| Users (admin only) | Invite/onboard Google accounts, activate/deactivate membership, assign another admin; audit and close/reopen | Only approved Google accounts enter the app; ownership and role restrictions hold at DB/API level |

## Users and the two admin pages

**Festival management:** create/select festival, configure an arbitrary day count with explicit dates, designate Dussehra and included/package meal services, manage blocks and flats, set contribution rates and guest prices, and select participating committee members. Default duration is ten days, but the administrator can change it. Reject overlapping/missing service coverage; do not hardcode a fixed ten-date calendar.

**User management:** onboard/invite an exact Google email, assign it to festivals, see invited/active/deactivated status, revoke access, and promote an existing onboarded account to admin. The first admin is `shivamastha@gmail.com`; additional admin accounts exist only after an explicit admin action. Prevent removal/demotion of the last active admin.

Committee members have a **My entries** page for their inflow and expenses. Ownership is the authenticated creator and cannot be reassigned by editing a request. Entries remain editable by their creator while **Awaiting confirmation**. An admin reviews the entry and uses **Confirm and lock**, making that revision confirmed and read-only. Members can still view their own locked entries but cannot edit or delete them. Only an admin can **Unlock for correction**, with a reason; the entry returns to Awaiting confirmation and the creator can edit it again. Reconfirmation is required after unlocking, even if no edit was made. Admin-created entries use the same explicit confirmation action.

Draft edits update the draft; edits to posted amounts, payment methods or accounts create linked reversal/replacement entries in one transaction while preserving the original history. The admin lock applies to both edit paths and associated financial attachments/allocations. Admins also unlock before correcting an entry. Closed festivals require admin reopening first; reopening a festival does not automatically unlock its entries.

Admin finance screens include an Awaiting confirmation filter and a per-entry review action. My entries shows the status, confirmation time and confirming admin. Operational balances continue to reflect all posted, payment-verified entries, with pending-admin-review totals clearly identified; confirmation itself never posts money again. Final closing reports require all included inflow/expense entries to be confirmed and locked.

General overview shows aggregate collection, expense, cash/online totals and relevant meal/event totals, without other members' transaction rows, named-holder balances, receipt images, payer details or private references. Detailed ledgers, holder reconciliation and detailed financial exports require admin access. Members may view their own entry details and supporting evidence. Hiding a page link is not sufficient authorization.

Deferred: resident logins, payment gateway, automatic bank/UPI verification, WhatsApp/SMS automation, native mobile app, general-purpose accounting, full offline synchronization and multi-society commercial SaaS. Recording an online payment does not initiate or verify a bank transaction.

## Daily workflow

### Before the festival

1. Admin creates the festival, configures dates/day count, blocks/flats, rate version and service calendar.
2. Admin verifies eligible flats, confirms opening cash/bank holdings and invites committee Google accounts.
3. Committee records each flat's residents and optional package enrollments. The app displays the calculated charge before posting it.
4. Admins and committee members record receipts into permitted cash/online accounts. Cash/online split payments create separate receipt records under one collection reference.
5. Meal coordinator confirms resident RSVPs for included and package services. Package enrollment can prefill a proposed list; it must show whether counts are confirmed.

### During the festival

1. Record new collections and donations; retain pending online claims separately until verified.
2. Update the day's resident meal RSVPs and guest additions by host flat and meal service. Adding a guest creates a charge, not a receipt.
3. At the configured cutoff, freeze a numbered dinner-list revision and send/export its totals for catering. Committee overrides after cutoff require a reason and create a new revision/delta.
4. Check in diners by flat/count. Count guests, children and complimentary attendees explicitly; record excess walk-ins with a reason.
5. Record catering quantities and invoices, supplier payments, cash handovers and bank transfers.
6. Admin reconciles each holder/account, reviews unpaid bills, flat dues, unallocated receipts and attendance differences, and confirms/locks reviewed inflow and expense entries. Members can correct their own unlocked entries and view the general overview.

### Closing the festival

Reconcile collections and holders, approve vendor bills/credits and outstanding liabilities, resolve exceptions, and confirm/lock all included inflow/expense entries before generating a numbered closing report. Lock the festival against further financial posting. An admin can reopen with a recorded reason, producing a new report revision; retain old reports for comparison. Individual entries remain locked until explicitly unlocked by an admin.

## Money tracking in plain language

Every person may hold a cash wallet, an online collection account, or both. The collector, the person who enters the record, and the owner of the receiving account can be different people. UPI is a payment method, not an independent balance: the balance belongs to its bank/collection account.

A ₹10,000 handover from one committee cash wallet to another changes the two balances and leaves total collections unchanged. A ₹5,000 catering advance reduces held funds but is not a second catering expense when the final invoice arrives. A volunteer paying a bill personally creates money owed to that volunteer; it does not reduce committee cash until reimbursed.

Display these separately: actual cash/online funds held, resident dues, vendor advances, unpaid supplier bills, volunteer reimbursements, and expense-based surplus. This addresses the mixed Paid/Pending and manual-holder formulas found in the workbook.

## Daily dinner sheet

Header: festival, date, meal, cutoff, revision, generated time and coordinator. Sort by block then flat, with filters for confirmed/unconfirmed/attended.

| Flat | Adults | Age 7–10 | Under 7 | Guests | Expected total | Checked in | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| A-101 (example) | 2 | 1 | 1 | 2 | 6 | 0 | Confirmed |

Include block totals and a grand total. Separately show volunteer/complimentary diners, approved catering buffer, and plates ordered. An unpaid flat may be flagged to the admin, but the food list must not automatically exclude diners unless an explicit committee policy is configured. Catering-facing exports omit payment, contact and unnecessary personal details.

Support both flat-wise count sheets and an optional named resident roster. Anonymous guest counts are sufficient; guest names are optional. Print on A4 with repeated column headers and page numbers; provide XLSX for committee use.

## Special events

Mahila Aarati: participant name, flat, sequence/group, attendance and optional contribution linked to an existing receipt. Veshbusha: participant name, flat, configured age group, costume/theme, optional category, sequence and attendance. Event age groups are independent from meal pricing bands. Aarati/prasad: date/day, sponsor or organizer, linked flats and notes.

Use English/Gujarati display fields and Unicode-capable exports. Preserve curated translations; automatic translation is not required. Avoid mandatory gender or date-of-birth fields unless the event needs them. Participants can be registered without requiring a financial transaction.

## Reports

| Report | Required contents |
| --- | --- |
| General overview (committee and admin) | Aggregate collections/expenses, total cash/online holdings, meal/event totals; no other members' detailed entries or named-holder balances |
| Summary | Opening funds; verified receipts by source/method; payments; closing holdings; recognized expenses; surplus; dues; advances; unpaid liabilities; reconciliation status |
| Detailed financial report | Flat charge/receipt/dues register, receipt ledger, donation register, expense bills and payment allocations, transfers, holder balances, reimbursement register and adjustments |
| Catering report | Date/service, resident and guest expectations, ordered/served/billed plates, unit rates, extras, bill amount, advance paid/applied, subsequent payments and remaining vendor balance |
| Operational appendix | Daily meal sheets, Mahila Aarati/Veshbusha lists, sponsor/prasad schedule and relevant event notes |
| Resident-shareable summary | Approved aggregate summary without private account identifiers, receipt attachments or personal contact data |

Final financial summary, detailed financial report, financial catering settlement and private appendices are admin-only. Committee users can access the general overview, their own entries and permitted operational rosters. All reports use the same date boundaries and approved posting rules, with INR formatting, Asia/Kolkata dates, as-of time, report version and included/excluded statuses. A closing report is a saved snapshot rather than an editable spreadsheet total. Downloading/sharing reports is manual in the first release.

## Delivery sequence and acceptance

Indicative effort for one full-time developer: **21–32 working days** through local end-to-end acceptance, after required integration access and business decisions are available. Hosted deployment will be estimated after choosing the provider. This is an estimate, not a fixed deadline.

| Phase | Effort | Deliverable and exit condition |
| --- | --- | --- |
| 0. Decisions and foundation | 3–5 days | Configure Next.js/Supabase, Google sign-in, admin bootstrap, invitations, both admin pages, migrations and CI; role/ownership tests pass |
| 1. Flat billing and custody | 5–7 days | Charges, receipts, donations, holder wallets and transfers; retries cannot duplicate money and transfers preserve overall balance |
| 2. Expenses and catering | 4–6 days | Bills, advances, settlements, personal reimbursements and quantities; one complete supplier scenario reconciles |
| 3. Meals and events | 4–5 days | Daily sheets, guests, cutoff/revisions, check-in, special-event lists; duplicate/concurrent actions behave correctly |
| 4. Reports and controlled import | 3–5 days | Summary/detailed exports and flat-master import; all report totals tie and historical discrepancies are quarantined |
| 5. Local end-to-end acceptance | 2–4 days | Run Next.js on localhost against Supabase Free dev; complete Google login, finance, permission/lock, meal, event, export and recovery tests; committee walkthrough passes |

After phase 5, choose app hosting and plan deployment, custom-domain setup and hosted smoke tests as a separate step. No hosted preview or paid staging environment is required to finish the local phase.

If timing is tight, defer historical transaction import and automated PDF generation first. Keep collections, balances, expenses, dinner sheets and reconciliation in the launch scope.

## Backend and local-first delivery

**Confirmed: Supabase Free, separate dev/prod database environments, and a locally running Next.js app during development.** The owner has checked the allowed usage. Keep the current plan within that choice; no upgrade, paid compute or additional staging environment beyond dev/prod is assumed.

Use local Supabase for resettable migration/unit/integration tests and the owner's Supabase **dev** environment for real Google OAuth, Auth, RLS and Storage integration from localhost. Keep test data synthetic. The frontend runs locally even when it connects to hosted dev; real integration tests require network access. At launch, apply the same reviewed migrations to **prod**, configure its own Auth/Storage and credentials, load approved live configuration, and point the committee application to prod. Do not copy dev financial records or test users into prod.

Local acceptance covers invited Google login, initial/admin promotion flows, festival and flat setup, charges, collections, expenses, own-entry editing, admin confirmation/locking/unlocking, overview/detail access, holder balances, guests, meal sheets, events and exports. Reconcile the full sample festival and verify a production-mode Next.js build running locally before discussing deployment.

**App hosting is undecided.** After local acceptance, compare Vercel and other suitable providers against the tested app's runtime, custom-domain needs, expected usage, eligibility and current costs. Select a provider then and attach the existing domain afterward. The previous paid hosting recommendation and budget are not the current baseline.

Maintain operator-managed database exports and separate attachment backups for the Free setup. Exercise restoration locally. No paid backup feature or hosted preview is a prerequisite for local completion.

## Inputs still needed

| Input | Needed before |
| --- | --- |
| Supabase dev URL/reference, publishable key and operator access | Local app integration; secrets belong in environment settings, not this document |
| Supabase prod URL/reference, publishable key and operator access | Committee launch after local acceptance; keep separate from dev credentials/data |
| Actual festival dates, Dussehra date and meal calendar | Creating live services and package coverage |
| Guest price by service/day; guest age policy | Opening guest bookings |
| Household entitlement under the compulsory fee | Enabling included-meal enrollment |
| Package cancellation/partial-attendance refund rule and RSVP cutoff | Final meal workflow acceptance |
| Committee Google emails, festival assignments, wallets/accounts and verified opening balances | Live access and finance setup; initial admin email is already confirmed |
| Google Cloud OAuth client and consent-screen access | Google sign-in setup; store the client secret only in Supabase provider settings |
| Domain/subdomain, DNS provider and hosting choice/budget | Deferred until local end-to-end tests pass; not needed for localhost testing |
| Historical discrepancies and migration scope | Importing 2025 transactions; not required for a clean new festival |

## Local acceptance and later launch

Complete a local rehearsal covering one flat payment split across cash/UPI, a holder handover, a vendor advance and final bill, a personal reimbursement, a guest cancellation, a free child, a meal-list revision, an event contribution and final reports. Verify member editing before confirmation, rejection after locking, admin unlock/reconfirmation, and admin-only detailed reports. All money and attendance totals must reconcile, and recovery from an operator export must work. Record test results before choosing hosting. Later, repeat domain/auth and critical-flow smoke tests on the selected host before going live; prepare the printed dinner-list fallback then.
