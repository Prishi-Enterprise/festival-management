/** Dev-only bounded HTTP/RPC benchmark. Never accepts a production hostname. */
import fs from "node:fs/promises";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";
const [fixturePath, keyPath, outPath, mode = "pages"] = process.argv.slice(2);
if (!fixturePath || !keyPath || !outPath || !["pages", "rsvp"].includes(mode))
  throw Error(
    "Usage: node benchmarks/load-test.mjs fixture.json key.json results.json [pages|rsvp]",
  );
const f = JSON.parse(await fs.readFile(fixturePath, "utf8"));
const { key } = JSON.parse(await fs.readFile(keyPath, "utf8"));
if (
  f.project !== "pokeislmfmfuqgfkxmzp" ||
  f.origin !== "https://dev.festivals.prishi.in" ||
  !f.name.startsWith("Synthetic load test ") ||
  f.residents.length < 50
)
  throw Error("Only the explicit dev synthetic fixture is allowed");
const stages = (process.env.LOAD_STAGES || "1,5,10,25,50")
  .split(",")
  .map(Number);
const maxRequests = Number(process.env.LOAD_MAX_REQUESTS || 200);
const seconds = Number(process.env.LOAD_SECONDS || 15);
if (
  stages.some((n) => !Number.isInteger(n) || n < 1 || n > 200) ||
  !Number.isInteger(maxRequests) ||
  maxRequests < 1 ||
  maxRequests > 2000 ||
  !Number.isInteger(seconds) ||
  seconds < 1 ||
  seconds > 60
)
  throw Error("Unsafe load bounds");
const workers = Math.max(...stages);
const db = `https://${f.project}.supabase.co/rest/v1/rpc/`;
const result = {
  startedAt: new Date().toISOString(),
  mode,
  origin: f.origin,
  fixture: {
    flats: f.residents.length,
    guests: f.guests.length,
    meals: f.services.length,
  },
  stages: [],
  method: `Closed-loop concurrency, no think time, at most ${maxRequests} requests per stage or ${seconds} seconds; full response body measured; 15-second timeout. Pages include server rendering but not browser assets/hydration. RSVP writes call the real anonymous database RPC.`,
};
const hist = monitorEventLoopDelay({ resolution: 20 });
hist.enable();
const versions = Array(f.residents.length).fill(0);
const expected = Array(f.residents.length).fill(null);
let totalBytes = 0;
const pct = (a, p) =>
  a.length
    ? a.toSorted((a, b) => a - b)[
        Math.min(a.length - 1, Math.ceil(a.length * p) - 1)
      ]
    : 0;
