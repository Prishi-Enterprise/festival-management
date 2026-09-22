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

## Dev rollout pending

1. Reconnect Supabase MCP (it currently requires authentication).
2. Apply the migration to the Tokyo dev project only, then benchmark the retained synthetic fixture and test authenticated read/check-in traffic.
3. Push `develop` to deploy the matching app; test search, pagination, QR and save/refresh in the signed-in dev browser.
4. Remove only the isolated synthetic society using the prepared scoped cleanup after measurements are complete.
5. Promote the migration and app to production after dev verification. Production is unchanged by this implementation.
