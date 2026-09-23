# Dev load-test report

22 September 2026. Target: https://dev.festivals.prishi.in and its Tokyo Supabase project `pokeislmfmfuqgfkxmzp`. Production was not tested or modified.

## Findings

- Public RSVP, resident-pass and guest-pass server-rendered pages completed the 200-concurrent-request stage with no errors and 1.515-second p95 latency.
- Anonymous RSVP RPC saves completed the 200-concurrent-request stage with no errors and 0.764-second p95 latency. All 200 checked households matched the expected saved counts and versions.
- The full attendance `operations_data` query took **9.931 seconds in the database for a single call**. This is a material latency issue for committee screens at full festival enrollment.
- **The application's maximum capacity is not established.** Tested concurrency is not a supported-user guarantee. The heaviest authenticated workflow has not passed a concurrent end-to-end test.

## Fixture

An isolated synthetic society, 224 flats, 896 residents, a 10-day festival with 30 meal services, 448 confirmed receipts with matching ledger postings, meal-package memberships and 100 guest passes. The existing administrator acted as fixture author. No new Auth user, invitation, email or real phone contact was created. Synthetic contact uses a fictional +1-202-555 number. Radhe Infinity's records were not used for writes.

## Method and instrumentation

Node HTTP load generator on this Mac. Closed-loop virtual workers continuously issue requests without think time. Normal stages stop after 15 seconds or 200 requests; extended stages after 30 seconds or 2,000 requests. Requests use a 15-second timeout and disable redirects. Stop conditions: error rate above 5%, p95 above 8 seconds or 150 MB response data per run. Only the exact dev domain and dev project are allowed.

Measurements: full-response latency, TTFB, p50/p95/p99/max, achieved throughput, status/semantic failures, response bytes, client CPU and event-loop delay. SQL instrumentation: initial database counters, a connection/wait snapshot, and EXPLAIN ANALYZE with buffer/temp-block counts for attendance.

Public page requests cycle between three real application routes and verify the synthetic festival marker in successful HTML. They include Next.js server rendering and the database read, but **do not measure browser assets, hydration, camera scanning or interaction responsiveness**. Each RSVP worker owns a separate flat and sends versioned writes to the real anonymous `save_resident_rsvp` RPC. These saves **do not include the Next.js Server Action/revalidation round trip**. Post-run reads compare final versions and attendee counts.

## Results

| Workload | Concurrent requests | Requests | Stage duration | p50 | p95 | p99 | Requests/sec | Errors |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Public pages | 1 | 16 | 15.22s | 877 ms | 1321 ms | 1321 ms | 1.05 | 0 |
| Public pages | 5 | 76 | 15.94s | 903 ms | 1520 ms | 2157 ms | 4.77 | 0 |
| Public pages | 10 | 173 | 16.02s | 779 ms | 1261 ms | 1538 ms | 10.80 | 0 |
| Public pages | 25 | 200 | 8.25s | 808 ms | 1580 ms | 1979 ms | 24.24 | 0 |
| Public pages | 50 | 200 | 4.30s | 810 ms | 1373 ms | 1902 ms | 46.46 | 0 |
| Public pages | 100 | 2000 | 18.32s | 796 ms | 1332 ms | 2098 ms | 109.15 | 0 |
| Public pages | 200 | 2000 | 10.55s | 907 ms | 1515 ms | 2207 ms | 189.49 | 0 |
| RSVP RPC saves | 1 | 54 | 15.08s | 210 ms | 548 ms | 1212 ms | 3.58 | 0 |
| RSVP RPC saves | 5 | 200 | 11.21s | 218 ms | 547 ms | 1111 ms | 17.84 | 0 |
| RSVP RPC saves | 10 | 200 | 7.52s | 235 ms | 1139 ms | 1639 ms | 26.59 | 0 |
| RSVP RPC saves | 25 | 200 | 2.90s | 246 ms | 564 ms | 748 ms | 69.04 | 0 |
| RSVP RPC saves | 50 | 200 | 1.78s | 275 ms | 648 ms | 735 ms | 112.36 | 0 |
| RSVP RPC saves | 100 | 2000 | 6.27s | 238 ms | 635 ms | 1031 ms | 319.22 | 0 |
| RSVP RPC saves | 200 | 2000 | 3.95s | 275 ms | 764 ms | 1019 ms | 505.97 | 0 |

