# F06 — shared administration, master data, numbering and branding

Updated 16 October 2026. Status: **PRE_PUBLICATION_SNAPSHOT — CANDIDATE_NOT_CLOSED**.

The isolated schema is qualified through **migration 85**, and finance-85 native verification passed **108/108** with independently accepted cleanup. The latest lookup remount-guidance correction, **BR85-05**, passed **94/94 focused tests**, shipping types, targeted lint, its exact-source optimized build and the actual rebuilt-browser journey. Complete terminal cleanup and the controlled app stop have now passed independent review. Refreshed final public-candidate/image checks, reviewed branch/PR publication and exact-head GitHub checks remain **pending**. No complete-F06 or production acceptance is claimed.

Start with [current acceptance](#current-acceptance-summary) and [remaining gates](#remaining-candidate-gates). The [release handoff](RELEASE_HANDOFF.md) preserves the exact **26 inherited prerequisites, 85 ordered F06 migrations**, coordinated recovery and PERF integration contracts. Historical results below remain bound to their original source and scenarios; publishing a branch is not merging or deploying.

## Candidate identity

- Repository: `sameerfahmi1979-maker/ERP`.
- Working branch: `codex/f06-shared-administration`.
- Inherited source base: `284d4a4bb2d679aaabf77ba6013fa4f136e38085`.
- Final reviewed F06 candidate commit, PR and exact-commit GitHub results: **not yet published**.
- Main merge, production migrations/deployment and F09 activation: **not performed or authorized by this candidate**.

The inherited base identifies predecessor source, not uncommitted F06 bytes. This pre-publication snapshot is not a self-identifying final commit record. Record the final immutable candidate SHA, PR URL and exact-head check outcomes in the published PR and final closeout handoff after they exist.

## Implemented F06 contracts

| Task | Required implementation |
|---|---|
| T01 — master-data CRUD and integrity | Permission-scoped create/edit/lifecycle; immutable identity; false/zero preservation; revision/idempotency-safe saves; relationship and historical-reference validation across administration, geography, UOM, finance, parties, departments/designations and HR catalogues. |
| T02 — calendars and shifts | Chronology, overlap, overnight/break integrity; atomic receipts; governed archive/restore and dependency/history protection; mutation invalidation without draft loss. |
| T03 — numbering and consumers | Consistent effective eligibility/preview, atomic allocation/consumption, exact original operation/payload replay, failed-consumer and response-loss recovery, current-authority rechecks and non-reuse of issued numbers. Modern batch admission and durable per-member preparation/recovery remain source/principal/manifest-bound. |
| T04 — providers | Atomic configuration/default/flag/secret changes, sensitive-field permissions, post-lock authority rechecks, exact receipts and truthful secret-safe health/read outcomes. No real delivery or F09 worker rollout. |
| T05 — branding | Issuing-company authority distinct from data access; protected assets; versioned profiles/lifecycle; historical branding and issued-document provenance/reprint preservation. No invented real signatory assignment or F08 generator redesign. |
| T06 — administration usability | Preserve F05 Fluent/Dynamics components and F04 linked validation/focus, per-opening draft/save identity, account retirement, concurrency and retained uncertain-result recovery. Complete scoped choices and truthful failed/forbidden/not-found/empty states. |

Migration 82 replaces only the existing ordinary-RLS preparation join with a parameterized point lookup, retaining hidden-present discrimination and post-wait authority checks.

Migration 83 adds atomic lookup category/value saves and lifecycle/default/lock operations with separate permissions, revision checks, original-operation receipts, deterministic relationship locking and truthful outcomes. Lookup readers distinguish forbidden, failed, not-found and empty results; immutable identities and omitted stored fields are preserved.

The W44 browser window exposed remaining lookup label/search/revision-admission defects and incomplete bank/payment-term/tax-type lifecycle and recovery adoption. The reviewed repair union contains 53 unique source/test/migration paths, followed by a two-file syntax amendment within that union. It adds retained lookup labels and truthful retry/read-generation handling, plus governed atomic saves for those three finance masters using existing F04/F06 save recovery. Exact global-system-administrator checks are confined to owned finance actions; shared scope, F05 presentation and PERF infrastructure are not rewritten.

Migration 84 adds the matching three-master revision/receipt/authority/history contract, immutable identities, strict wire values, omitted-field and false/zero preservation, relationship protection and retirement instead of hard deletion. It closes table/column direct-write paths while retaining reviewed read policies. Matching application wrappers, forms, tables and routes must accompany the schema. Corrected 84 and forward 85 are applied and qualified on both retained isolated targets; the separate current-85 native R6 result accepts its finite 108-case business/permission/concurrency matrix. Earlier failed attempts remain historical, not erased or relabelled passed.

Migration 85 corrects the confirmed receipt-row-lock privilege defect discovered by native R5: it removes only the receipt SELECT's unnecessary `FOR SHARE`, preserving append-only receipt permissions, advisory/idempotency serialization, all other locks and authority/replay rules. The exact guarded forward migration was applied and verified on both retained isolated targets, with fresh current-85 qualification. Its forward receipt establishes application/preservation only; the separate R6 finite native suite passed all 108 cases and its fresh independent cleanup review passed. Later rebuilt-browser and cleanup acceptance are recorded separately below. Applied 84 and the failed R5 evidence remain unchanged.

The earlier R2 browser case 2 reproduced missing implicit Enter submission on all three finance forms and technical lookup labels. The reviewed repair changes only the shared finance form's native submit control, optional serializable lookup-label prop and its forwarding. Existing validation, footer actions, save/recovery/permission guards and shared read/cache behavior are preserved. The frozen 41-case suite and an independent main rerun passed; the related 607-case/13-file packet also passed and includes those 41 cases. Types, scoped lint and independent source review passed. These overlapping source checks alone do not prove the browser's native Enter algorithm; the subsequent qualified build and finite R3 actual-browser results are recorded separately below.

The R3 findings remain explicit: **BR85-03** was inaccurate permission-denial wording in an explicitly opened finance View; **BR85-04** was lookup save identity/presentation not advancing the header, route and immutable code consistently after an acknowledged create. Neither authorizes broader write authority or replacement of original-request recovery. The frozen pre-repair mounted regression has 46 cases: 20 passed and 26 failed across those two defect families, not 26 unrelated product defects. Those original failures and actual-browser failures remain historical evidence.

BR85-03/04 distinguish deliberate finance View from permission/lock denial and promote lookup creation using the acknowledged original identity. Their original four-file correction preserved current-owner/account guards, immutable code/category, retained requests and terminal handling of local failures after a verified commit; independent source review found no weakened authority or receipt guard. The historical 46-case baseline and subsequent 68/272-case passing packets remain recorded at their original bytes.

The later actual browser journey exposed **BR85-05**: after switching away from an uncertain save and genuinely remounting the form, the retained request still blocked editing, but local feedback had vanished and the explicit recovery button was hidden. The lookup-local hook now derives guidance from retained uncertainty, while preserving explicit errors and corrupted-witness/blocked precedence. No shared hook, database, permission or routing mechanism changed. Expanded mounted tests cover category/value create/edit, transport/malformed responses, actual unmount/remount, exact original replay, successful clearance and fresh edits on the same identity. The rebuilt-browser journey has now passed the supported sequence: blocked editing, genuine unmount/remount, visible guidance before interaction, original recovery and a subsequent fresh edit on the same record. A pre-existing newer draft remains defensive mounted-test coverage, not a claim that native disabled controls permit new edits during uncertainty.

Linux qualification also exposed a genuine PDF byte-interoperability defect. The narrow correction passes an owning plain byte array to the existing parser, preserving nonzero-offset Buffer boundaries and input bytes. It does not introduce a second parser or change shared loading/cache infrastructure.

## Current acceptance summary

| Gate | Latest accepted evidence | Still pending or qualified |
|---|---|---|
| Schema and native finance contract | All 85 F06 migrations qualified on both retained isolated targets; finance-85 R6 **108/108**, with independently accepted cleanup | Not a new all-85-from-zero replay or production application |
| BR85-05 focused verification | **94/94 across four suites**, zero failed/pending; shipping types and targeted three-file lint exit 0. Result SHA-256 `9af48588b6affdbc712ed2beddd3da7eddb39101d326fae59373353a54a2fb61` | Mounted/offline evidence, not browser or full-public acceptance |
| BR85-05 optimized build | **Passed**; BUILD_ID `0YKj8QGsPeeT9d210zT5F`; shipping digest `bbf0034ac67454bb321628f247195e5a7881faaa74061fced3b861da2b84bc60`; build receipt SHA-256 `8f3ea1d23c9a1019298544943ed560922d8f9d975a87d3302073db276f9242b1`. Before/after snapshots matched; database writes: zero | Does not certify the Linux production image or browser journey |
| BR85-05 rebuilt-browser journey | **Passed:** confirmed commit with only its response withheld, true workspace unmount/remount, explicit guidance and Recover before interaction, exact original replay without an extra write, immutable identity/category, enabled subsequent edit and Save & Close on the same record | Finite real-browser/product acceptance, not every possible UI journey or final resource cleanup |
| Final-window cleanup | **Passed and independently reviewed:** both owned lookup records inactive/unlocked/non-system; four receipts and four audits retained; admitted session/refresh/AMR artifacts absent; complete unrelated snapshots, catalogue/authority and raw sequences preserved except four earned tracked sequence advances; recorded read-only operations ended successfully; owned app stopped and exact reservations archived/released | Cleanup proves this finite window's terminal preservation, not every historical Auth behavior or production readiness |
| Latest recorded public assembly, before BR85-05 | Actual **1,017-change assembly** runs passed: F06 **9,210/267 files**; application **464/25**; inherited **891/92**; PERF **408/17** | Separate overlapping selections, not one additive total. These newer results supersede the 1,013-change snapshot for that public tree, but do not accept the later BR85-05 bytes or final immutable commit |
| Final public candidate, image and publication | **Pending** | Final normalized source/index/commit identities, complete applicable checks, security/image acceptance, reviewed PR and exact-head CI |

The red baseline for BR85-05 was **60 passed /12 failed of 72**, with all twelve failures confined to missing post-remount guidance. The focused green run resolved those failures without weakening assertions; its additional adjacent suites bring that run to 94 cases. These are overlapping runs, not an additive count. Current hook SHA-256: `a1549cd53712421711a11b70a25e62f66129434f157a4fd071079cd861213644`.

Final-window terminal receipt SHA-256: `70d8d7d881a63e35a689bfee0a550255a4f424e37c8938ca5258d3e737c74b08`; complete preservation-proof SHA-256: `b822347cee09bcbb81edf6be41bd8d4f0f40440834fe609b9d83d0b20402c9ed`; controlled app-stop receipt SHA-256: `5a7e52cf87ecbac164f004ab0a3b3b55fab2489f929e7101c070eb110d57e2d0`. These identify independently reviewed finite cleanup evidence, not the final source commit or GitHub results.

<details>
<summary>Historical evidence and limitations — retain, but do not substitute for current gates</summary>

The following records describe their original source/build and scenario boundaries. The current acceptance summary above supersedes any historical pending-build statement; original failed outcomes remain unchanged.

| Area | Recorded result | What it does not establish |
|---|---|---|
| Historical local F06 offline suite, before the W44 repairs | **8,916/8,916 across 260 files** | Includes 325 cases in three unpublished private-evidence suites; not a fresh full-suite result for the new 53-path packet or a GitHub run. |
| Historical clean-public F06 portable suite, before the W44 repairs | **8,591/8,591 across 257 files**, separately executed in the earlier assembled public candidate | Superseded for current portable coverage by the separate 9,110-case result below; retained at its original bytes, not relabelled current acceptance. |
| Fresh clean-public W44 F06 portable suite | **9,110/9,110 across 264 files**, 510.99 seconds, in the reviewed **1,013-change /4,112-file** assembly. Report SHA-256: `79454a9221a84e5a622fec7c85b6fc3f3136b072f62f554725d0cdc81d11487e` | Offline/source/mounted coverage, not native database, real browser, final immutable-commit CI, F06/PERF-P04 integration or all candidate gates. Existing upstream sourcemap, Base UI state and mocked-handler warnings remained visible; this was not warning-free. |
| Reviewed public assembly and secret scans | Exact path/hash/mode/CRLF-only normalization review passed for **1,013 staged changes /4,112 indexed ordinary files**; entire-index and staged secret scans reported **zero matching files/findings** | The original refresh stopped after copy/stage at an overly broad private-name guard; its preserved verify-only successor admitted only five unchanged, baseline-approved offline tests. No new private helper was admitted. Pattern scans are not complete privacy/history clearance; later documentation changes need a refreshed manifest/index. |
| Application units | Historical clean-public and current-source runs passed **464/464 across 25 files**; a separate fresh clean-public run also passed **464/464 across 25 files** in the reviewed 1,013-change assembly | Not native/browser or a future forward-85 candidate result. Do not add overlapping selections as a unique grand total. |
| W44 repaired-source focused portable packet | **532/532 across 9 files**, including the final syntax-amendment regression | Not the full local/public suite, native migration-84 functional/concurrency acceptance or repaired browser acceptance. |
| Fresh clean-public inherited regressions | **891/891 across 92 files**, 230.33 seconds, in the reviewed 1,013-change assembly | Includes the bounded retry-readiness test correction; original failures remain recorded separately. Not a future forward-85 candidate result. |
| Real PDF regression | One Vitest wrapper executes **three unmocked Node cases**: ordinary Buffer, nonzero-offset backing-store/sentinel preservation and repeated extraction | Not three additional Vitest cases or a universal PDF-format certification. |
| Fresh clean-public performance contracts | **408/408 across 17 files**, separately passed in the reviewed 1,013-change assembly | Not combined acceptance of an unconstructed F06/PERF-P04 composition or a future forward-85 candidate. |
| Amended-source performance contracts | A separate fresh run passed **408/408 across 17 files** after the three-source Enter/label amendment | Finite current F06 shared-contract coverage, not a refreshed public-tree check, combined P04 release or real-browser proof. Do not add overlapping runs as a unique total. |
| Amended-source department/HR/numbered interface contracts | A separate fresh packet passed **408/408 across 13 files**, covering scoped department reads/pages, HR settings/rules and retained numbered upload/recruitment sessions | Distinct from the 408-case/17-file PERF run, but not an additional unique-total claim. Controlled source/mounted/transport checks, not native DB, actual browser or refreshed public acceptance. |
| Fresh clean-public types/lint | Shipping and E2E types exit 0; full lint exit 0 with **0 errors, 126 existing warnings, 0 new warnings**, in the reviewed 1,013-change assembly | Existing warnings remain visible. Not final exact-commit checks or acceptance of later forward-85 source changes. |
| Native batch/durable matrix | **172 distinct named cases passed across retained runs 47–53**; final run covered 50 cases, including 33 new and 17 dependency/regression repetitions, with cleanup | Not one fresh all-172-green execution. Earlier failures, corrections and overlapping repetitions remain separate. |
| Isolated migration qualification | Historical 81-migration boundaries plus migrations 82 and 83 forward-applied and verified on two retained isolated targets with data, sequences and unrelated catalogue/authority preserved | Not production application, production equivalence or a newly relabelled full-from-zero replay. |
| Migration 84 exact forward application | Corrected rollback rehearsal and once-only forward commit passed on both retained isolated targets; pre-84 data preservation, sequences and unrelated catalogue checks passed. Recorded receipt SHA-256: `996b75d56d84c9d61f282a05e4c018ccd9c5841d7be21b14864b7acbe8b4abd3` | The receipt explicitly records forward-application success, not full F06 or native business/concurrency acceptance. The initial uncommitted parser failure remains retained. |
| Migration 84 native R2–R4 setup attempts | Stopped in fixture setup: **0 of 105 application cases passed**; skipped cases are not application failures. Each attempt was independently reconciled, with failed reports and executed helpers retained. R4's two owned fixture rows remain inactive/unassigned or linked historical evidence after exact cleanup | No Auth/application-RPC journey was reached in R4, and no 105-case success is claimed. R2/R3 zero-write reconciliation and R4's exact two-row/sequence delta are distinct, not an invented zero-write R4 result. |
| Migration 84 native R5 successor, historical failure | Setup passed; the **first business bank-create body unexpectedly returned 42501**. The framework then stopped the remaining 107 bodies. Although JSON reports 108 failures, **only one application body executed**; this is not 108 independently found bugs. Read-only EXPLAIN confirmed the receipt-table row-lock privilege defect | The receipt SELECT's `FOR SHARE` required UPDATE authority absent from the executing role's append-only SELECT/INSERT permissions. Forward 85 removes only that lock without permission broadening or an applied-84 edit. R5 is not relabelled passed; the later finite R6 acceptance is a separate result. |
| R5 independent known-failure cleanup | **Passed**, receipt SHA-256 `abd1e5888294062cbf04fafec8efba06e740f2de2698a1ccc624ad77c71e991e`: both catalogues, unowned rows, owned receipt/audit history, raw sequences and seven session revocations verified; tracked fixtures inactive/history retained; exact lease archived and released; no application running | This closes known-failure cleanup only, not the failed native application case or the remaining 107 cases. Executed helpers and original failure evidence stay immutable. |
| Migration 85 forward application and current qualification | **Passed on both retained isolated targets**: rollback rehearsal, exact single-function delta, all 343/341 table-row projections and raw sequences preserved, known-ended commits and exact lease archive/release. Forward receipt SHA-256: `5c08f41ce638dddb869a18294443606ccb3320d497583921067ec07e7866faeb`; fresh current-85 qualification also passed | The forward receipt alone is not production, full-from-zero replay or native/browser acceptance. See the separate actual R6 result below. The existing 1,013-change public assembly still excludes the 85 migration/test updates. |
| Migration 85 focused source checks | **23/23 across 2 files** passed; shipping/scoped types and scoped lint passed on the frozen source handoff | Offline model/source/authoring checks, not native SQL behavior or a refreshed full clean-public result. Do not add this overlapping packet to older suite totals. |
| Finance-85 native R6 | Actual process exit 0; **108 passed, 0 failed, 0 pending, 0 todo**. Fresh independent read-only cleanup verification also **passed**, covering both catalogues, owned/unowned history, sessions, raw sequences and exact resource closure | This is bounded finance-85 native and cleanup acceptance, not full F06, public-image, real-browser or production acceptance. Earlier failed attempts remain separate and retained history is not deleted. |
| Historical R2 browser packet | Actual **case 2 failed**: Enter from the code input submitted none of the three finance forms; no submit controls existed. Footer Save/Save & Close still produced correct linked 2/2/3 errors, focus and retained forms. Technical lookup labels were reproduced. Eleven other cases were untested in that window | No business rows or operations were created. Safe abort and independent 32-read/0-write cleanup passed. Its failed observations, earlier tracker failure and original missing-preimage limit remain preserved; later R3 evidence does not rewrite R2. |
| Enter/label source repair | **41/41** new tests passed, independently rerun by main; related **607/607 across 13 files** passed, including the 41-case suite. Shipping/test types, scoped lint and independent read-only source review passed | Three shipping paths changed within the same **1,652-path** manifest; **1,649 unchanged**. Shipping digest: `7262587a503e049a1bcdd210cf3977e7b81bbaf82c601c15676662f08779af0e`. These are focused source/mounted checks, not whole-phase acceptance. |
| Qualified amended-source optimized build | **Passed**, BUILD_ID `vIcG6Lmv6OYDr9svOEz3y`, shipping digest `7262587a503e049a1bcdd210cf3977e7b81bbaf82c601c15676662f08779af0e`; complete before/after preservation matched and 59 read-only checks ended | The earlier strict successor-admission gap was corrected and reviewed before this build. This accepted build does not preaccept later BR85-03/04 shipping edits, a Linux production image or all browser cases. |
| Historical R3 actual-browser ledger | **Seven finite PASS: cases 2/3/4/5/6/8/10; two FAIL: cases 1/9**. Its cleanup continuation recorded **case 11 PARTIAL** and **cases 7/12 UNTESTED** | Original R3 outcomes remain historical. Later dependent-choice and recovery observations do not retroactively change that report; final rebuilt-browser acceptance is separate. |
| R3 exact synthetic cleanup | The independently source-reviewed one-shot cleanup exited 0 and recorded **PASS_EXACT_FINAL85_CLEANUP_NOT_UI_ACCEPTANCE**. Nine terminal tracked rows, 34 receipts, 28 audits, 257 raw sequences, unrelated rows/authority/quota and the second isolated target were preserved; the exact residual synthetic session/descendants were removed, with zero sessions/live refresh remaining. Owned shared/app reservations were archived and released. Terminal receipt SHA-256: `c60836684a76e90e6407d015433fef3b7a847faf54e03837a84b36d205dd509a` | This closes the exact residual resources, not the historical failed cleanup attempt, case 12, broader Auth behavior or all F06. It does not explain the earlier local post-refresh `bad_jwt` response, establish a production defect or claim the old launcher exited successfully. Original failures/history and missing-preimage limitations remain retained. |
| BR85-03/04 frozen source repair | Writer packet **68/68 across 3 files** passed, report SHA-256 `70c30ad97a06bc766f59b8d9a5484ef251c1f059a58ca303de9c596a4f04a180`; main's independently executed affected packet **272/272 across 9 files** passed, report SHA-256 `57d934d2881e8b74067d7609b90bb251794c243bab4b00b7ac183c4a2801fd8a`. Shipping types and six-file scoped lint exited 0; independent frozen-source review found no concrete blocker | The packets overlap and must not be added. The unchanged 46-case assertions now pass, but the historical 20-pass/26-fail report remains intact. Mounted tests use navigation/draft doubles; they do not prove actual browser route transitions or real-control newer-draft retention. |
| Historical BR85-03/04 shipping identity | Same **1,652-path** manifest, **exactly 4 changed /1,648 unchanged** from the Enter/label build input; shipping digest `62cfb1ceceed14acbebcd02dbb5ca37e73a1bc4693320882997011896478f25f` | Superseded by the later BR85-05 source/build identity above; not the final public/index/commit or image identity. |
| Native lookup and consumer ordering | Original lookup run **32 passed /1 failed at a pre-existing-fixture guard**, before consumer mutation; corrected consumer successor **2/2 passed**, with independently checked rollback, cleanup and session closure | Original failure and an intervening fixture-column failure/reconciliation remain retained. The two successor cases exercise actual validator SQL-context ordering plus genuine lookup API calls, not complete geography/finance business-RPC journeys. |
| API permission checks | **19 actual authenticated API denials passed** with session/cleanup and preservation checks | Not every business/browser authorization journey. |
| Provider residual matrix | **6 cases / 8 decisions passed**, with run-owned cleanup and no real provider calls | Not real email delivery or F09 activation. |
| Retained native cleanup | Exact terminal verification and lease release passed after preserved partial/failure reconciliation | Original process-only full authority preimage was unavailable; do not invent exact original full-preimage restoration. |
| Historical ordinary and numbered browser journeys | Ordinary form/child/provider/branding validation and original committed-response-loss recovery; numbered N03–N07; R1/R6; genuine upstream-reader failures/recovery R2–R5, with tracked cleanup | N03/N04 used synthetic analysis with providers disabled, not real AI success. These results do not certify the later W44 repairs. |
| W44 finite browser window, before the repair packet | Actual lookup validation/default/lock and original committed-response-loss recovery; populated scoped HR read-only boundaries; finance reference choices; disabled AI-provider default switching; original-retry nonconsumer flag; genuine timed-out read/reload; N02 required-type and cancellation checks | The same window exposed lookup label/search/stale-revision defects and incomplete three-master action/recovery/lifecycle adoption. Repaired-source browser retesting remains pending. The owner resolved the browser-policy obstacle; it is not a current blocker or a passed ERP journey. |
| W44 fixture cleanup and cancelled-upload finding | Tracked fixtures retired/archived or restored by exact owned postimage checks; pre-existing records/history preserved. The retained cancelled N02 upload blob was removed manually and its absence verified | Legacy finance cleanup used exact owned manual changes, not successful UI lifecycle acceptance. Cancelled-upload automatic cleanup failed; its inherited defect is recorded for F07, not fixed or accepted here. No new phase was started. |
| Historical Linux image acceptance | Original frozen-source image/native verification, complete historical-layer certificate containment/trust review, non-root boot and temporary-resource/certificate cleanup passed and were independently reviewed; recorded extraction includes **11 native application, 37 policy and 66 installed-security cases** | This accepted historical scope does not certify later lookup changes or a new candidate image. Earlier failed attempts remain retained. |
| Current Linux CI gate | Reviewed same-immutable-image provenance/trust, **11 native application cases**, installed-runtime and non-root boot gate. Fresh pure policy/controller packet **70 passed**: 37 dependency-policy and 33 image-controller cases | The 70 pure cases do not execute/accept an image. Actual exact-head CI execution remains pending. The new gate does not claim a new all-layer certificate scan; historical containment evidence stays bound to its original inputs. |
| Historical whitespace and optimized build, before the W44 repairs | Token-preserving corrections passed contextual AST equivalence; focused public lookup regressions **43/3** passed. Optimized source digest `36632709d6806d05050fefaa8b6c7e885178baf8bdceeaf65ddda03fa841b060`, BUILD_ID `fb6qLa7UjdspwHvJyspED`, build exit 0 | These exact historical bytes do not include the new repair packet and remain separate from the new build below. |
| Historical W44 build before the Enter/label amendment | **Passed**, BUILD_ID `NT53FOqACbzJzsLJjicMA`, shipping source digest `a76ddef1002fc6c25cdb727704d92b458f7c25932a9925127c0ccce15654e65f` | This build excludes the three-source amendment. The accepted later amended-source build is recorded above; neither is final-image or whole-browser acceptance. |
| Isolated restart admission | Read-only restart qualification passed after Docker startup: retained identity/catalogue and 304/305 table projections matched exactly; the complete feature-flag projection matched its reconstructed recorded state, including disabled tracked flag 28; authority/providers preserved. Eleven private negative-admission checks passed | No reset, reseed or migration reapplication. This is a bounded persisted-state admission result, not a business-browser pass or a claim that an unsaved full pre-restart snapshot exists. |
| Final public candidate and PR | **Pending** | No final candidate SHA, PR or exact-commit GitHub success is claimed. |

</details>

Actual browser result labels identify bounded acceptance cases, not additional implementation phases. A known committed save must be reconciled using its original operation/receipt; it is not retried under a new identity.

The fresh application-unit rerun retained the existing Vite CJS/ESM loader warning without suppression; it passed and did not establish a new runtime failure or replace native/browser checks.

Finite F05/PERF source-contract review is clear for preserving the adopted C0/L0/L1/HDF read-attempt, current-principal/cache retirement, governed choices, authorized branch options and complete scoped label/options contracts. The newer inspected P04 donor's raw lookup reads and older direct finance/HR or numbered mutation paths were not imported: whole-file replacement would discard current authority/revision/hidden-field/original-retry contracts. The amended-source 408/17 pass is finite shared-contract evidence, **not** an actual composed F06/P04 release test. That composition remains untested/unaccepted; see the handoff for the bounded integration requirements.

## Public test and source-fixture boundaries

These six native-looking files are included only as inert source fixtures required by portable contracts. Public CI must not execute them as native acceptance:

1. `tests/remediation/f06/dms-batch-admission.local.test.ts`
2. `tests/remediation/f06/party-finance-lock-authority.local.test.ts`
3. `tests/remediation/f06/party-service-assignment-atomic.local.test.ts`
4. `tests/remediation/f06/dms-numbered-ai-approval.local.test.ts`
5. `tests/remediation/f06/document-employee-atomic.local.test.ts`
6. `tests/remediation/f06/numbered-recruitment-atomic.local.test.ts`

Keep these three private-dependent roots unpublished:

- `tests/remediation/f06/ac-prerequisite-continuation.test.ts`
- `tests/remediation/f06/n03-early-retirement.test.ts`
- `tests/remediation/f06/n03-retirement-continuation.test.ts`

Do not publish their protected inputs or disable their locally recorded verification to obtain public CI success. Current lab-only runtime/browser/reconciliation/selectors, private credentials/ledgers, actual business records and raw private audit evidence remain excluded.

The portable `pdf-byte-interop.test.ts` literally spawns `pdf-byte-interop.cjs`; publish both. Its PDFs are synthetic in-memory bytes, not uploaded business files or additional binary fixtures. Preserve required shared test support and source-read dependencies, rather than copying every lab file.

## Dependency security

Use pinned **Node 22.23.2 / npm 10.9.8** and the committed lock/artifact. The recorded full raw audit reports **8 high derivative entries, 3 moderate, 0 critical; raw exit 1**. This is not a zero-vulnerability audit or upstream fixed release.

The reviewed local braces 3.0.3 nesting mitigation preserves its original MIT identity/license and advisory `GHSA-vfj7-8cjw-p6xm`. Installed security/parity coverage passed **66 cases**; gate-policy coverage passed **37 cases**. The hash-bound gate permits only the exact verified mitigation and exclusively derived advisory chains with fresh installed proof. Unrelated or changed high/critical findings, drift, extra installed copies/links, malformed reports, registry errors or incomplete proof fail.

The actual dependency gate now passed in the existing pre-85 public assembly using the existing Windows system CA with TLS verification intact; fresh installed mitigation coverage passed 66 cases. The raw audit still reports 8 high derivative entries, 3 moderate and 0 critical, with raw exit 1. Gate success is the narrowly reviewed local-remediation outcome, not an upstream fixed release, blanket waiver or zero-vulnerability result. Final refreshed-candidate/image checks remain separately required.

- Lock raw Windows-working-file SHA-256: `4e6594e73eeb43dd22d1376397bc564d731d51fdc695fd684438560571bea6f5`.
- Lock canonical public-index LF SHA-256: `8183029535ea12529e3a78264623980d9d5900bf0c2b11195a7574ef602bb64f`.
- Artifact SHA-256: `1d495e2aa88c0aa95579657195da65eb5be1467f65eb2da5f549a05416430033`.
- Gate SHA-256: `0990811db241c372d72ac9694ae092e8da21288e263c1f19f87307fcbf6451b2`.

Readable vendor source, MIT attribution, provenance, fixed oracle/generator, security tests and exact tarball must travel together. This is not proof of bounded arbitrary expansion/regex behavior.

The earlier Linux audit transport failure was causally traced to registry DNS resolution (`EAI_AGAIN`). A scoped strict-TLS retry obtained the real audit graph without disabling audit or changing the security policy. Historical Linux verification retained the qualified local-remediation outcome. A later Windows certificate-chain transport failure was retained separately; a strict-TLS retry using the existing system trust store passed without a TLS bypass or trust-store change. Neither result replaces the fresh exact-head image/native/boot gate. Raw audit/installed-test metadata belongs in scoped CI artifacts, not committed private evidence.

## Reproducible clean-public-tree checks

Run from the exact assembled public candidate without private evidence, credentials or production connections:

```text
npm ci
npm run security:secrets
npm test
npm run test:remediation
npm exec --no -- vitest run --config tests/remediation/f06/vitest.config.mts
npm exec --no -- vitest run --config tests/performance/unit.config.mts
npm run typecheck:e2e
npm run test:e2e -- --list
npm run build
npm run typecheck
npm run lint
node --test tests/remediation/f06/dependency-gate.test.cjs
node --test tests/remediation/f06/linux-image-check.test.mjs
npm run security:dependencies
```

Use synthetic loopback public build configuration, strict TLS and isolated dependencies. The F06 Vitest glob does not discover CJS directly; explicit gate-policy invocation and the dependency gate's fresh installed-security proof remain required. E2E `--list` is discovery, not real browser acceptance.

Default secret scanning covers tracked text. Review the actual complete proposed index/staged changes, outgoing history, private-data/assets boundary and packaged vendor contents as well. Generate final Git-blob/commit identities after line-ending normalization.

Windows builds do not replace fresh exact-head Linux image installation, eleven positive native-application cases, provenance/trust and installed-runtime checks, non-root boot or anonymous-route boundaries. The independently accepted historical all-layer certificate containment belongs to its original source/image scope and is not relabelled as a new scan.

## Remaining candidate gates

1. Preserve the accepted BR85-05 rebuilt-browser journey and its exact source/build/evidence boundary; do not repeat it merely to replace historical OPEN text. Retain applicable finance/lookup validation, read-failure and owner-isolation evidence. A failed RSC request followed by successful full-document navigation proves fallback recovery, not retention after total reload failure. Native newer-draft editing while controls are disabled is not claimed.
2. Preserve the independently passed final-window cleanup and controlled app-stop proof; do not rerun one-shot cleanup or reopen completed resources. Retain historical failures and earlier local `bad_jwt`/missing-preimage limitations without silently promoting them to production defects or passes.
3. Refresh the explicit public allowlist with final migration-85/UI/test/document bytes; run complete applicable F06/application/inherited/PERF/type/lint checks and independent source/index/history/privacy review. The newer pre-BR85-05 **9,210-case /1,017-change** result and older **9,110-case /1,013-change** result remain historical, not final-commit passes.
4. Obtain fresh exact-head installed-security and immutable Linux image/native/provenance/trust/non-root boot acceptance, with owned cleanup. Preserve raw advisory findings and the narrowly verified mitigation; Windows builds and pure controller tests are not image acceptance.
5. Recheck publication-trigger safety, publish the reviewed F06 branch, create/attach its PR and obtain actual exact-commit checks. Finalize migration/recovery/PERF handoff and remaining qualifications. No merge or deployment.

Physical-device/native screen-reader speech and unobserved measurements are not certified by viewport, DOM, keyboard or accessibility-tree tests. Synthetic company/profile/signing checks do not authorize real business assignments.

See [RELEASE_HANDOFF.md](RELEASE_HANDOFF.md) for all 26 inherited prerequisites, 85 F06 migrations, historical raw/public-index identities, the current source inventory and integration limits. F05/PERF ownership remains protected; F09 is inactive. No main merge, production deployment, real email or new phase follows automatically.
