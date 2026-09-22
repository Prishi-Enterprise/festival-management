# Attendance performance

The attendance screen previously called `operations_data`, expanding every enrolled flat across every meal, and then filtered and paginated in the browser. A 224-flat, 30-meal fixture produced 6,820 attendance rows including guests. Eligibility was recomputed separately for each age group.

Migration `202609220006_attendance_queries.sql` adds `attendance_data(festival, query)` and a partial index on confirmed fixed-contribution receipts/refunds. The RPC:

- Checks society context and festival access on every call; anonymous callers cannot execute it. It takes no festival write lock.
- Aggregates fixed-payment balances and paid/free package membership once. It computes eligibility only for the selected meal.
- Filters flat/phone/pass searches in PostgreSQL and returns up to ten resident and ten guest cards, with stable ordering and clamped page numbers.
- Computes whole-meal eligibility, RSVP and check-in totals independently of search, scan and pagination.
- Resolves scanned resident/guest tokens even when their card is outside the current page. Guest packages use the selected meal's check-in count.

The authenticated `GET /desk/[id]/attendance/records` endpoint validates inputs, sends private/no-store responses and includes `Server-Timing` for authentication and the database call. Browser searches are debounced and obsolete requests are aborted. Old check-in forms are disabled while a new result is loading or a read fails.

Successful check-ins refresh this paged endpoint. They invalidate report/operations pages for subsequent visits without refreshing the desk layout. Database optimistic version checks, confirmation rules and administrator-only count reductions remain unchanged. A manual refresh button supports concurrent operators. Other operations screens still use their existing aggregate RPC; this change does not optimize them.

## Local validation, 22 September 2026

Same synthetic fixture in local PGlite: 224 flats, 896 members, 448 confirmed receipts, 30 meals and 100 guests.

| Read | Samples | Query + local serialization time | JSON size |
| --- | ---: | --- | --- |
| Previous all-festival aggregate | 3 | 7,878–8,092 ms | 2,710,334 bytes |
| Selected meal with ten cards per list | 20 | 17.08–23.69 ms | 28,289–28,510 bytes |

These are local measurements, not hosted latency or a concurrent-user capacity claim. Artifacts are in the sibling `festival-load-test/results/attendance-local-optimized.json`; the private synthetic fixture must not be committed.

Regression tests cover totals against the previous implementation, fixed/package/free-child eligibility, pending receipts, refunds, RSVP caps, pagination, normalized search, off-page QR lookup, guest-package meal counts, check-in version conflicts and anonymous/other-society access. Route/action tests cover private caching, request validation, permission errors and scoped refresh behavior.

## Hosted dev verification, 22 September 2026

Migration applied to Tokyo dev (`pokeislmfmfuqgfkxmzp`). Application commit `52a1f20` deployed successfully to https://dev.festivals.prishi.in (GitHub deployment `6586814032`). Production was not changed.

On the same remote fixture, two isolated old aggregate reads took **7,150–7,171 ms**, returning **2,953,806 bytes**. Ten selected-meal reads took **27.88–47.05 ms**, returning **30,263–30,303 bytes**. The first separately explained optimized read took **176 ms**, with no temporary blocks and 3,958 shared buffer hits versus the prior aggregate's 752,315. Timings exclude HTTP authentication, rendering, network transfer and MCP transport overhead. Local and remote JSON-size measurements used different serializers and should not be compared byte-for-byte.

Ten concurrently dispatched management-API requests completed 30 authorized database reads and 30 resident check-ins without errors. Read execution was 28–50 ms and check-in execution 2–12 ms. Ten distinct household rows ended with three check-ins each. The management layer may serialize requests, so this does **not** establish simultaneous database sessions, HTTP concurrency or a supported-user limit. Sustained authenticated HTTP load testing remains a separate validation.

Signed-in Chrome checks on dev passed: initial ten-card pages and whole-meal totals, next page (11–20 of 224), normalized flat search for D-156, resident and guest QR-link lookup, and both resident and guest check-in saves with counts refreshed on screen. Physical camera scanning was not repeated. Anonymous execution of the new RPC remains denied.

The synthetic society was removed using identity-guarded cleanup. Verified remaining dev data: one society, four blocks, 224 flats, only `sb@prishi.in` as the active administrator/auth user, and zero festivals, finance entries, enrollments or guests.

## Production rollout

After user acceptance on dev, apply `202609220006_attendance_queries.sql` to Mumbai production before promoting the matching `develop` application commit to `main`. The existing aggregate remains available for other screens.