Total measured workload requests: **9,519**, excluding warm-up, fixture preflight, integrity reads and collision test.

At 200 concurrent page requests, the generator used 30.8% of one CPU core and had 23 ms p99 event-loop delay. No evidence of client CPU saturation in that stage. Throughput is for this specific mix and network path, not an application-wide capacity rating.

## Attendance bottleneck

The query produced 6,720 household-meal combinations (224 × 30). The implementation calls `private.resident_members` separately for adult, child and free-child counts for each combination: 20,160 calls before other eligibility work. It loads all days even though the UI shows one selected day/meal. Frontend pagination does not reduce this database workload.

Observed EXPLAIN: 9,930.98 ms execution, 752,315 shared buffer hits, zero shared buffer reads, 387 temporary blocks read and written. This is one sample and overlapped RSVP preflight/initial load; it needs an isolated repeat. It is still far beyond a 2-second interactive target before HTTP rendering and transfer.

Recommended next work:
1. Fetch attendance for the selected meal with server-side filtering/pagination.
2. Compute fixed-payment eligibility and package membership once per enrollment, then aggregate age groups once.
3. Check query plans for supporting indexes on payment lookups by festival/flat/category/status.
4. Re-test concurrent committee reads and real check-in/finance writes after optimization. Festival-wide transaction locks may limit simultaneous writes; this was identified in code, not measured under authenticated concurrent writes.

## Limits of these results

These are short bursts, not a sustained soak test. High concurrency stages hit their request cap in 4–18 seconds. No capacity breakpoint was reached for public routes. No long-duration CPU-credit, memory, cold-start, monthly quota or other-society contention test was performed. Dev uses Tokyo while production uses Mumbai, so production latency may differ. OTP/Resend, authenticated browser navigation, finance confirmation and scanner hardware were not load-tested.

The cleaned initial dev dataset would have hidden the attendance issue; the full synthetic fixture made it visible.

## Cleanup status

**Completed and verified on 22 September 2026.** Removed only the synthetic society and its fixture records with UUID/name guards. Dev retains one real society, four blocks, 224 flats and only sb@prishi.in as administrator/auth user. Festivals, financial entries, enrollments and guest bookings are empty. Production was not modified. Final cross-run database-counter attribution and independent finance-report timing were not collected.

## Files

- `load-test.mjs`: reusable bounded dev HTTP/RPC test harness.
- `results/*.json`: measured stage results and SQL instrumentation.
- `.private/`: fixture manifest, seed and scoped cleanup SQL. Contains synthetic bearer links; do not publish or commit it.

No application source, schema, permissions or deployment configuration changed for this test.

## Attendance optimization — local validation

Implemented a selected-meal RPC with database pagination/search and set-based eligibility; source and migration are prepared in the application repository. The UI now reads at most ten resident and ten guest cards and refreshes that selected-meal payload after check-in.

With the same fixture in local PGlite, three old aggregate reads took 7,878–8,092 ms and returned 2,710,334 bytes each. Twenty optimized reads took 17.08–23.69 ms and returned 28,289–28,510 bytes. See `results/attendance-local-optimized.json`. This comparison is local, not hosted capacity. Hosted comparison, dev deployment and cleanup subsequently completed as recorded below; sustained authenticated HTTP concurrency remains unmeasured.

## Hosted optimization and dev deployment

The dev migration and app deployment completed after OAuth recovery. Two isolated aggregate reads measured 7,150–7,171 ms / 2,953,806 bytes. Ten optimized selected-meal reads measured 27.88–47.05 ms / 30,263–30,303 bytes. The first optimized EXPLAIN was 176 ms with zero temporary blocks. See `results/attendance-dev-optimized.json`.

Ten concurrently dispatched MCP requests completed 30 authorized reads (28–50 ms) and 30 check-ins (2–12 ms) without errors, ending at the expected 30 admitted across ten household rows. See `results/attendance-dev-batched.json`. Actual overlap is not established because the management API may serialize calls; this is not an authenticated HTTP capacity test.

Browser verification passed for pagination, normalized search, resident/guest pass-link lookup, and resident/guest save-and-refresh behavior on the deployed dev app. No physical camera test or sustained authenticated HTTP soak was performed. The fixture was then removed and the browser returned to Radhe Infinity.
