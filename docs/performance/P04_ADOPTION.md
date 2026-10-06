# P04 adoption checkpoint

Status: partial implementation; **P04 is not closed**. This candidate is stacked on P03. Publication does not authorize merge or deployment.

## Included

- The existing generic lookup hook/control and prefetch entry points now use the accepted P02 authorized lookup contract.
- Fifteen geography, organization, finance and unit configuration families retain their existing browser RLS, lean projections, keys and parent filters. Reads use complete counted pages with stable ID ordering, cancellation, one retry owner and explicit size limits. A selected inactive value uses the same authorization/parent filters.
- Actual reusable selectors retain entered values on failed loading and provide retry. The unit selector retains its existing error/retry interface.
- Shared prefetch and Party form prefetch no longer claim failed action results as successfully loaded empty choices. No late cancelled prefetch may populate a cleared account cache.
- DMS Archive uses a private read endpoint, a 25-row SSR seed, server-side search/filter/sort/count, bounded pages, protected replacement resolution and complete-result compatibility for the old action.
- Archive guards reject malformed, partial, duplicate or count-inconsistent rows and replacements. Ordinary DMS document pages also reject duplicate identities.
- Confirmed restore invalidates related list/record/dashboard/expiry caches; failed restore does not. Document-list invalidation includes the archive read family.

The initial shared-selector/archive checkpoint added no migration. The renewal continuation below adds one guarded SELECT-policy optimization and requires the existing P03 migrations. Do not substitute the older lab's protected reader or disable confidentiality for performance.

## Expiry and renewal continuation

- Expiry and renewal compatibility reads now walk complete, exact-counted 500-row pages with stable ID ordering and a 10,000-row safety ceiling. An explicit legacy expiry limit is a safety ceiling, never a silently incomplete export. This is a completeness bridge, **not yet server-paged interactive-list adoption**.
- Input and response contracts reject invalid criteria, malformed rows, duplicates, changing counts, missing counts and short pages. Type exclusions, category choices and entity links are also complete; link identity is distinct from document identity. Unnecessary expiry-type reads are skipped outside the missing-expiry view.
- Literal search is escaped. Expiry date criteria are frozen for each traversal. Existing ordinary-client RLS, protected document projections and business filter semantics remain unchanged.
- Summary queries no longer report failed/unavailable counts as zero. The renewal count also bounds its unused result page. Loading/failed expiry tables retain recovery controls and mask stale rows, exports and mutation targets.
- Renewal controls default to read-only. Both actual server pages forward the existing renewal-management capability through their client parents; expiry administration alone is not renewal-management permission. Server mutation checks remain unchanged.
- These changes do not alter reminder generation, notification delivery, renewal business decisions, role assignments or production settings.

The opt-in local harness additionally checks complete synthetic expiry/renewal identities, summary availability and no-role denial. A failed native check is retained as a failed acceptance gate, not converted into a pass by an offline test. Test timings are lab observations, not browser timings or production guarantees.

### Renewal timeout repair and cancellable reads

The previous native renewal SQLSTATE 57014 failure is repaired in the isolated candidate. A read-only execution plan identified repeated row-level authorization work: the old exact count scanned 1,107 renewals and took about 5.5 seconds in the synthetic lab. This is diagnostic evidence, not a production benchmark.

`20261006155439_perf_p04_renewal_read_scope.sql` reuses the reviewed P03 visible-document set for renewal SELECT. It splits the old restrictive ALL subject policy into operation-specific policies, retaining its exact INSERT/UPDATE/DELETE predicate. Existing permissive write policies, live-principal policy, table/function grants and helper definitions are unchanged. No new privileged endpoint or persistent authorization cache is created. Guarded preimages reject a changed dependency/policy or accidental second application.

Native acceptance now passes for all 2,214 expiry identities, ten summary metrics and all 1,107 renewal identities against independent ordinary-caller reads. The no-role assertions were reached and passed. Complete renewal sets matched the frozen F03 helper for eight synthetic identities: administrator 1,107; company 1,103; branch 1,051; other company 4; combined roles 1,055; no-role/self/manager 0. Each of the eight sessions returned zero rows after sign-out. Empty self/manager results demonstrate denial in these fixtures, not positive self/manager workflow coverage. An additional 96 document-projection probes passed. Replay restored all modified policy/function definitions, owners and ACLs exactly; synthetic sessions were signed out.

The three actual expiry-list, expiry-summary and renewal-list consumers now use private, uncached read routes and consume cancellation signals. Denials are terminal, transient retry has one owner, invalid parameters are rejected before business reads, and provider errors are not exposed. A cancelled route fences late results; this does not claim cancellation of an already-running database query. Existing server actions remain compatibility readers and all mutation actions remain unchanged. Renewal controls also remain mounted during loading/errors; stale completion targets are hidden.