async function req(kind, index) {
  let url,
    options = {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "FestivalDevBenchmark/1.0" },
    };
  if (mode === "pages") {
    const r = f.residents[index % f.residents.length];
    url =
      f.origin +
      (kind === "rsvp"
        ? `/rsvp/${r.rsvp}`
        : kind === "resident"
          ? `/resident-pass/${r.pass}`
          : `/guest-pass/${f.guests[index % f.guests.length].pass}`);
  } else {
    url = db + "save_resident_rsvp";
    options = {
      ...options,
      method: "POST",
      headers: {
        ...options.headers,
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_code: f.residents[index].rsvp,
        p_date: f.date,
        p_attendees: versions[index] % 5,
        p_version: versions[index],
      }),
    };
  }
  const start = performance.now();
  let ttfb = 0,
    status = 0,
    bytes = 0,
    error;
  try {
    const r = await fetch(url, options);
    ttfb = performance.now() - start;
    status = r.status;
    const body = await r.text();
    bytes = Buffer.byteLength(body);
    totalBytes += bytes;
    if (!r.ok) error = `HTTP ${status}`;
    else if (mode === "pages" && !body.includes(f.name))
      error = "Missing synthetic festival marker";
    else if (mode === "rsvp") {
      expected[index] = versions[index] % 5;
      versions[index]++;
    }
  } catch (e) {
    error = e.name === "TimeoutError" ? "timeout" : e.message.slice(0, 120);
  }
  return {
    kind,
    status,
    ms: performance.now() - start,
    ttfb,
    bytes,
    ...(error ? { error } : {}),
  };
}
// A real page/RPC must pass before concurrent load begins.
if (mode === "rsvp") {
  const r = await fetch(db + "resident_rsvp", {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ p_code: f.residents[0].rsvp }),
  });
  const d = await r.json();
  if (!r.ok || d.festival !== f.name) throw Error("Fixture preflight failed");
  f.date = d.days.find((d) => d.open)?.date;
  if (!f.date) throw Error("No open synthetic RSVP day");
  for (let i = 0; i < workers; i++) {
    const rr = await fetch(db + "resident_rsvp", {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ p_code: f.residents[i].rsvp }),
    });
    const dd = await rr.json();
    versions[i] = dd.days.find((d) => d.date === f.date).version;
  }
}
const pre = await req(mode === "pages" ? "rsvp" : "save", 0);
if (pre.error) throw Error(`Preflight failed: ${pre.error}`);
for (const concurrency of stages) {
  hist.reset();
  const startedAt = new Date().toISOString();
  const started = performance.now(),
    cpuStart = process.cpuUsage();
  let issued = 0;
  const samples = [];
  await Promise.all(
    Array.from({ length: concurrency }, async (_, worker) => {
      while (
        issued < maxRequests &&
        performance.now() - started < seconds * 1000 &&
        totalBytes < 150_000_000
      ) {
        const n = issued++;
        samples.push(
          await req(
            mode === "pages" ? ["rsvp", "resident", "guest"][n % 3] : "save",
            mode === "rsvp" ? worker : n,
          ),
        );
        if (samples.filter((x) => x.error).length >= Math.max(5, concurrency))
          break;
      }
    }),
  );
  const elapsed = (performance.now() - started) / 1000,
    fail = samples.filter((x) => x.error),
    cpu = process.cpuUsage(cpuStart);
  const stage = {
    startedAt,
    concurrency,
    requests: samples.length,
    seconds: +elapsed.toFixed(2),
    requestsPerSecond: +(samples.length / elapsed).toFixed(2),
    errors: fail.length,
    errorRate: fail.length / samples.length,
    p50Ms: Math.round(
      pct(
        samples.map((x) => x.ms),
        0.5,
      ),
    ),
    p95Ms: Math.round(
      pct(
        samples.map((x) => x.ms),
        0.95,
      ),
    ),
    p99Ms: Math.round(
      pct(
        samples.map((x) => x.ms),
        0.99,
      ),
    ),
    maxMs: Math.round(Math.max(...samples.map((x) => x.ms))),
    ttfbP95Ms: Math.round(
      pct(
        samples.map((x) => x.ttfb),
        0.95,
      ),
    ),
    bytes: samples.reduce((n, x) => n + x.bytes, 0),
    generatorCpuPercent: +(
      ((cpu.user + cpu.system) / 1e6 / elapsed) *
      100
    ).toFixed(1),
    generatorEventLoopP99Ms: Math.round(hist.percentile(99) / 1e6),
    byKind: Object.fromEntries(
      [...new Set(samples.map((x) => x.kind))].map((k) => {
        const a = samples.filter((x) => x.kind === k);
        return [
          k,
          {
            requests: a.length,
            errors: a.filter((x) => x.error).length,
            p95Ms: Math.round(
              pct(
                a.map((x) => x.ms),
                0.95,
              ),
            ),
          },
        ];
      }),
    ),
    errorExamples: fail
      .slice(0, 3)
      .map((x) => ({ kind: x.kind, status: x.status, error: x.error })),
  };
  result.stages.push(stage);
  console.log(JSON.stringify(stage));
  await fs.writeFile(outPath, JSON.stringify(result, null, 2));
  if (
    stage.errorRate > 0.05 ||
    stage.p95Ms > 8000 ||
    totalBytes >= 150_000_000
  ) {
    result.stoppedEarly = true;
    break;
  }
  await sleep(2000);
}
if (mode === "rsvp") {
  result.integrity = { checked: 0, mismatches: 0 };
  for (let i = 0; i < workers; i++) {
    if (expected[i] === null) continue;
    const r = await fetch(db + "resident_rsvp", {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ p_code: f.residents[i].rsvp }),
    });
    const d = await r.json();
    const day = d.days?.find((d) => d.date === f.date);
    result.integrity.checked++;
    if (day?.attendees !== expected[i] || day?.version !== versions[i])
      result.integrity.mismatches++;
  }
}
result.finishedAt = new Date().toISOString();
result.totalBytes = totalBytes;
hist.disable();
await fs.writeFile(outPath, JSON.stringify(result, null, 2));
console.log(
  JSON.stringify({
    finished: true,
    mode,
    integrity: result.integrity,
    totalBytes,
  }),
);
