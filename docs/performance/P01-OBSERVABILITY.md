# P01 private diagnostic tracing

This candidate adds diagnostics, not a query optimization or a performance guarantee.
It depends on the unmerged P00 inventory candidate. It changes no database policy,
schema, worker setting, role assignment, cache decision or provider configuration.

## Coverage and interpretation

- Shared proxy/session validation and `getAuthContext`/permission resolution.
- Pilot logical reads: employee list, department list/lookup, document list.
- Physical SDK fetch attempts inside an admitted trace, including the installed
  SDK's `X-Retry-Count`. No retry is added by instrumentation.
- Explicit `/api/auth/session` JSON response construction and its UTF-8 body size.
- Proxy and downstream segments share a generated correlation UUID and static
  route template. Incoming diagnostic headers are replaced, not trusted.

Each event has elapsed time, outcome, bounded spans, offsets and a dropped-span
count. SDK timing ends at response headers, **not** body consumption; content length
is advertised bytes or null, not a measured decoded payload. Logical read timing
includes SDK body processing. Span offsets describe one segment; overlapping/nested
spans must not be summed as a request total. Separate proxy/action segments have
separate clocks and admission limits. Sampling/caps can leave partial traces.

Other module actions inherit shared auth visibility, not full logical-read coverage.
They are not claimed adopted by P01. Browser/render/network-to-user completion and
Next RSC/server-action wire serialization remain unmeasured. A JSON endpoint is not
a substitute for those measurements. Browser acceptance is explicitly deferred by
the owner; this is not permission to bypass browser restrictions.

## Opt-in operation and privacy

Default is OFF. Enabling requires all of:

1. A reviewed private log sink with operator-only access, no public log forwarding,
   access auditing and enforced deletion of diagnostic events within at most 7 days.
2. `ALGT_PERF_ENABLED=true` and `ALGT_PERF_LOG_RETENTION_DAYS=1` (integer 1–7).
   The latter acknowledges the operator's actual sink policy; it does **not** configure
   retention or permissions. Do not enable before the host policy is verified.
3. Select sampling via `ALGT_PERF_SAMPLE_PERCENT` (default 1; 0 disables; max 100).
   Default `ALGT_PERF_MAX_TRACES_PER_MINUTE=60`, hard cap 2000 per process.
   A trace holds at most 128 spans; fleet volume scales with process count.

The event is fixed-schema JSON sent to the server log. It never includes principal
IDs, tokens, cookies, credentials, query strings, search text, bind values, raw
errors or business result bodies. Route/backend/operation labels are allowlisted.
Opaque correlation is diagnostic only, never an authorization input. There are no
public timing response headers or diagnostic API. Failed log writes do not change
the operation result. Disable with `ALGT_PERF_ENABLED=false`; no migration/rollback
of data is involved. Slow hosting logs can still add cost: validate the host sink
before any separately authorized deployment/activation.

## Reproducible checks

Offline (no database or secrets):

```sh
node node_modules/vitest/vitest.mjs run --config tests/performance/p01.config.mts
node node_modules/typescript/bin/tsc --project tests/performance/p01.tsconfig.json --noEmit
```

The opt-in overhead config `p01.overhead.config.mts` requires a fresh explicit
`PERF_P01_OVERHEAD_OUTPUT` under `C:/dev`. It runs 12 alternating paired batches of
50 synthetic operations with eight mocked attempts each. The enabled case writes
to a local file sink. Its predeclared acceptance is <=1ms added median per operation;
this is a local diagnostic-overhead limit, not a production response-time budget.

The opt-in `p01.local.config.mts` requires an independently verified fresh admission
receipt, exact owned loopback API, synthetic actors and explicit private evidence
paths. See the harness's required `PERF_P01_*` inputs. Never point it at production.
It invokes native actions/auth/SDK with server-client factories bound to the admitted
lab, alternates on/off observations, hashes results, captures call counts/received
bytes, checks denied access and signs out only its own sessions. Laboratory-only
body cloning is symmetric in both modes and is **not** used by production tracing.
A classified DMS timeout in both modes is retained as a failed business read; the
harness stops redundant timeout probes and passes diagnostic equivalence only.

Read-only scoped query plans require independent target verification, authenticated
synthetic JWT claims, a 15-second statement timeout, a 2-second lock timeout and
rollback. Bounded plan probes are not the full embedded PostgREST query. Current
laboratory schema includes separately owned later-phase migrations; these receipts
are not an original-baseline comparison or production permission-parity proof.

Private timings, detailed plans, environment fingerprints and acceptance records
are retained outside this public candidate. Existing failed attempts remain evidence.
