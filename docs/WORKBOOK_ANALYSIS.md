# Workbook analysis

Reviewed 21 September 2026. Source: `Festivals in Radhe.xlsx`, supplied by the owner. Read-only inspection; the source was not modified. Sheet labels and notes are evidence, not instructions to execute.

## What the workbook currently does

The file combines a flat register, calculated contribution totals, donation records, expense records, manual holder balances, catering calculations, participant lists, and two final-report layouts. There are 12 worksheets. Many advertised worksheet dimensions include hundreds of empty formatted rows; they do not represent transactions.

| Sheet | Observed purpose | Application replacement |
| --- | --- | --- |
| Navratri Collection | Four side-by-side block registers; compulsory flag, adult/child counts, guests, rates and totals | Flats, festival enrollment, charges, and collection report |
| Navratri Donations | Amount, donor, category, date, collector, description | Donation records linked to verified receipts |
| Navratri Expense | Date, amount, category, Paid/Pending, payer, payee, description | Bills, payments, reimbursements and attachments |
| Overview | Income/expense summary; holder balances entered as long arithmetic expressions | Dashboard and derived account balances |
| Catering | Daily quantities, rates, meal costs, advances and remaining balances | Meal services, supplier bills and settlement report |
| Guest list | Date, host flat, guest count; merged date groups | Guest bookings per meal service |
| Mahila Aarati | Participant, flat, contribution, Gujarati rendering | Event participants with optional linked donations |
| Navratri Veshbusha | Name, flat, age category, gender, costume; translations | Configurable event roster and printable list |
| Aarati & Prasad | Day number and sponsor/organizer assignments | Daily event schedule and sponsor assignments |
| Navratri Hisab | English/Gujarati financial and category summary | Generated summary report |
| Navratri Hisab Detailed | Contributors, meals, donors, expenses, event lists and narrative | Generated detailed report with appendices |
| Ganesh Chaturthi | Another festival's participation and expenses | Separate festival using the same society/flat register |

## Historical control totals

These are workbook results, not independently verified bank/cash receipts. `Navratri Collection` calculates amounts from flags/counts multiplied by rates; it does not provide dated payment records or payment methods.

| Measure | Value | Evidence |
| --- | ---: | --- |
| Flat slots | 224, across four blocks | Navratri Collection, flat-number columns B/I/P/W, rows 6–61 |
| Compulsory contribution flags | 132 | Navratri Collection C62, J62, Q62, X62 |
| Compulsory amount | ₹2,77,200 at ₹2,100 per flat | Same columns, rows 63–64 |
| Adult meal enrollments | 221 at ₹1,000 | D/K/R/Y, rows 62–64 |
| Child meal enrollments | 21 at ₹500 | E/L/S/Z, rows 62–64 |
| Meal package amount | ₹2,31,500 | Adult and child totals above |
| Guests in collection totals | 92 at ₹200; ₹18,400 | G/N/U/AB, rows 62–64 |
| Calculated collection | ₹5,27,100 | Navratri Collection D1 and C65/J65/Q65/X65 |
| Donations | ₹1,28,146 | Navratri Donations B1; rows 3–35 |
| Opening balance | ₹1,342 | Overview B3 |
| Total funds including opening balance | ₹6,56,588 | Overview B6 |
| Listed expenses, all statuses | ₹6,41,756 | Navratri Expense B1; rows 3–34 |
| Expenses marked Paid | ₹6,36,088 | Independently summed rows where D = Paid |
| Expenses marked Pending | ₹5,668 | Navratri Expense B34 and Overview C9 |
| Funds minus all listed expenses | ₹14,832 | Overview B8 |
| Sum of manually tracked holdings | ₹14,652 | Overview C8, from G3:G11 |
| Daily catering dinner plates | 2,473 | Catering B7:B18 |
| Catering, water and buttermilk | ₹4,56,550 | Catering B1 |

The headline arithmetic recomputes as ₹1,342 + ₹5,27,100 + ₹1,28,146 − ₹6,41,756 = ₹14,832. That proves this calculation, not that every underlying collection was received or that ₹14,832 is physically held.

## Reconciliation and migration issues

