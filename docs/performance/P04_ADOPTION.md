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

A later GitHub audit identified [GHSA-6qxp-vccf-f47h](https://github.com/advisories/GHSA-6qxp-vccf-f47h), added to the advisory database on 6 October. The transitive MCP SDK used by the shadcn CLI is locked to patched 1.31.0 instead of 1.29.0. Only that package's lock entry changes; all other resolved versions remain intact. Clean locked installation and SDK import checks pass. No ERP source/tooling OAuth-client integration was found; this dependency repair does not alter any live credentials, Codex installation or cloud setting. Final exact-head CI is required again, not inferred from the earlier audit pass.

### Follow-on: expiry paging and complete outputs

The four expiry UI tabs now use `dms-expiry-page`: 25 rows by default, at most 100, with server-side criteria/search/column filters, allowlisted sorting, stable ID ties and exact counts. The existing complete-result action remains available to compatibility callers. The earlier expiry-interactive hold is superseded by this implementation, not by a claim that all DMS work is finished.

`dms-expiry-output` is a separate explicit complete-output read. CSV, Excel, PDF, Print and module email preparation no longer reuse the visible page or the parent's old row buffer. Both paths share the same authorized query definition. The output reader checks every 500-row batch, identities and exact counts, then compares a second complete pass. A changed, failed, duplicate, partial, oversized or denied result is rejected, not returned as a successful partial file. The safety ceilings are 10,000 rows and 6 MB of encoded rows; larger sets require narrower filters. Two matching observations are not a transactional database snapshot.

Criteria/tab/principal retirement aborts and fences obsolete output reads. Read failures hide stale actions without claiming zero results. Same-criteria background verification preserves unsent email, ignore and renewal drafts while hiding their submission controls. Hidden tab-specific filters are not applied to other tabs. Confirmed mutations invalidate the existing expiry family. Final email submission rechecks the complete-result fingerprint and current email capability; duplicate clicks coalesce. The legacy global-sender restriction remains, and browser-prepared delivery is **not** reclassified as F08 server-verified delivery. No email/provider is invoked by acceptance tests.

On-demand printing reserves a blank window during the user's click, before asynchronous retrieval loses popup activation. Failed retrieval closes that window. Print cells/headers are escaped; closing the reserved window does not create a second asynchronous popup. Existing supplied-data export callers retain their behavior.

Native loopback checks compare complete row projections/counts against the compatibility reader: 2,214 admin, 2,208 company and 2,155 branch documents, with tail pages, filters, relation sort and no-role denial. All five API views are exercised; expired/missing/ignored were genuinely empty in this fixture snapshot, not positive business-workflow coverage. One observed admin page was 299 ms and its complete output 1,479 ms; company/branch pages were 422/412 ms. These are synthetic handler/SDK observations, not browser measurements or production guarantees. The existing P03 prerequisite is necessary: the restored older reader timed out for scoped callers before replay. Replay restored exact function definitions/owners/ACLs and all synthetic sessions signed out.

Offline tests also generate actual CSV, XLSX and multi-page PDF email attachments and parse all 1,107 synthetic identities, plus complete print markup. They test dispatch preparation using a mocked provider, not inbox delivery or browser/device layout. This step adds no migration. Remaining DMS reviews, inbox, record sections, linked-record selectors, populated archive/restore acceptance and the scoped legacy joined renewal reader remain separate open work.

## Item 2: remaining DMS reads

This continuation supersedes the earlier scoped legacy-renewal failure and the review/inbox/record-section/linked-selector/populated-archive holds. Whole P04 remains open. It adds no production migration or business mutation implementation.

- The complete renewal compatibility reader now hydrates ordinary-caller document/person references in counted batches. Scoped full identity sets are independently verified; hidden references remain null.
- Review queue list/detail/summary reads use a private cancelable endpoint, stable server pages, explicit failures, confidential-parent filtering before count/paging and safe beyond-end handling. Mutations and authority checks are retained.
- Upload inbox uses counted 25-row pages (100 maximum), whole-result search/filters and lazy document choices. Batch drafts and batch/session totals are complete rather than capped at 100. Invalidated server seeds cannot overwrite newer cache/error state.
- All 18 document sections are reconciled: 16 data-bearing sections use the active-section read contract, directly or via approval/reminder children. Overview retains its existing parent-owned form; Ask AI remains explicit provider work, not an automatic read. No provider is invoked by these tests.
- A strict 32-operation read allowlist validates inputs, checks the live principal, performs protected-parent checks where applicable and retains each business reader's authorization. Downloads/signed URLs and mutations remain outside this transport. Read-side audit logging remains where it already existed.
- Complete child collections use counted stable batches with a 10,000-row ceiling and explicit failure on incomplete/changed results. OCR recent jobs and Understanding labels remain explicitly bounded previews, not complete-history claims. Missing/failed Understanding counts no longer become zero.
- Empty tag polling stops after failed reads; explicit retry remains available. It cannot continue an indefinite denied background loop.
- Linked selectors preserve selected labels, ordinary scopes, literal search, cancellation, denial/retry and retired-account response fencing. The shared entity-document compatibility reader and file totals are complete; this does not certify the separate entity-tab/attach interface.
- Failed protected rechecks hide stale data and pause child portals while preserving drafts. Inactive sections stop reads/polling and hide their dialogs. Existing F04 submission safeguards and F05 list controls remain.
- Populated native synthetic archive tests cover company/branch/admin visibility, no-role denial, replacement confidentiality, beyond-end paging and approved-document restore. Registered fixtures/grants are removed and prerequisite function definitions restored exactly.

Verification includes 646 P04 tests; final wider checks and exact published-head CI are recorded in the private acceptance register. Nine extra native section schema-contract reads use empty child sets, not positive child workflows. Two legacy history relations are absent from the restored lab: their exact historical table definitions were installed temporarily with service-only grants and forced RLS, then removed after verification. This is a schema-contract fixture, not historical-policy or final release-schema acceptance. Historical failed receipts are retained.

Browser/device journeys and timings remain owner-deferred, NOT RUN. Server/component tests do not establish a production latency guarantee. No main merge, deployment, emails or provider activation.

## Item 3 — HR and operational read adoption

This addition is an isolated implementation candidate. Final publication/check acceptance is recorded separately; whole P04 remains open.

- Adopt counted server reads for operational assignments/readiness/blocks, attendance/shifts/leave, HR actions, recruitment and salary/WPS inquiries. Search, filters and sorting run before paging; unavailable counts are not successful zeroes.
- Adopt private active-section reads for employee overview, compliance, time, payroll, operations and actions, plus candidate record/summary/children. Exact parent checks, minimal DTOs, selected historical values, cancellation, identity retirement and explicit failed-read recovery remain required.
- Preserve ordinary caller authorization and F03 confidentiality. Salary/banking/medical/document access remains separately scoped. No role widening, privileged business client, business mutation replacement or cross-request authorization cache is introduced.
- Preserve F04 drafts and unconfirmed-save identity while retiring inaccessible private payloads; F05 list controls and existing mutation authorization remain. Failed read admission cannot authorize a write, and a stale child-dialog callback cannot borrow a later opening's permission.
- Candidate document metadata uses a minimal security-invoker view over live child RLS and the existing protected document projection. Offer labels are hydrated only for the bounded authorized page. Both remove repeated expensive joined authorization without silently dropping records.
- Native synthetic evidence covers populated payroll/compliance/recruitment pages, tail/beyond-end pages, candidate title criteria, linked employee/dependent documents, medical masking, old/new child row-set parity, and role/link/revocation boundaries. Empty schema smoke is identified separately and does not establish populated workflow acceptance.
- Browser/device measurements remain owner-deferred, NOT RUN. Synthetic server timings are not a production performance guarantee. F06 integration and F09 delivery ownership remain separate.

### Item-3 migration order and release limits

After the reviewed P03/P04 prerequisites, preserve timestamp order:

1. `20261013110056_perf_hr_payroll_counted_inquiry.sql`
2. `20261013115541_perf_recruitment_scope_tuple_reads.sql`
3. `20261013124718_perf_recruitment_child_select_sets.sql`
4. `20261013125825_perf_hr_compliance_read_subjects.sql`
5. `20261014030458_perf_candidate_document_subject_set.sql`
6. `20261014040457_perf_candidate_document_read_projection.sql`

These are read optimizations, not HR business-rule or grant repairs. Strict source/policy/metadata preconditions intentionally refuse unexpected schemas and replay. Do not weaken the guards to fit F06 or production. Reconcile the exact reviewed release schema first. The six migrations compose in the synthetic lab and roll back to exact catalog preimages; this is not full historical-chain or hosted-schema acceptance.

Application and database changes must be released together only under a separately approved release. The candidate-document reader requires the new view. For backout, restore the matching prior app, remove the added read-only view/APIs and restore captured original SELECT policies/private read-function definitions in dependency-safe reverse order. Retain all original write/principal policies, ACLs and business data. Never use `CASCADE` or reset a database to perform this backout. No merge or deployment is authorized here.

## Verification

Run the P04 Vitest configuration and its TypeScript project, the existing P01/P02/P03 suites, the complete remediation and unit suites, shipping/E2E types, lint, build and security gates. CI includes the P04 offline suite and local-harness typecheck.

The p04.local.config.mts suite is opt-in only. It requires a fresh, explicitly admitted synthetic loopback lab with providers/workers disabled, a matching environment hash and synthetic accounts. It refuses other destinations and never runs in ordinary CI. It compares all fifteen active configuration identity sets for three actors and checks archive access for four actors. Empty archive results do not establish nonempty replacement or restore acceptance.

Component/query tests are not browser measurements. No production latency or whole-app performance guarantee is claimed.

## Remaining acceptance and adoption

- Exact intended release-schema integration; populated archive/replacement/restore evidence is recorded under item 2.
- Immutable F06 integration, including the known positive scoped common-master access gate.
- Remaining administration collections and independent DMS Browser, entity-tab/attach interface, approvals-queue and dashboard consumers require their own current-source reconciliation. Item 2 does not certify these separate surfaces by association.
- Final item-3 combined quality and exact-head publication acceptance; its HR/recruitment/time/payroll/operations implementation does not certify separate dashboards, reports or business workflows.
- Report criteria/history, notification/delivery reads, dashboards/search/advisory/audit residuals, aligned with owning phases. Do not activate deferred F09 delivery work.
- Complete per-consumer inventory reconciliation. Shared-selector tests do not certify every parent screen.
- Owner-deferred browser/device/journey measurements, explicitly NOT RUN.

Keep F03 confidentiality, F04 draft/mutation safety and F05 appearance intact. Workspace capacity/bulk-close redesign remains separately assigned; this checkpoint does not implement it.

## Integration/rollback

Review against the exact P03 base and selected owning-phase revisions in an isolated environment. Apply P03 prerequisites before the P04 renewal migration, each against guarded preimages. Stop on a preimage mismatch, missing/false counts, denial leakage, lost drafts or failed reads. Preserve the previous application build and exact policy preimages. Backout restores the original restrictive ALL subject policy and original permissive SELECT expression after removing only the four operation-specific replacement policies; do not remove the original write/principal policies, F03 security or business data. Exact backout was verified in the synthetic lab. No deployment is authorized by this checkpoint.
