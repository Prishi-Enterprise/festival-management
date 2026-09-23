# Festival benchmarks

Moved from `PrishiAI/festival-load-test/` on 23 September 2026. `load-test.mjs` is the bounded HTTP/RPC harness; `local-attendance-benchmark.mts` imports the local test database harness from `../tests/`.

[REPORT.md](REPORT.md) preserves the dated results and limitations. Raw results remain in ignored `results/`; fixture manifests, bearer links, keys and seed/cleanup files remain in ignored `.private/`. Do not commit or publish those directories. Moving the harness does not authorise running a hosted load test.

Run from the Festival repository root with Node 22+; supply explicit fixture/key/output paths to the HTTP harness. The local attendance script uses fixtures relative to its own directory. Historical fixtures are retained locally, not distributed with a clone.