| Finding | Evidence and impact | Required treatment |
| --- | --- | --- |
| Three different guest counts | Guest list B1 = 95; collection guest totals = 92; detailed report A49:A50 says 93/₹18,600 | Review at flat/date/meal level. Do not auto-select a total or book ₹600/₹200 adjustments. |
| No meal type on guest rows | Guest list has two groups dated 2 October (rows 44–49 and 50–58) | They may be lunch and dinner. Preserve both groups and ask the owner to classify; do not deduplicate on date + flat alone. |
| Possible repeated booking | Guest list rows 13–14 share flat and date | Could be separate additions; review before merging. |
| Mahila amount differs | Mahila Aarati B1 = ₹27,353; Navratri Donations B28 = ₹27,351 | ₹2 discrepancy; event contributions must link to receipts rather than be counted twice. C60 repeats the Mahila total and is not another donation. |
| Holder balances do not reconcile | Overview B8 = ₹14,832; C8 = ₹14,652 | ₹180 difference compares net funds after all expenses with holdings, so it is not yet a cash discrepancy on a consistent basis. |
| Paid and pending amounts are mixed | If calculated collections/donations all represent receipts, opening + receipts − paid expenses = ₹20,500, versus manual holdings ₹14,652 | Conditional reconciliation gap is ₹5,848. Overview C11 also displays −₹5,848. Review receipts, transfers and payer sources before determining its cause. |
| Summary report has inconsistent expense figures | Navratri Hisab B11 = ₹700, B12 = ₹6,40,556, B13 = ₹6,41,756; B11+B12 actually equals ₹6,41,256. F48 also equals ₹6,41,256 | Category/report totals are ₹500 below the expense ledger. Generate reports from one query basis. |
| Detailed report uses another basis | Navratri Hisab Detailed E100/A110 = ₹6,50,623; L107/D110 = ₹6,36,038; G110 = ₹14,585 | Compared with Overview, income differs by ₹5,965 and expense by ₹5,718. This may include scope exclusions; document decisions instead of labelling either report authoritative. |
| Inconsistent age labels | Collection E5/L5/S5/Z5 are stored as a date, apparently an age-range conversion; Hisab adult/child headings and Detailed B37/G37 also disagree | Historical age bands cannot be inferred reliably. Preserve raw labels. Use the user's new explicit age rules for the new festival. |
| Hardcoded holder arithmetic | Overview G3:G5 contain long lists of additions/subtractions without transaction identifiers | Do not parse these into invented receipts/transfers. Import approved opening balances or reconstruct from evidence. |
| Payment evidence is incomplete | Collection has no dated receipt, method, collector or destination account; donations/expenses name people but not cash versus bank accounts | Unknown method must remain unknown in staging. Never default missing payment method to cash. |
| Calendar is longer than “10 days” | Catering A7:A17 spans 22 September–2 October 2025 inclusive: 11 dates | Store explicit festival dates and named meal services; allow a separate Dussehra day. Do not generate exactly ten dates from the workbook. |
| Advances overlap expenses | Catering B4 = ₹4,25,250; C4/A19 shows equal utilized cost, with related payments in expense rows | Import each actual payment once; catering is a vendor report, not another expense ledger. |
| Unlabelled adjustment | Catering B20 = `235*20+4600+2190` = ₹11,490 | Preserve as a reviewed adjustment until its description is supplied. |
| Quantity units vary | Catering G17 = 22.5 and G18 = 222.5 | Water quantities need decimal units; person/plate counts remain integers. |
| Spreadsheet compatibility | Translation cells use Google-specific functions wrapped in cached fallback text; parser reports two pivot-cache relationship warnings | Preserve approved Gujarati text. Rebuild database reports; do not rely on Excel recalculation of Google functions or pivot caches. |

## Catering interpretation

`Catering B19:D19` computes dinner ₹2,96,760, snacks ₹90,600 and lunch ₹26,400. The ₹11,490 adjustment raises caterer cost to ₹4,25,250. Water is ₹12,500 and buttermilk ₹18,800, giving ₹4,56,550. The expense ledger's Kitchen category is ₹4,69,050, which includes another ₹12,500 beyond those catering components. The report describes disposables ₹3,000 and waiter tips ₹9,500. This distinction should remain visible as separate bill lines/categories.

Vendor buying rates (for example ₹120 per dinner plate historically) and resident/guest selling rates (historically ₹200 per guest) are different concepts. The application must never use one as the other.

## Recommended migration scope

Launch with the flat master and the next festival's verified configuration. Keep 2025 as a historical reference until its discrepancies are reviewed. The new application should not depend on completing a speculative reconstruction of 2025 payments.

For historical migration, stage every source row with file hash, sheet, row/cell locator, raw value, cached result, transformation and review status. Import approved records only. Keep report totals as reconciliation controls rather than new transactions. Do not import both participant-level donations and their rolled-up donation row as revenue. Do not mix Ganesh Chaturthi with Navratri.

## Method and limits

Inspected all sheets, source values, formulas, saved formula results, merged cells, populated rows and relevant totals with the bundled Python reader. Independently summed expense statuses, checked contribution arithmetic, compared guest and event controls, and inspected report differences. No cached Excel error values were found. Formula caches were not recalculated in Excel, and bank statements, physical cash counts and receipts were not supplied. The workbook is therefore a source for requirements and migration controls, not a verified closing ledger.