The complete renewal compatibility read still took about 9.4 seconds for all 1,107 joined rows in one diagnostic run. Therefore this repair is **not** acceptance of fast server-paged interactive renewal UI. Bounded interactive paging and the wider P04 adoption gates below remain open. Browser measurements remain deferred.

### Follow-on: interactive renewal paging

The renewal table now uses a dedicated private page reader instead of the complete-result compatibility route. Default pages contain 25 rows (maximum 100), with exact totals, deterministic sort ties, literal server search and all existing column filters. Requested document/assignee search identities are resolved under ordinary authorization with explicit completeness limits. Unfiltered pages do not perform those search lookups. Global search matches within each displayed searchable field; it no longer matches a phrase fabricated across adjacent column boundaries.

Only the displayed page's document and person labels are fetched, in batches through the existing protected client. Hidden references stay null; malformed, extra, duplicate or incomplete references fail the read. This avoids repeatedly evaluating the protected document reader for every embedded renewal. No SQL or permission change is added by this follow-on.

Native synthetic checks matched administrator pages and their complete projections to the original joined reader. First, tail, beyond-end, document-filter and renewal-search cases passed. A genuine beyond-end PostgREST 416 requires an independently rechecked exact count; it is never converted blindly to zero. Company and branch pages matched independent ordinary-caller IDs/counts and protected document fields, with 1,103 and 1,051 authorized renewals respectively. The no-role request returned 403 without data. A later legacy *complete joined-read* attempt for the company actor still failed; that compatibility path is not silently certified by the new page checks. The interactive consumer no longer uses it.

The first 25-row synthetic page took 475 ms in the final native observation, versus about 4.1 seconds in an earlier per-row-embed diagnostic. This is neither a matched benchmark nor a browser/production guarantee. Browser validation stays owner-deferred. Local policy/function preimages were restored exactly and all test sessions signed out.

The UI keeps its approved columns/filter controls and memory-only preferences. Search resets the page; shrinking counts revalidate earlier cached pages; existing renewal invalidation also refreshes this page family. Criteria changes, denial and removed capabilities retire mutation targets. A same-criteria refresh hides the completion dialog while retaining its unsaved local state. No mutations or draft storage contracts were changed. The prior paragraph's renewal-interactive adoption hold is superseded by this bounded implementation; expiry paging and full P04 closure remain open.

The dependency gate also identified GHSA-wq5f-xc86-pv6w. The lockfile updates only Sharp and its platform/libvips packages to the patched Sharp 0.35.5 family; unrelated dependency metadata is preserved. No deployment is implied.

## Verification

Run the P04 Vitest configuration and its TypeScript project, the existing P01/P02/P03 suites, the complete remediation and unit suites, shipping/E2E types, lint, build and security gates. CI includes the P04 offline suite and local-harness typecheck.

The p04.local.config.mts suite is opt-in only. It requires a fresh, explicitly admitted synthetic loopback lab with providers/workers disabled, a matching environment hash and synthetic accounts. It refuses other destinations and never runs in ordinary CI. It compares all fifteen active configuration identity sets for three actors and checks archive access for four actors. Empty archive results do not establish nonempty replacement or restore acceptance.

Component/query tests are not browser measurements. No production latency or whole-app performance guarantee is claimed.

## Remaining acceptance and adoption

- Nonempty native archive/replacement/restore fixtures and exact intended release-schema integration.
- Immutable F06 integration, including the known positive scoped common-master access gate.
- Remaining administration collections and DMS expiry/reviews/inbox/record/linked-entity consumers.
- HR/recruitment/time/payroll/operations consumers and their preserved form/permission/failure contracts.
- Report criteria/history, notification/delivery reads, dashboards/search/advisory/audit residuals, aligned with owning phases. Do not activate deferred F09 delivery work.
- Complete per-consumer inventory reconciliation. Shared-selector tests do not certify every parent screen.
- Owner-deferred browser/device/journey measurements, explicitly NOT RUN.

Keep F03 confidentiality, F04 draft/mutation safety and F05 appearance intact. Workspace capacity/bulk-close redesign remains separately assigned; this checkpoint does not implement it.

## Integration/rollback

Review against the exact P03 base and selected owning-phase revisions in an isolated environment. Apply P03 prerequisites before the P04 renewal migration, each against guarded preimages. Stop on a preimage mismatch, missing/false counts, denial leakage, lost drafts or failed reads. Preserve the previous application build and exact policy preimages. Backout restores the original restrictive ALL subject policy and original permissive SELECT expression after removing only the four operation-specific replacement policies; do not remove the original write/principal policies, F03 security or business data. Exact backout was verified in the synthetic lab. No deployment is authorized by this checkpoint.
