# P02 — shared authorized read foundation

This is a stacked candidate on P01, not a production rollout or app-wide adoption claim.
Browser measurements are owner-deferred and NOT RUN. No schema migration, RLS change,
worker, email/AI provider, main merge or deployment is part of this candidate.

## Decisions and adoption boundaries

| Area | Contract |
|---|---|
| Read transport | Explicit same-origin POST route handlers, JSON body limited to 4,000 bytes; search/IDs are not URL parameters. Private no-store responses, opaque correlation, safe generic errors. Business mutations remain existing Server Actions. |
| Authority | Existing live identity/session/profile/role resolution and user-scoped RLS. `withReadRequest` reuses the pending authorization promise only within one explicit request; scope closes in `finally`. No cross-request authority cache. Do not wrap writes or background jobs. |
| Retry | One transient whole-read retry in TanStack; no retry for 4xx or cancellation. Within controlled reads only, nested SDK GET/HEAD retries are disabled. Mutation retry behavior and ordinary client behavior are unchanged. |
| Cancellation | Browser fetch abort and stale-response fences prevent delivery to a retired query/owner. Route checks before/after body/reader work. This does **not** claim already-running SQL is cancelled. |
| Page identity | Stable recursively canonical criteria; all search/filter/sort/parent/company/branch/locale fields belong in the key. Identity/scope isolation is supplied by a fresh keyed `ReadCacheBoundary`, not editable client permissions. |
| Paging | Business/search default 25, maximum 100; strict endpoint allowlists, exact authorized counts, stable ID tie-breaker, page/count validation. SSR seed only for identical criteria and newer uncontested state. |
| Freshness | List pages: 30 seconds, focus revalidation. Stable configuration choices: existing 5-minute freshness/30-minute in-memory collection, targeted save invalidation. No private browser disk cache. Session verification cadence remains 60 seconds plus focus. |
| Failure UX | Failure is not empty data. Keep mounted input, show an alert and explicit retry, make affected stale controls inert. 401/403 hide retained records. Callers must honor `isBusy`/`isError` before acting on retained page data. |
| F04 | No changes to save actions, idempotency, version/conflict handling, draft models or storage schema. Cache lifecycle clears on identity/scope changes; obsolete session checks cannot clear a newer owner's cache. |

## Opt-in API and control

- `useServerPage`: generic list/search adapter with exact SSR seed reuse, 250ms text
  debounce, immediate page/dropdown changes, in-flight coalescing and retired refetch
  handle protection. Use only inside the identity/scope-owned cache boundary.
- `/api/reads/lookup-values`: strict category/parent, minimal choice projection;
  permitted selected inactive values must still satisfy category, parent and RLS.
- `/api/reads/lookup-batch`: maximum 40 categories; missing/hidden categories fail
  rather than seeding false empty data. Active/inactive management requires existing
  permission; the endpoint does not grant it.
- `/api/reads/lookup-search`: bounded label substring search, English or Arabic
  allowlisted column, literal wildcard escaping, page/count contract. Exact selected
  legacy values use the separate single-value reader.
- `AuthorizedLookupSelect`, `use-authorized-lookup` and
  `prefetch-authorized-lookups` use a separate `authorized-lookup` key namespace.
  Existing global lookup hooks/selectors/prefetch transports are NOT replaced.
  Both language labels are in the lean configuration payload, so language selection
  there is rendering only; the paged search's language is a query criterion.
- Complete configuration reads use count-checked pages of 500 and a hard total cap
  of 5,000 rows, including batch totals. This is an explicit configuration exception
  to the business page size, not a scale guarantee. Beyond the cap, fail visibly and
  use bounded search; never silently truncate. Caller opt-in must justify loading
  the whole category. Same-count concurrent changes cannot be given transactional
  snapshot guarantees across separate requests; duplicates/count changes fail.
- Mutation invalidators extend only their corresponding future pilot read keys.
  Query cancellation occurs before invalidation, including inactive observers.
  Related lookup batches are invalidated; unrelated categories stay fresh.

No pilot list screen has been migrated here. The protected layout now supplies the
private cache lifecycle, and the session endpoint supplies an opaque scope generation.
These security lifecycle controls do not change database permissions or read transports.

## Measurements and compatibility

An admitted synthetic loopback lab compared two sequential real authorization
resolutions with two resolutions within one explicit request. Ten alternating pairs
for each of three test identities retained identical result hashes. Native calls
were halved: 14 to 7 for admin/scoped identities and 8 to 4 for a no-role identity.
These are service-level observations, not page navigation or production SLA results.
Authorization still runs anew for the next request. No global memoization was added.

Native lookup checks also verify complete results beyond the backend's ordinary cap,
distinct 25-row search pages and literal wildcard filtering. Current ordinary-role
category visibility is blocked by separately owned F06 policy compatibility. Those
failures remain open and are **not** rollout acceptance. Keep these adapters opt-in
until F06 verifies the permitted role/category matrix. Do not relax RLS to pass tests.

P01's scoped DMS timeout requires protected-query/predicate analysis with P03's
concrete pilot. No SQL tuning is selected in P02: the plan makes migration work
conditional, and copying unverified later-phase SQL is not an acceptable foundation.
No database recovery/replay claim is made where no migration exists.

## Verification and rollback

Run `node node_modules/vitest/vitest.mjs run --config tests/performance/p02.config.mts`
and `node node_modules/typescript/bin/tsc --project tests/performance/p02.tsconfig.json --noEmit`.
The isolated native suite is excluded from ordinary CI and requires a fresh target
admission, synthetic actors, loopback-only outbound guard and disabled providers.
Private credentials and raw lab receipts are not in this repository.

Also run P01 privacy tests, unit/remediation suites, lint, production build, shipping
and browser-test typechecks, secret/vendor/dependency checks and GitHub CI. Browser
test discovery is not browser execution. Real navigation, assistive technology,
device coverage, pilot budgets and production-volume validation remain later gates.

Before a future release, review the stacked P00/P01/P02 chain together. Application
rollback is reverting the P02 commit; there is no schema rollback. Do not independently
roll out an older session endpoint with the new scope-aware layout. A rollout mismatch
fails closed via revalidation/reload and must not be misreported as a login success.

Next package is P03: Employees, Departments and DMS pilot adoption, one measured
pattern at a time, with F03/F04 checks and the open F06 compatibility/DMS failures intact.
