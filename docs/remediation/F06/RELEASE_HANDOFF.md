# F06 — integration and controlled-release handoff

Updated 16 October 2026. Status: **PRE_PUBLICATION_SNAPSHOT — CANDIDATE_NOT_CLOSED**. This document is an implementation and integration contract, not an executable production migration instruction or approval to merge/deploy.

## Identity and evidence boundary

- Repository: `sameerfahmi1979-maker/ERP`.
- Working branch: `codex/f06-shared-administration`.
- Inherited source base: `284d4a4bb2d679aaabf77ba6013fa4f136e38085`.
- Final reviewed F06 candidate SHA, PR URL and exact-commit GitHub checks: **pending**.
- Production migration, deployment and main merge: **not performed under this candidate**.

The base does not identify uncommitted F06 changes. The companion [README](README.md) gives implemented T01–T06 contracts, actual current results and precise limitations. Record the final immutable candidate SHA, PR URL and exact-head checks in the published PR and final closeout handoff; this pre-publication document does not pretend to contain its own future commit identity.

## Current handoff readiness

| Boundary | Current disposition |
|---|---|
| Isolated database | **Qualified through all 85 F06 migrations on both retained targets.** Finance-85 R6 passed 108/108 with independently accepted terminal cleanup. This is not production application or a new uninterrupted all-85 replay. |
| BR85-03/04 | Implemented, source-verified and independently reviewed; original failed browser reports remain historical. No permission broadening or shared F05/PERF rewrite. |
| BR85-05 | Minimal lookup-local remount-guidance fix implemented. Four focused suites **94/94 passed**, shipping types and targeted lint exit 0. Result SHA-256 `9af48588b6affdbc712ed2beddd3da7eddb39101d326fae59373353a54a2fb61`. |
| Exact BR85-05 build | **Passed**, BUILD_ID `0YKj8QGsPeeT9d210zT5F`; shipping digest `bbf0034ac67454bb321628f247195e5a7881faaa74061fced3b861da2b84bc60`; receipt SHA-256 `8f3ea1d23c9a1019298544943ed560922d8f9d975a87d3302073db276f9242b1`. Before/after preservation snapshots matched; database writes: zero. |
| BR85-05 rebuilt-browser journey | **Passed:** actual response-only loss after confirmed commit, true workspace unmount/remount, explicit recovery guidance before interaction, exact original replay with unchanged graph/receipt/audits and no extra write, immutable identity/category, fresh same-record edit and Save & Close. |
| Final-window cleanup | **Passed and independently reviewed:** both owned lookup records inactive/unlocked/non-system; four receipts/four audits retained; admitted session/refresh/AMR artifacts absent; complete unrelated snapshots, catalogue/authority and raw sequences preserved except four earned tracked advances. Read-only observations ended successfully, the owned app stopped and exact reservations were archived/released. |
| Latest recorded public assembly, before BR85-05 | Actual **1,017-change assembly** passes: F06 **9,210/267 files**, application **464/25**, inherited **891/92**, PERF **408/17**. These are separate, overlapping selections, not a summed total or acceptance of the later BR85-05/final-commit bytes. |
| Final public candidate / Linux image / PR / exact-head CI | **Pending.** Earlier clean-public results remain accepted only at their historical bytes; no final candidate commit or PR is claimed. |

BR85-05 derives missing guidance from a retained uncertain request after a true form remount. Explicit errors, blocked/corrupt witnesses, original payload/operation, receipt validation and owner lifetime remain authoritative. The current hook SHA-256 is `a1549cd53712421711a11b70a25e62f66129434f157a4fd071079cd861213644`. Actual rebuilt-browser acceptance now covers blocked editing, visible recovery after a genuine unmount/remount, unchanged original replay, acknowledged identity and subsequent fresh edits. Response interception was cleared after the controlled loss. Defensive retention of a pre-existing newer draft has mounted-regression evidence; native typing while controls are disabled is not claimed. Product and independently reviewed cleanup acceptance do not close the final public/image/publication gates.

Final-window terminal receipt SHA-256: `70d8d7d881a63e35a689bfee0a550255a4f424e37c8938ca5258d3e737c74b08`; complete preservation-proof SHA-256: `b822347cee09bcbb81edf6be41bd8d4f0f40440834fe609b9d83d0b20402c9ed`; controlled app-stop receipt SHA-256: `5a7e52cf87ecbac164f004ab0a3b3b55fab2489f929e7101c070eb110d57e2d0`. These are finite evidence identities, not Git commit identifiers or production acceptance.

Navigation: [26 prerequisites](#predecessor-schema-and-inherited-prerequisites), [85 F06 migrations](#exact-f06-migration-order-and-source-identities), [application/schema coordination](#applicationschema-coordination), [PERF integration](#f05-and-perf-p04-integration-contract), [security gate](#dependency-artifact-and-security-gate), [remaining gates](#current-remaining-candidate-gates).

<details>
<summary>Historical verification chronology and limitations</summary>

This chronology preserves original outcomes and source boundaries. Pending statements inside it describe their historical checkpoint and are superseded by the current readiness table above; original failures are never rewritten as passes.

Historical local F06 offline verification, before the W44 repairs, passed **8,916 cases /260 files**, including 325 cases in three unpublished private-dependent suites. Separately assembled historical clean-public verification passed **8,591 /257**, application units **464 /25**, inherited regressions **891 /92** and performance contracts **408 /17**, all zero failed/pending/todo. The new W44 repair packet has a focused current-source **532 /9** portable pass, including the final syntax amendment, and a fresh current-source application-unit rerun passed **464 /25**. Those focused/source results are not full-suite or clean-public results. Separately, actual fresh clean-public F06 verification now passed **9,110 /9,110 cases across 264 /264 files in 510.99 seconds**; report SHA-256 `79454a9221a84e5a622fec7c85b6fc3f3136b072f62f554725d0cdc81d11487e`. Existing upstream sourcemap, Base UI state and mocked-handler warnings remained visible, not suppressed. Do not sum overlapping selections into a unique grand total. The real PDF regression is one Vitest wrapper with three unmocked Node cases. None of these results establishes native/browser acceptance, all remaining gates, a combined PERF-P04 composition or final immutable published-commit acceptance.

The W44 repair union contains 53 unique source/test/migration paths, with a later two-file syntax amendment inside that union. It addresses observed lookup label/search/revision-admission defects and the three legacy finance masters' missing governed actions, retained recovery and safe retirement. Migrations 84 and 85 were actually forward-applied on both retained isolated targets. The earlier explicit 57-file public refresh adds two reviewed test corrections and two public documents to the 53-path union; that reviewed detached assembly remains **1,013 staged changes /4,112 indexed ordinary files**, excluding the later 85 and UI amendments. Working/index hashes, exact path sets, modes and CRLF-only differences passed verification; receipt SHA-256 `150ef485f940170458a61e49626a0c0c5110dac63f202cf1d7cd1a9b94bd2fec`. Entire-index and staged secret scans reported zero matching files/findings. The original copy/stage attempt's broad private-name guard rejected five unchanged baseline-approved offline tests; the failed attempt is preserved and a separately reviewed verify-only successor bound only those five exceptions. No private helper was admitted. The 9,110-case pass ran in that pre-85 assembly, not a final immutable commit. New migration/UI/test/document bytes require explicit public refresh and review. Finite current-85 R6 native execution passed 108 cases and fresh independent cleanup passed. The subsequent R3 browser ledger records seven finite passes, two failures, one partial case and two untested cases; its exact synthetic cleanup has passed separately. BR85-03/04 repairs are now implemented, source-tested and independently reviewed. Their fresh build, affected browser acceptance and its own cleanup, refreshed public gates and exact-head GitHub checks remain pending. F06 is not closed.

The fresh application-unit rerun retained the existing Vite CJS/ESM loader warning without suppression. The pass is not a native/runtime acceptance result, and that existing warning is not recorded as a new runtime failure.

The public assembly also predates the latest Enter/label source amendment. That amendment changes exactly three shipping paths: the finance form's native submit control, optional serializable lookup-label prop and its forwarding. The new 41-case source suite passed and main independently reran 41/41; the related packet passed 607/607 across 13 files, **including** the new 41 cases. Shipping/test types, scoped lint and independent source review passed. Existing validation, footer actions, save/recovery/permission guards and shared read/cache mechanisms remain unchanged. These overlapping checks are not 648 unique cases and do not prove real-browser implicit Enter.

The Enter/label shipping manifest retained the same **1,652 paths: exactly 3 changed and 1,649 unchanged**, digest `7262587a503e049a1bcdd210cf3977e7b81bbaf82c601c15676662f08779af0e`. A separate fresh amended-source PERF run passed **408/408 across 17 files**, not a refreshed public-tree run or an actual F06/P04 composition. Another source-bound interface packet passed **408/408 across 13 files**: scoped department pages/reads, HR settings/options/rules and retained numbered upload/recruitment sessions. These equal case counts describe different packets; do not sum overlapping coverage into a unique total or infer native DB/actual browser acceptance. The earlier strict successor source/build-preservation admission gap was corrected and independently reviewed before runtime admission; it was verification-tool work, **not observed product-row drift**, and changed no application/security-limiter behavior. The subsequent source-bound optimized build **passed**, BUILD_ID `vIcG6Lmv6OYDr9svOEz3y`, with complete before/after preservation and 59 read-only checks ended. This is accepted at those exact shipping bytes; the now-implemented BR85-03/04 shipping edits require a new affected build and browser retests, not reuse of this result as final acceptance.

Further actual clean-public checks in the reviewed 1,013-change assembly passed: application units **464/464 across 25 files**, inherited remediation **891/891 across 92 files in 230.33 seconds**, and PERF contracts **408/408 across 17 files**. Shipping/E2E types both exited 0; full lint exited 0 with **0 errors, 126 existing warnings and no new warnings**. These are separate fresh runs, not sums or a warning-free claim. They exclude the later forward-85 migration/test changes and do not certify a combined F06/PERF-P04 release or final immutable commit. Refresh affected checks after their inputs change.

Native batch/durable coverage reached **172 distinct names across retained runs 47–53**, including the final 50-case continuation with 33 new and 17 repeated prerequisites/regressions. This is not a fresh single-run all-172 pass. A later native lookup run actually passed 32 cases and failed case 33 at a pre-existing-fixture guard before consumer mutation. An intervening consumer fixture-column failure and exact reconciliation are retained. The corrected successor actually passed 2/2, with independent baseline, rollback, resource/session cleanup and reservation-release review. Those two cases combine genuine lookup API calls with actual geography/finance validator SQL-context ordering; they are not full geography/finance business-RPC acceptance, and the original failed report remains unchanged.

Migration 84 native attempts R2–R4 stopped in fixture setup with **0 of 105 application cases passed**; skipped cases are not application failures or successful coverage. Their executed helpers and failed reports remain unchanged, and each attempt was independently reconciled. R2/R3 have distinct zero-write reconciliations. R4 reached no Auth sign-in, user assignment or application RPC; its two exactly tracked SQL fixture rows were reconciled by retiring only the unassigned owned role while preserving its link/history, earned identity advances and all unrelated data/sequences/authority. R4 must not be relabelled zero-write or 105 passed.

The separately reviewed 108-case R5 successor passed setup, then its **first business bank-create body unexpectedly returned 42501**. The framework stopped the remaining 107 bodies. The JSON aggregate reports 108 failures, but **only one application body executed**; these are not 108 independent application defects or a completed matrix. An independent read-only EXPLAIN-only diagnostic confirmed `permission denied for table master_lifecycle_receipts`: the receipt SELECT requests `FOR SHARE`, which requires UPDATE authority, while the executing role has only the intended append-only SELECT/INSERT permissions. The diagnostic made no business write, new session or privilege change. The frozen forward 85 now removes only this unnecessary receipt lock, preserving advisory/idempotency locking, other row locks, exact metadata/ACL and receipt/replay/authority rules. It was forward-applied and qualified on both retained isolated targets, without broadening UPDATE rights or editing applied 84. Its forward receipt closes that repair/preservation slice only; R5's failed body is not retroactively passed. The actual successor result is recorded separately below.

R5 known-failure cleanup is now independently accepted: receipt SHA-256 `abd1e5888294062cbf04fafec8efba06e740f2de2698a1ccc624ad77c71e991e`. Both exact catalogues, full unowned rows, owned receipt/audit history, all raw sequences and seven session revocations were freshly verified; tracked fixtures remain inactive with history preserved. All historical SQL backends, the owned host and listener were absent. The exact lease was durably archived and released; no application or shared lease remained at that reconciliation. This is failure-cleanup acceptance, **not native application acceptance**. The three intended positive-capability cases are transaction-local SQL-context checks, not HTTP or positive acceptance of the unchanged inactive canonical view permission; they did not execute in R5. The original failed report/helpers remain immutable, and the subsequent R6 outcome is separate.

The actual finite finance-85 **R6 native successor exited 0: 108 passed, 0 failed, 0 pending and 0 todo**. Fresh independent read-only terminal cleanup verification also **passed**, covering both catalogues, complete owned/unowned history, the other retained target, sessions, raw sequences and exact resource closure. The source-bound verification inputs were independently file-reviewed. This fresh verification made no writes and did not delete retained history. This accepts the bounded native/cleanup packet, not all F06 requirements, a public production image, real browser behavior or production release. Earlier setup failures, R5's one executed failure and the other stopped bodies remain historical evidence, not erased or added to the 108-case pass. Raw native reports, resource records and fixture identities remain private.

The historical R2 browser packet had **case 2 failed, 11 other cases untested and 0 accepted in that window**. R2 reproduced Enter from the code input doing nothing on all three finance forms, with zero native submit controls. Footer Save/Save & Close correctly showed linked 2/2/3 required errors, focus and retained forms; technical lookup labels were also confirmed. No business rows or operations were created. Normal logout, exact owned-app stop and safe abort were followed by accepted independent read-only cleanup: 32 reads and zero writes, with exact closure/archive/release. The earlier first tracker attempt and its accounting failure remain separately preserved; its original missing preimages remain explicitly unproven, not invented from later complete baselines. The Enter/label repair, qualified build and R3 observations are later separate evidence; they do not rewrite R2's original failure. Tracker cleanup alone never establishes browser acceptance.

The current R3 actual-browser ledger records **seven finite PASS: cases 2/3/4/5/6/8/10; two FAIL: cases 1/9**. Its cleanup continuation adds **case 11 PARTIAL** for actual Banks list/record read failure and recovery; **cases 7/12 remain UNTESTED**. Dependent-choice failure/recovery and complete original-retry/terminal acceptance are not proved by that partial read check. The original tracker input incident and later failed terminal-cleanup receipt remain preserved, not reclassified as additional ERP defects or completed cleanup.

The two recorded product findings are **BR85-03**, inaccurate permission-denial wording when an authorized user deliberately opens a finance record in View mode, and **BR85-04**, lookup acknowledged-create identity/presentation not consistently advancing the header, route and immutable code. The frozen pre-repair mounted packet has **46 cases: 20 passed, 26 failed** across these two defect families; it does not represent 26 independently discovered bugs. That original failed packet remains unchanged.

The frozen BR85 correction is now **implemented and source-verified**. Finance View wording distinguishes deliberate viewing from actual permission/lock denial without enabling changes. Lookup creation promotes the header, immutable code/category, owning tab and active route only after verified acknowledgment; subsequent saves retain the same identity. Recovery preserves the original request and newer mutable drafts. Replaced/unmounted owners cannot clear, notify, navigate or close another owner, and post-commit local display failure is terminal rather than a new mutation retry. Independent read-only review of all four source diffs and the two navigation-only test-mock changes verified the frozen hashes and found no concrete blocker or weakened permission/receipt guard. The 46-case fixture remains unchanged. No shared F05/PERF mechanism, database or dependency changed in this correction.

Actual writer verification passed **68/68 across 3 files**, report SHA-256 `70c30ad97a06bc766f59b8d9a5484ef251c1f059a58ca303de9c596a4f04a180`; main independently ran the affected packet with **272/272 across 9 files** passed, report SHA-256 `57d934d2881e8b74067d7609b90bb251794c243bab4b00b7ac183c4a2801fd8a`. Both reports have zero failed/pending cases. Shipping types and six-file scoped lint exited 0. These packets overlap, so their counts are not a combined unique total. The same **1,652-path** shipping manifest has **exactly 4 changed /1,648 unchanged** against the accepted Enter/label build input, now digest `62cfb1ceceed14acbebcd02dbb5ca37e73a1bc4693320882997011896478f25f`. This is not an optimized build, final public/index/commit identity or actual-browser pass. The focused mounted suite substitutes navigation/draft ports; route promotion and newer-draft retention with real controls, affected browser/cleanup, fresh source-bound build and final public/image/CI gates remain open.

R3 exact synthetic resource cleanup subsequently **passed**: the independently source-reviewed one-shot helper exited 0 and recorded `PASS_EXACT_FINAL85_CLEANUP_NOT_UI_ACCEPTANCE`, terminal receipt SHA-256 `c60836684a76e90e6407d015433fef3b7a847faf54e03837a84b36d205dd509a`. It deleted only the exact residual synthetic session and reviewed descendants after a locked full-preimage comparison. Its terminal verification preserved nine tracked rows, 34 receipts, 28 audits, all 257 raw sequences, unrelated rows, authority/quota and the second isolated target; sessions/live refresh were zero. Exact owned shared/app reservations were durably archived and released after proof. Old failed states remained unmodified, and the receipt explicitly does not claim the old launcher exited successfully or all F06 passed.

That cleanup closes the known residual resources; it does not retroactively pass the failed terminal attempt, case 12 or broader Auth behavior. The earlier local post-refresh `bad_jwt` observation remains unexplained by the cleanup receipt, not established as a production defect or permission problem. A visible sign-in screen alone was never treated as server-session/refresh-token proof. Preserve failed receipts, retained history and original-preimage limitations; do not reset/reseed, restore guessed counters or infer missing original quota preimages from later tracked transitions. Raw runtime/actor/session/resource details stay private. Any subsequent post-repair browser window requires its own independently reconciled terminal cleanup.

Historical ordinary/child/provider/branding recovery, numbered N03–N07, R1/R6 and genuine upstream R2–R5 failed reads/recovery passed with tracked cleanup. N03/N04 used explicitly synthetic analysis with disabled providers, not real AI success. The owner subsequently resolved the stale-page browser-policy obstacle. The W44 finite browser window then actually exercised lookup validation/default/lock and original committed-response-loss recovery; populated scoped HR read-only boundaries; finance reference choices; disabled AI-provider default switching; original-retry nonconsumer flags; genuine timed-out reads/reload; and N02 required-type validation/cancellation. It also exposed lookup label/search/stale-revision defects and incomplete three-master actions/recovery/lifecycle. That window ran before the new repair packet and does not accept the repaired source.

W44 fixture cleanup retired/archived or restored only tracked owned postimages, preserved existing records/history and released owned sessions/resources. The legacy finance fixtures required exact owned manual cleanup rather than successful UI lifecycle operations. N02 cancellation issued no document/number, but the cancelled upload blob remained: the inherited cleanup selection excludes the retained deleted session. Only that exact owned object was manually removed and its absence verified; retained session/audit/history and pre-existing upload rows were preserved. This is **manual fixture cleanup, not an automatic-cleanup pass**. The confirmed inherited cleanup defect is handed to F07, remains unfixed/unaccepted here and does not start that phase.

Historical shipping/E2E types and lint passed with zero errors/new warnings (126 recorded baseline warnings); historical clean-public portable types/lint/policy checks also passed. E2E discovery of16cases/three files is discovery only. The W44 writer's shipping types and scoped lint passed within its reviewed source scope; they do not replace final public-tree checks. Migrations82/83 forward qualification and isolated cleanup have accepted bounded evidence. Token-preserving whitespace corrections passed contextual AST equivalence; focused public lookup43/3 passed. The historical optimized isolated build before the W44 repairs passed with shipping digest `36632709d6806d05050fefaa8b6c7e885178baf8bdceeaf65ddda03fa841b060`, BUILD_ID `fb6qLa7UjdspwHvJyspED`, exit0. A later W44 build passed with BUILD_ID `NT53FOqACbzJzsLJjicMA` and shipping digest `a76ddef1002fc6c25cdb727704d92b458f7c25932a9925127c0ccce15654e65f`; it predates the three-source Enter/label amendment. The accepted amended-source build `vIcG6Lmv6OYDr9svOEz3y` is recorded separately above. None of these historical/build results accepts the later BR85-03/04 shipping bytes, the remaining browser cases or final exact-head Linux/CI gates.

Historical original-source Linux image/native verification, complete historical-layer certificate containment/trust review, uid1000 boot and temporary-resource/certificate cleanup passed and were independently accepted, including11 native application,37 policy and66 installed-security cases. That scope does not certify later lookup bytes. The reviewed new exact-head CI gate checks one immutable fresh image, provenance/trust,11 native application cases, installed-runtime identity and non-root boot. A fresh pure packet passed **70 cases: 37 dependency-policy and 33 image-controller checks**; this is not image execution or acceptance. Actual exact-head execution remains pending. The gate does not claim a new all-layer certificate scan. Final browser, document/hash freeze, outgoing review, PR and exact-head GitHub checks remain mandatory. Earlier failed attempts remain retained separately.

Read-only persisted-state requalification passed after the isolated Docker restart: identity/catalogue and304/305 table projections matched exactly; the complete feature-flag projection matched its reconstructed recorded state, including disabled tracked flag28; authority/provider projections remained exact. Eleven private negative-admission tests passed. No reset, reseed or migration reapplication occurred. This bounded qualification does not invent an unsaved full pre-restart snapshot or replace business-browser testing.

</details>

## Predecessor schema and inherited prerequisites

The qualified isolated rehearsal starts from its schema-only service/F02 predecessor and the following 26 inherited prerequisites in timestamp order. These are inherited source, not 26 additional new F06 changes. An arbitrary live database must not be assumed to match the rehearsal.

Before a later separately authorized release, reconcile target schema, grants, function bodies, actual migration history, application/RPC compatibility and restorable backups. Never blindly reapply inherited migrations or restore a baseline over live/retained data.

All 26 current raw file hashes match the qualified prerequisite inventory. The digest is SHA-256 over the ordered UTF-8 lines `filename + space + sha256 + LF`, including a final LF, without BOM.

Qualified raw prerequisite inventory digest: `962254dd85b53f03a2457a4c1dedacd88e641bc7c3ab53fec2e1e1e81ace3aa4`.

Canonical public-index LF prerequisite inventory digest: `883453ce10b6ad211bb3dc52b383aafef5121478a5203a7eb762377937cc81e3`. All26 actual public-index blobs were independently compared with their raw working inputs: differences are exclusively CRLF-to-LF normalization. The following table retains historical raw qualification identities; the canonical public-index hashes are listed separately below. Neither digest is a Git commit SHA.

| Order | Migration | Raw SHA-256 |
|---:|---|---|
| 01 | `20260923062254_f03_auth_principal_and_lifecycle.sql` | `f3ed42d958aa2c3bfa40f1d463a8981440b3d0bf1561e5a2245f35f172f2c86f` |
| 02 | `20260923062901_f03_password_completion_transaction.sql` | `2ff7fd0ddcfe606725c99e3e369b1cb948d963e805af5a1f3fec1251fc2cdc97` |
| 03 | `20260923063512_f03_security_delivery_and_throttles.sql` | `ebb0f98dd1347f0789f6003137b5259489c6b0ac56cc2e143a2f0b70041c515b` |
| 04 | `20260923064605_f03_role_administration_guards.sql` | `38ac283b997ef222dd981b1c403c548106da544e1c04405648219d4a29e1a0fb` |
| 05 | `20260923070016_f03_role_transactions_and_delegation.sql` | `7dc2461f25aab238eb6bce0e89ab011d3d73c52ed14b397ceaaf51b531fd81ee` |
| 06 | `20260923070453_f03_employee_subject_scopes.sql` | `9602ded4897e8583cff9cb8ce7b7e36b1814a45c16a70c6124efdb8d86c36b0d` |
| 07 | `20260923071412_f03_document_scope_and_content_policy.sql` | `4834e029272279dd51476f615ad229611828815d63acde658602fbe12767791c` |
| 08 | `20260923072530_f03_sensitive_employee_fields.sql` | `f0c5b1095c9b3256f4cd6804dddb56b658ad8fc50563f84237bb3c840ed74ec8` |
| 09 | `20260923073856_f03_identity_transfer_and_issued_file_scope.sql` | `b040703b51b2f7d5b3bbfd82866c0d679bff4b99edff6440b66756966e5c48a0` |
| 10 | `20260923080016_f03_account_provisioning_journal.sql` | `e5efc6e146c048327490f5896969065035aceaf8be8f0b63e7fe9ffb91e39d51` |
| 11 | `20260923081146_f03_permission_review_preconditions.sql` | `5b305ba5ded58d31be102258b04f833bcc4c67317f71546452e77adc82508e98` |
| 12 | `20260923082101_f03_document_content_projection.sql` | `14b8ccdfd5064a8763ae7b02c5cb5d4b3e5888c71290544c38c1c67e4930c429` |
| 13 | `20260923084150_f03_medical_insurance_and_linked_evidence.sql` | `10b8bea889897ad7ecd2f3df0572b86fe1e41223618cf4c4c3c89ff68a7435b2` |
| 14 | `20260923093112_f03_recruitment_subject_scopes.sql` | `74d75ffbf4175df2a5ade13c3f6b3b3d29228f3bd355210628b1e8afcf24fa5d` |
| 15 | `20260923094358_f03_recruitment_salary_projection.sql` | `70cf18fe3765d5558604abb6609bd40c37342acd1dad78b4f9ff9057a6ccde18` |
| 16 | `20260923103234_f03_derived_document_write_guards.sql` | `7eb00abaad2a6a9aa91a7eae1a3e28f9f8fe71b0bbf77a50cf37b49a0f822cf1` |
| 17 | `20260923104636_f03_checked_semantic_search.sql` | `8c7f1c533f3fb6456127f70c870d6b3cfae94af6abd6f0c3da548b54a1dcca13` |
| 18 | `20260923110909_f03_duplicate_lookup_access.sql` | `f2a86cc337bd18d71df6811b6e2792a96fa656a09992e5ec230cd654181b4e0d` |
| 19 | `20260924113604_f03_unlinked_upload_admission.sql` | `8f75850f64590ae781d3df9cf525cdf1fe6c7710f0a473a6abdb5b652cfe4350` |
| 20 | `20260924114601_f03_intake_capability_scope.sql` | `689becea98490fe84f31766ea3c793ab70d5752a08dd38e1821353a84dd7a485` |
| 21 | `20260924120341_f03_employee_scope_set.sql` | `eb9fdae80497c993ec480f4553e023f8a38cb771ba4182bf631791b88bcf22dd` |
| 22 | `20260925082403_f03_branded_24h_invitations.sql` | `1b7e258430c7a536e059cc8f6b57c8f41b7020dd7c6898c79aeb786026931921` |
| 23 | `20260928045514_f04_atomic_workspace_saves.sql` | `0d4f7fd3cfe0b16c2ce380fc02baaf31f6a782dcd56f896fa1795ea243050743` |
| 24 | `20260928094530_f03_dms_projection_single_evaluation.sql` | `87427392b7c37f1d1c69157fa51cab94472cac86d4b6c37df1d5dc6db179dfef` |
| 25 | `20260930164345_f05_dms_workflow_atomic_configuration.sql` | `cc64058f63d9960822a9951e80226ae31133eed210f2c835cc4b3b43684d3d4e` |
| 26 | `20260930175323_f05_dms_atomic_approval_steps.sql` | `b7026b114eb6eedabba3017631e118475220ed8c2dc706b5ca5034fccedd139e` |

### Canonical public-index LF prerequisite identities

Orders correspond exactly to the raw prerequisite table above; filenames and execution order are unchanged. These public byte identities are not additional migrations.

| Order | Canonical public-index LF SHA-256 |
|---:|---|
| 01 | `6a64646b2e972c33fbd4e1c460f7691a2edb4d573bad76a541815c30238762c8` |
| 02 | `fea710ec35b30a4c84c0f6322b26abf1fda9005edf53f6e1eecc57e1b482cd82` |
| 03 | `99296ef5efa3fcb3255e20a06c86ad7030acddb31c3b15c84d526dd15c9c8950` |
| 04 | `cbf989ee7b336c0377670416b775875f18fe7a9c27907e74d0ae13b32deac8f8` |
| 05 | `35e40aecd13cf4d6a72e52af39c72c07b51e1dadb523fc4520e709aeb4d9024b` |
| 06 | `c5d18a32d2e0b91c912ced9a4e311bc2601e4b75296247f35f1de204c1a82618` |
| 07 | `fee6b8bd5f8f9dbb6dfba372d1a39ecd172beebdd86a89d2fa09459f2f839581` |
| 08 | `9d6f451c506ece2c91a1a3c747bda2ec7d05405fdbeb89ca97a68523abaf7e67` |
| 09 | `2176f9dd0c5c58c888cf1a992ddad15498e27b46ffe0a3ef7285f64fab06d93d` |
| 10 | `4c2b35ba13849d778cdffaf9df5e845b69e3645d6e440d6f0d36908865d74978` |
| 11 | `7a4972d398f7035a45df6fd67a457a2277b2dc1f14cc6cb6ec25dcc00cdd4b2a` |
| 12 | `e9c148d098f584baa5b72cd841965c6e1cdcec0b2c0e352367e0b790d43f4cdb` |
| 13 | `594e90e33cf8548fc5dd2da431ad401f17b1478d45a3cc16e516f09529272d7e` |
| 14 | `c43f7dff139892e0cf45834886f46f0d01bc35634c74403782599d2756b5737a` |
| 15 | `8e014baeee89d4da268128482f738897501b5f593914b8061e57237327009606` |
| 16 | `d9f0ee5972f84ff8e863120e3412d22c42e7bce81490f33138238909773953ae` |
| 17 | `45d298984ba7c8c3f9a9c4103a41d9989d4642f91eced3c37542dcc3bb226ded` |
| 18 | `d86920efa291b5201adc1cf8fe98dedd2e58bff095aa4875bdf2afff3655c41c` |
| 19 | `796f7418993640a521b77c2cab0e68573559bf32dddf86552b0412c7fad3f2ff` |
| 20 | `1868cde6f3c4b11a252e4bb509f1f7865a9835355b9ffd5fa1118e4835e99073` |
| 21 | `636fc3fa72c13872e35526121e42526e8f0efded658abab74bed6a379ebe0990` |
| 22 | `3487b52e765cb8beb58633543dbce6f0170dafd13b5d3b767624229541d42c1c` |
| 23 | `589260c613288c4e0185fd59d9f6d3270d4120cd4ec370b281e124ffce2967b4` |
| 24 | `de843079e8c156e9dd9852a4fda5d27c8324a7361dc1e13aa65cc12b26bd59c8` |
| 25 | `d5321dc75d6ee69bebf0637df2154b164668002a4727112e68b2d5f77ec5d10e` |
| 26 | `4c6f73172c003c8f0c17a8ec094372b5d6a068181a4ccefbc6296ad4917a21c0` |

## Exact F06 migration order and source identities

The frozen source inventory below contains **85 F06 migrations**, all qualified on both retained isolated targets: 73 historical original entries plus twelve later forward changes. Entry 85 is the exact receipt-read correction and must follow 84. Earlier 72/73/77/81/83/84 receipts remain historically bounded, not relabelled a full 85 replay. The earlier 1,013-change public assembly contained the 84-migration prefix; the newer 1,017-change assembly has separate recorded portable results but still predates BR85-05. Final public/index/commit identities require the reviewed final refresh. The tables are the ordered dependency contract, not permission to reapply existing migrations.

The historical81 compatibility/replay and ACL qualification remains separately recorded. Migrations82 and83 were forward-applied once per qualified isolated target and verified on both retained targets, preserving original table data/sequences, unrelated catalogue and function ownership/ACL/configuration except the reviewed migration deltas. Migration83's first target committed before a checker wire-type mismatch; the reviewed continuation verified that state and applied only the remaining target. No reapplication/reset was used.

Before generating84, both retained targets received full pre-84 catalogue/table/sequence snapshots bound to the historical83 prefix. The first84 rollback-only rehearsal failed with PostgreSQL42601 in a numeric-bound CASE expression; no APPLY or COMMIT was dispatched, and both targets' exact pre-84 data/catalogue/sequence preservation was reconciled. The reviewed syntax-only amendment parenthesized two CASE operands and added a portable regression; the failed draft was never applied. The corrected R2 rollback rehearsal then passed,84 committed exactly once on each target, and preservation checks passed after excluding only the three reviewed new revision columns. Existing receipts, sequences and unrelated catalogue were preserved; owned command resources/reservations were released. Actual forward-application receipt SHA-256: `996b75d56d84c9d61f282a05e4c018ccd9c5841d7be21b14864b7acbe8b4abd3`, state `PASS_EXACT_FORWARD_84_NOT_F06_ACCEPTANCE`. This is neither native84 functional/concurrency acceptance, production acceptance nor an all84-from-zero replay. Never rerun old83 qualification by deleting84 or changing historical proof pins.

Migration 85's controlled forward run passed rollback rehearsal, exact single-function delta and complete preservation checks on both retained isolated targets: all 343/341 table-row projections, raw sequences and unchanged metadata/ACL were verified; commit operations were known ended, and the exact owned lease was durably archived/released. Receipt SHA-256 `5c08f41ce638dddb869a18294443606ccb3320d497583921067ec07e7866faeb`, state `PASS_EXACT_FORWARD_85_NOT_F06_ACCEPTANCE`, run `415a4b52-f7fa-44ad-9272-f9acda8b95c8`. Fresh current-85 qualification then passed on both targets. Its candidate JSON manifest SHA-256 is `57a50413f3cb265009d2bbe17dedc18e486989ef5db34460a08a4bd845731e85`; prerequisite JSON manifest SHA-256 is `d866624e84bcb633b54de19501ca13e9ea8eb17369ecea354b38e7bf027fca31`. These JSON identities are distinct from the ordered file/hash-list digests below. The forward receipt alone does not establish a full-from-zero replay or native/browser acceptance. Separate R6 native acceptance and later BR85-05 rebuilt-browser/independent-cleanup acceptance are recorded above; final public/image/CI acceptance remains pending.

The frozen 85 source handoff separately records **23/23 focused portable checks across 2 files**, shipping/scoped types and scoped lint passed. These model/source/authoring results are not native behavior or a refreshed full public-suite result, and overlap must not be added into a purported unique total.

Entries 01–83 retain source raw-file and previously verified canonical public-index LF identities. The historical 1,013-path assembly also verified corrected entry 84. Entry 85 is the frozen source identity, absent from that historical assembly. All 85 source migrations have identical raw and normalized-LF identities. Verify the refreshed public-index/document/Git-blob/commit/source manifests before publication; the old assembly is not a final immutable commit. SHA-256 file/list/JSON digests are not Git object or commit identifiers.

Historical F06 ordered83-entry inventory digest using the same filename/space/hash/LF encoding, identical for its raw source and verified public index: `74e40bda7d2841f1753d1353e542df88d36fe5834e4309a44ab58a1a720da566`.

Historical corrected 84-entry prefix inventory digest, identical for raw source, normalized-LF source and the reviewed pre-85 assembly's actual public-index blobs: `ad2d3c3e80d9aafaaad3a63f6e930c6f79ab69a640a12b9b1802dcfcec4bc13b`.

Current frozen 85-entry **source** inventory digest, identical for raw and normalized-LF source: `1340838a23a24462c461201d3a8592a5446b27a14eee60d64476a69340d3b1f1`. Reconfirm all 85 public-index blobs in the final reviewed candidate; the historical 84-entry digest is not that final identity. The ordered encoding remains `filename + space + sha256 + LF`, including a final LF and no BOM.

| Order | Migration | Raw SHA-256 |
|---:|---|---|
| 01 | `20261001133440_f06_shared_master_lifecycle.sql` | `0ee95c11ece2d16779aa36b151af5a77958c2d70d612609a939896c4b7422854` |
| 02 | `20261001140544_f06_master_relationship_validation.sql` | `96ed29739893572e18956151d3c7aa99776aa772c3ebcc9c8030cf3ad5c9136f` |
| 03 | `20261001145424_f06_calendar_atomic_saves.sql` | `3c8ef1bf1363b735ddf4a164734af8cd1cf1ee9341e72a74a890b49aa69f477d` |
| 04 | `20261003041704_f06_numbering_integrity.sql` | `a431049b6daeb4c3e9941f233944e466614f8a0d6f62b78d898a831f1de6d12a` |
| 05 | `20261003043129_f06_numbering_rule_saves.sql` | `5e631e0ed0b910950824fb5a6d83485ae83712712e4931c27680c208de877e35` |
| 06 | `20261003051057_f06_lookup_choice_authority.sql` | `7a16cb41c93d72ecd6ca15523ebb22b9d3fc4a048a115e86167b08f7331c9454` |
| 07 | `20261003053109_f06_provider_atomic_saves.sql` | `e03372b6c17439bcd17331c5d5c2d2c041c73f2f8f17eb2d9966bea40f27c07f` |
| 08 | `20261003054646_f06_provider_health_receipts.sql` | `192e2994ae8f205145353a527a8e9b0e1f666923219664df623fcb62b30f0f6f` |
| 09 | `20261003055556_f06_provider_feature_flags.sql` | `3cb0211f2e7f168aafe128c2b1a7abe6e5ac1de68bc5e3b23c303e0259a4bf50` |
| 10 | `20261003063636_f06_provider_secret_transaction.sql` | `26f85ef8ed94d4001fe12ce5145d64c77a61bbf57cd151ff5aaa1b312ec5c042` |
| 11 | `20261003073819_f06_branding_authority.sql` | `724b6d939ff256d8d022c4b50d25a75818637f16acf4087defaeceaa6846ff93` |
| 12 | `20261003075328_f06_branding_versioned_saves.sql` | `5cd64dfbc58b2e830fb3a0bd28342d0921a32b8d2f10a11907ca5c9269eefbe1` |
| 13 | `20261003082507_f06_branding_asset_lifecycle.sql` | `7ef7cc09800c7624d67242d49fb3fb7974e95759c72ad46fa31c5ed62c560f81` |
| 14 | `20261003090756_f06_company_branding_bootstrap.sql` | `ec8a81edaedc4ba40746d604ed8ff85f5e15537846e65266a5f87782fcb5459e` |
| 15 | `20261003101926_f06_currency_integrity.sql` | `b19233762cb77caa2ad2848e30ea9058f70223af462ceb20f6c2c41b761126e5` |
| 16 | `20261003111253_f06_template_branding_read_boundary.sql` | `8245dff2527b540252b9ecb970f26a3c103892868e4918d8e3c1ea9496ddfc1e` |
| 17 | `20261003112917_f06_template_configuration_saves.sql` | `286ed463c6dd20837b5ac740b92d13d320cbe329fb21a32144c58a011c0cb2e6` |
| 18 | `20261003122900_f06_template_governance_transactions.sql` | `c6f3a43a070a24b9b75a2f7421d19e5d0c806b729e0a47f24dcb29695c06e871` |
| 19 | `20261003133837_f06_party_type_integrity.sql` | `09ffcbb9b257f399cd29db37f2069b75f411d94241850502b2f7befabbf236c3` |
| 20 | `20261003141728_f06_geography_relationship_integrity.sql` | `c92d55627da742827551a4c5b38f41bcbb178a5abdf0bae3c811c78d6d1397cd` |
| 21 | `20261003143716_f06_geography_atomic_saves.sql` | `e7f8ce7ee554f8590b505ae78e3ae6a7b1b384a47bfecc7818cbc10715f0c256` |
| 22 | `20261003153529_f06_finance_hierarchy_integrity.sql` | `1e2bfc0d9bf6456d1c5daf80482e18121ca4a13ec7585738a346f40a4672accb` |
| 23 | `20261003155834_f06_finance_center_atomic_saves.sql` | `691e5ffdedad03c1a0988a5e91f9191b95466bb5e5c856e3c90853426f872441` |
| 24 | `20261003164204_f06_uom_relationship_integrity.sql` | `88a55e8c5458754b0b9b9e77d7ac6133b616c9434df39fd9ffabded9fe4c9179` |
| 25 | `20261003170835_f06_uom_atomic_saves.sql` | `61fb48dc97afd2f3218eb857d40aad828792f709080b4ac160e75bf0408ed2eb` |
| 26 | `20261003180144_f06_uom_conversion_compatibility.sql` | `d8be5c51e1f39f0061370667dedab4d7f87b9c905c5570580e90fbec4b8f0d02` |
| 27 | `20261003184420_f06_master_archive_recovery.sql` | `1c1e9b9edc90f46c32266855f082a5cfb92e5e3c22cb3016e02e8669faeb00dd` |
| 28 | `20261003191553_f06_department_atomic_saves.sql` | `1347499ddbe31951b386c2b9da70d904311296b77f551892de955e2f0958a494` |
| 29 | `20261003194135_f06_department_scope_catalogue.sql` | `b28a2357edc2333f0e61888c02c1e755c007a2cdfe00d9a4c2f34f48c3331f5b` |
| 30 | `20261003200805_f06_hr_lookup_atomic_saves.sql` | `20973c8a5314eb03a42ed5cc5e16cdce5a6895b9e45c8e1d09d57dcfc203de8f` |
| 31 | `20261003205623_f06_hr_specialized_atomic_saves.sql` | `08176e3f9f74cf82f36b9efc85dddc66699b43103ae016a31c0282ace5c14611` |
| 32 | `20261003213546_f06_hr_archive_recovery.sql` | `bb88652d383bf3ede479ce6fbf383ac1f7197afed9e33fc8c9f7761bc270223e` |
| 33 | `20261003232830_f06_calendar_history_protection.sql` | `d5f5619d323605c3bcea8fcf49785672aa8faf58924b4db91a99ba4fcb955eec` |
| 34 | `20261004000041_f06_numbering_failed_consumer_recovery.sql` | `ecbf0ea1328f21dcfca9e911279878fad28acad7715d695515eb6ecf60c736fa` |
| 35 | `20261004002139_f06_finance_center_read_scope.sql` | `ca606ef113728529d8d88019fadd97f298587825e76e92a2d86c933fc119aa58` |
| 36 | `20261004003309_f06_finance_reference_labels.sql` | `1282a8863193b1ac8581309bb860a07acb73e9fe1aa0a01f9998aeecd50b5333` |
| 37 | `20261004005131_f06_numbered_party_consumers.sql` | `a3624cd29928e97f67924640d46f2bf6fe18853425b438e54e1f372972e32687` |
| 38 | `20261004014535_f06_party_relationship_integrity.sql` | `2d8a57524f4c9a191488f12db5800cf6ce0a7823e22fb46b2630f5da82a5f279` |
| 39 | `20261004022939_f06_party_parent_read_relationship.sql` | `6aa5a176407a8576086b4802f3b5cbb808f11245bec0c043e7ad86f28da06081` |
| 40 | `20261004023537_f06_party_reference_labels.sql` | `dcc4310cc74f1ff449a0ce8ff14fb11ba322aae86b70c11cb6faa74db6cc9458` |
| 41 | `20261004032040_f06_party_revision_saves.sql` | `b01d5658b279ebdf246391305103f02811369db369b892128b9cbd99b050d875` |
| 42 | `20261004035929_f06_party_state_transactions.sql` | `d35705a67d63b99f068e1262c377be7c32421528e1f075a830e586a862910da9` |
| 43 | `20261004050931_f06_party_overview_authority.sql` | `9db046e9103ebb969b9a2ff9f56f1d928b7024a93cf4ea1dd32482c8b8bcfb5c` |
| 44 | `20261004052722_f06_party_ai_apply_transaction.sql` | `785d53d1833ddfcb8f71aac344c7290f4772cc3738d65720124b9c8fe70975bf` |
| 45 | `20261004054901_f06_party_creation_boundary.sql` | `06627f956dce3d11ed122d4b091d02c84b57349712ca9071878ae22e213fd29e` |
| 46 | `20261004061721_f06_party_initial_type.sql` | `25a83dc89f04e4dfce87557cafe612d2dd01f981ae7a38baa3d2477232b825fc` |
| 47 | `20261004100043_f06_party_address_atomic_save.sql` | `edc9b723678289bf6bf81c2fea5da994a81465bcc9c90a5f9810896178fb10c0` |
| 48 | `20261004101844_f06_party_child_atomic_saves.sql` | `398c5a2a6033ddc9eb34feb949620ac36c61c53e38a37cf1e29bd86736e7329a` |
| 49 | `20261004103631_f06_party_child_relationship_integrity.sql` | `cc859dc4629305b49e9b015a6474802a912dd93d1a79930467b0cc5a75b642d3` |
| 50 | `20261004105426_f06_party_bank_verification.sql` | `c417593ff8bfb7bdab43f00cd6203282fe2ca24320798a47ca51ed0204ac15e2` |
| 51 | `20261004111818_f06_party_child_lifecycle.sql` | `a35a24d68136e3e4ed5ca3af59ed3825659eaf07a143cb3bb9584cb98009b445` |
| 52 | `20261004123307_f06_party_child_suggestion_transaction.sql` | `b1766ccf76e1f4972c66946955edb77536a328b1c3be6e7642d02ebde6352121` |
| 53 | `20261004125147_f06_party_dms_apply_transaction.sql` | `29cb8ec9c8131d8abcdf541b157d992e4eb7caa855ccadf15fbf527fbf5c7cad` |
| 54 | `20261004134744_f06_party_dms_correction_transaction.sql` | `6daca7b3789e6f8327b4b996682f6938356357e47298b3d45787b83147aed684` |
| 55 | `20261004151625_f06_organization_branch_integrity.sql` | `77baf51de12c98e5458f9ae6f04ede0c2875f820d698299a52829338a98e7e93` |
| 56 | `20261004153827_f06_administration_atomic_saves.sql` | `c0e2f7ff8faa79918951b3c428d583f38f69db8f95d6012c0d8d7c22dcbc1c33` |
| 57 | `20261004154941_f06_company_suggestion_atomic.sql` | `aafb740327478ab85416fddf387cb1c2e28aff1b88da82b111e55cbd05644484` |
| 58 | `20261004161054_f06_administration_write_boundary.sql` | `48eb7c99629320591819ce2dbd5ecf2722313cfca630638451ed52bab5a66bdf` |
| 59 | `20261004162015_f06_branch_company_choices.sql` | `b4317e78a1299e8c43a549e087f7d670fc6ca15187a8e7a86387054302314782` |
| 60 | `20261004162445_f06_branding_lock_authority_recheck.sql` | `40afeeae3c9bf051d97d0ceed0b054d655d637bf1df5078f4b3b48329a517456` |
| 61 | `20261004163146_f06_company_suggestion_lock_authority_recheck.sql` | `07860fa28ec76e06eed345d1743cb83b6d2f2c8b10073e472487af3d26ef4380` |
| 62 | `20261004170344_f06_party_admin_master_atomic.sql` | `821871df43b7c9cc2ea4632613eddb0236afaea0420ea86f7a4ac700762a10ae` |
| 63 | `20261004170921_f06_numbered_dms_metadata_consumer.sql` | `98800fefb766a0e3e81c55ee321266d35bc55184f7838fc0e93fbed0aca3152a` |
| 64 | `20261004172428_f06_party_finance_atomic_save.sql` | `a73da1756460c84e135e18c852d54a78196f3b1129e9afc14f60f114ed785ec1` |
| 65 | `20261004174935_f06_party_service_assignment_atomic.sql` | `e7b93b95fd9990f69ba01e423e455b49392477f17f2769ac7a19e1e8a70cf72e` |
| 66 | `20261004180226_f06_company_signatory_atomic.sql` | `2622145bc696c83da328d57aa5f8f7e966db5e621e448c5ed010301b8456f982` |
| 67 | `20261004181125_f06_numbered_batch_draft_consumer.sql` | `336d620ed4354ee56cac99b3dc49f862201c43239bf6bd41932a52fa26d90c6a` |
| 68 | `20261004182739_f06_numbered_recruitment_consumers.sql` | `2024485ce0cd63ceef1919deb691662057c3f97433c8de016b94f1c1b1d6ac22` |
| 69 | `20261004184451_f06_numbered_upload_document_consumer.sql` | `9ed46caeb1c896004e93e68f5686839d28f0cba89823816ad5a25be2b5b97d37` |
| 70 | `20261004192342_f06_numbered_hr_document_employee_consumer.sql` | `f81d063be875e9982b9fcfee3ff19de5dab81aaeb470bf147fa78b7b6d9847d6` |
| 71 | `20261004193518_f06_numbered_ai_intake_approval.sql` | `af63a8897a38aaf02485f659d29133bdab1f7b53a13e184b2bd087de3ffae31b` |
| 72 | `20261004195946_f06_existing_helper_search_paths.sql` | `7e177e2cfa1d816a6f1041d01de38b2f512f710626403c0c782ac98b4b3cdda8` |
| 73 | `20261004220907_f06_ai_approval_automatic_reminders.sql` | `c5c798e7b3ddcd18eb50dd8adef2d872c6c4eaaa0235bdfee172c44b650bc93f` |
| 74 | `20261005083645_f06_atomic_batch_admission.sql` | `41df2415cb2aedb063d16aed60eeefa335dcaa094fcfc74fa618da4218eee956` |
| 75 | `20261005153627_f06_durable_batch_draft_recovery.sql` | `f93a7204ff727eb20a0de13ed7c91a158cdde1bf88b77043210f882668cb9e7e` |
| 76 | `20261013064202_f06_finance_wait_authority.sql` | `35b91543de275eb62b7e3c3c43a0422bec84b836d124ee50876296deb301947a` |
| 77 | `20261013064225_f06_provider_wait_authority.sql` | `c86edd08fa71f63ef06dd4021e1f547d4cfbb565c4c97723e112dadd1c7c7a97` |
| 78 | `20261014035305_f06_batch_graph_record_dispatch.sql` | `4492d4884b086b903bb6f3bb5e7269057aadadf33dea859a057b1841b6b81da7` |
| 79 | `20261014040817_f06_legacy_batch_source_dispatch.sql` | `12774d9e04986d90409ca0d445b22d550e0f0a8ed8a9941a986d61519b72e91e` |
| 80 | `20261014041444_f06_batch_authority_record_binding.sql` | `9bc9bde27a8537900518bb84ba46e15ca4c252e14ec36640775c65b0cc99d051` |
| 81 | `20261014042017_f06_batch_context_active_status.sql` | `260ae6a5c6ed545ea2020f8c752233e9bcc9dc8c51e0b6a13979ac1f5ff44617` |
| 82 | `20261014082836_f06_batch_recovery_parameterized_seals.sql` | `b05978d09a3478839c9f0ade897d1ec7f7ead9563867d566aed329092772ad63` |
| 83 | `20261015122044_f06_lookup_atomic_contract.sql` | `aa75b3c06dd680a0e0325729a5bec37c16fb37524404dbdaa758d73e8b20f87a` |
| 84 | `20261015180904_f06_finance_reference_atomic_contract.sql` | `a56d60469ceb6da3e8c3a56a62baeb034c20344c570afb1c6c4c0314c371b025` |
| 85 | `20261015203354_f06_finance_receipt_read_privilege.sql` | `f804f23c52992d6fd12d4cf9fdc564939b1d27702413fca6d7969cc9b59312f9` |

## Application/schema coordination

Matching application wrappers, prepared payloads, function signatures, receipt versions and permission checks must be released together under a later coordinated plan. The sequence above is dependency-sensitive; do not reorder files solely by module or apply a suffix to an unqualified predecessor.

- Master-data/calendar/finance/geography/UOM/party/admin changes add governed relationship/lifecycle/revision receipts and authority boundaries.
- Numbering changes bind atomic allocation/consumption and recovery to the original operation/payload/principal. Never reset or reuse issued numbers.
- Provider changes preserve typed configuration/default/secret/flag transactions and post-lock authority; real delivery/F09 activation is separate.
- **Provider-health compatibility is inseparable:** ship `src/server/provider-health.ts` with migration 77's service-role-only `record_provider_health(text,bigint,bigint,bigint,uuid,boolean,integer)`. The wrapper supplies the actor's current session as the fifth argument; the obsolete six-argument RPC is removed. Do not expose the seven-argument RPC to `anon`/`authenticated`, deploy one side with the old counterpart, cache post-wait authority, or introduce a general privileged fallback. The controlled server wrapper and database rechecks are the reviewed boundary.
- Branding/profile/asset changes preserve issuing-company/signing authority, governed version state and issued-document history.
- Batch admission/recovery changes preserve source eligibility, original manifest membership, durable per-member preparation, hidden-present discrimination and after-wait authority. Migration82 is a narrow ordinary-RLS point-lookup correction, not a new authorization bypass or index/performance framework.
- Migration83 coordinates lookup category/value wrappers and database atomic operations, immutable identity, omitted-field preservation, deterministic relationship/default locks, separate manage/lock authority, revision checks and original-operation receipt recovery. Read outcomes remain truthful and do not convert permission/database failures into empty or missing records. Release these matching application/schema contracts together.
- Migration84 coordinates bank/payment-term/tax-type wrappers, all fifteen mutation exports and their forms/tables/routes with one atomic save contract: original actor/entity/operation/wire-payload receipts, strict numeric types/ranges/precision, immutable identity, false/zero and omitted hidden-field preservation, current global manage/separate lock authority and post-wait rechecks. It preserves existing receipt families, relationship/history protections and reviewed ordinary read policies while closing table/column direct writes. Retirement replaces hard deletion. Exact global-system-administrator checks in owned finance surfaces require an actual unscoped system-admin assignment, not combined scoped/global role inference; shared scope/F05/PERF systems are unchanged. Existing F04/F06 retained-original-request recovery is reused, not replaced with a new framework.
- Migration 85 is a guarded one-clause function-body correction: remove only the receipt read's unnecessary `FOR SHARE`. Accepted baseline body/metadata, exact occurrence and complete postimage checks preserve function identity, owner, ACL and every other lock/rule. No privilege, policy, data or sequence expansion is introduced. Its two-target forward qualification and the separate 108-case native R6 pass are accepted within their finite scope; neither is production acceptance.
- The narrow PDF correction normalizes parser input bytes while preserving the existing parser/application interface, input backing store and text-first behavior. It does not redesign reporting or shared read/loading/cache systems.

Earlier application rollback may be incompatible with these forward schema changes. A later recovery plan must preserve committed saves, numbering requests/allocations/consumption/voids, preparation seals, admitted manifests, audits, branding versions and immutable issued outputs. Do not delete history or replay a save with a new operation ID to obtain a superficially clean state.

## F05 and PERF-P04 integration contract

The finite historical committed PERF-P04 donor is `f243e2cacad02e8a9afd58c061365573cce74bb1`. It is provenance for bounded comparison, not an assertion of the current remote PERF head or permission to import another chat's dirty tree. Historical overlap inventory (68 paths, eight LF-equivalent and 60 differing) is a review surface, not 60 proven defects.

The recorded 408-case performance pass does not certify an unassembled combined release. F06 and PERF candidates must be composed and tested at exact immutable identities before combined acceptance. BR85-05 changes only lookup-local feedback; it does not authorize taking over PERF-P04, importing its whole branch or changing shared read/cache ownership.

A finite source-contract review found no new F06-owned defect in the compared C0/L0/L1/HDF surfaces. Retain the current adopted read-attempt/current-principal seed and cache-retirement guards, governed lookup choices, explicit authorized branch options, complete scoped labels/options and F06 domain mutations. This is source review, reinforced by the separate current-source 408/17 controlled-contract pass, not an actual composed P04 release test. The inspected newer committed donor `f243e2cacad02e8a9afd58c061365573cce74bb1` contains raw lookup reads and older direct finance/HR writes or numbered callers that would discard current governed authority, revision, hidden-field and original-operation recovery contracts under whole-file replacement. Those incompatible hunks were **not imported**. A newer donor is not permission to restore direct-write grants, broaden raw reads or replace retained mutation sessions. Actual composed F06/P04 release remains **untested/unaccepted**; preserve F05/PERF ownership and review compatible selected hunks only in a separately owned integration checkout.

1. Retain one shared authorized read-attempt/session/private-cache implementation. Cached choices are not write authority; principal/scope/session invalidation and private-cache retirement stay intact.
2. Department readers preserve workspace revision, exact company/branch labels and complete scoped count/error semantics. F06 validation, mutation/recovery receipts, history/lifecycle protections and confirmed invalidation must survive reader adoption.
3. HR settings preserve all supported management/rule forms, full revision/options DTOs and wrapper arguments. Global-only management must remain distinct from scoped reads; older read-only/incomplete shells cannot replace these contracts.
4. Numbered recruitment, conversion, upload/inbox, AI approval and document-to-employee consumers retain original operation/payload and prepared source identity after response loss. Do not overwrite them with an older whole-file upload implementation that discards retained save sessions.
5. Preserve DMS source/destination/confidentiality authority, original-principal/current-authority recovery, exact confirmed receipts and current-owner invalidation. Read-adapter integration does not authorize older direct-write behavior.
6. Preserve F04 per-opening/account/tab/draft ownership, nested child boundaries, linked validation/focus, exact uncertain retry and post-commit receipt semantics; preserve adopted F05 Fluent/Dynamics presentation.
7. Review compatible overlapping hunks only in an explicitly owned integration checkout and rerun relevant shared tests/real browser journeys on that exact composition. Do not edit the parallel chat's checkout, database, ports or ledgers.

The PDF fix is a narrow extraction-domain correction. No independent common loading, caching, pagination or performance instrumentation system is introduced by it.

## Dependency artifact and security gate

Pinned Node22.23.2/npm10.9.8, exact local artifact and committed lock are required.

| Input | SHA-256 |
|---|---|
| `package-lock.json` — qualified raw Windows working input | `4e6594e73eeb43dd22d1376397bc564d731d51fdc695fd684438560571bea6f5` |
| `package-lock.json` — canonical public-index LF bytes | `8183029535ea12529e3a78264623980d9d5900bf0c2b11195a7574ef602bb64f` |
| `vendor/braces-3.0.3-algt-depth-1.tgz` | `1d495e2aa88c0aa95579657195da65eb5be1467f65eb2da5f549a05416430033` |
| `vendor/braces/PROVENANCE.json` | `d421092e603eba28cec24ed3848b9f0a1bc787f5e49dc3b2e0b5d9d3d0d1ca39` |
| `tooling/security/dependency-gate.cjs` | `0990811db241c372d72ac9694ae092e8da21288e263c1f19f87307fcbf6451b2` |

The reviewed local braces3.0.3 mitigation preserves the MIT package identity and upstream advisory `GHSA-vfj7-8cjw-p6xm`. Recorded complete raw audit: **8 high derivative entries, 3 moderate, 0 critical, raw exit1**. It is not an upstream fixed version, zero-finding audit or blanket waiver.

Only the exact hash-verified mitigation and exclusively attributable advisory chains receive narrow treatment after fresh installed66-case proof; gate-policy37-case coverage remains required. Other or changed high/critical findings, extra copies, source/artifact drift, malformed/registry-error output and incomplete proof fail.

Actual dependency-gate verification now passed in the existing pre-85 public assembly using the existing Windows system CA and intact TLS verification, with fresh 66-case installed-mitigation proof. Its raw audit still exposes 8 high derivative entries, 3 moderate and 0 critical, raw exit 1. This is the exact reviewed local-remediation outcome, not an upstream fix, general waiver or zero-vulnerability audit. The 70-case pure policy/controller packet likewise does not run the production image. Refreshed-candidate and exact-head installed/image gates remain separately mandatory.

The earlier Linux audit error was causally traced to registry DNS resolution (`EAI_AGAIN`). A scoped strict-TLS retry obtained the actual graph and fresh installed proof; no daemon DNS, audit policy or certificate verification was weakened. A later Windows certificate-chain transport failure is also retained separately; strict-TLS verification using the existing system trust store passed, without changing trust stores or bypassing TLS. Neither result replaces actual fresh exact-head image/native/boot execution. Never bypass TLS, omit dev/optional/peer dependencies, disable audit or relax policy to close a gate.

Readable source/license/provenance, oracle/generator, tests and exact package tar must remain together. Docker must receive the exact artifact before locked installation. No additional permanent CA trust, host certificate/key, credentials or private evidence belongs in the image/source.

## Public source/fixture and privacy boundaries

The README identifies six inert native-looking source fixtures and three deliberately unpublished private-dependent roots. Preserve their exact reviewed source dependencies; do not run all local lab drivers recursively, publish protected inputs or conceal tests to make CI pass.

Include both portable PDF files: `tests/remediation/f06/pdf-byte-interop.test.ts` and `pdf-byte-interop.cjs`. The wrapper runs three real synthetic-byte Node cases, not mocked application extraction. Required installed dependencies are already locked.

Finalize the explicit path/hash allowlist, build a clean candidate from inheritedHEAD plus those exact bytes, then validate its actual complete tracked/indexed tree. Review source and archive contents, proposed index/staged changes, outgoing history and privacy/assets—not only recognizable secret patterns. Record normalized Git blob and exact commit identities. Keep actual private audit/resource records, credentials, business data, private assets, runtime/helper state and generated metadata out of public publication.

## Current remaining candidate gates

1. Preserve the passed BR85-05 browser acceptance on its exact-source build: remounted guidance, original-operation replay without another write, acknowledged identity and subsequent fresh edits. Retain other finance/lookup scenarios at their measured source boundaries. A failed RSC request followed by successful full-document reload is fallback recovery, not proof of stale-snapshot retention after total reload failure. Do not reopen already accepted journeys solely because their historical checkpoints were pending.
2. Preserve the independently passed final-window terminal cleanup, controlled app stop and archived reservation release. Do not repeat closed one-shot cleanup or invent original preimages. The historical local `bad_jwt` observation is not a proven production defect or passed Auth test. Native R6 remains accepted for unchanged backend contracts.
3. Freeze and refresh final migration-85/UI/test/document public bytes; verify complete source/index/history/privacy and run all applicable public F06/application/inherited/PERF/type/lint checks. Neither the newer pre-BR85-05 **9,210-case /1,017-change** result nor the older **9,110-case /1,013-change** result substitutes for final-byte checks. Preserve private-dependent verification separately.
4. Accept the fresh exact-head strict-TLS installed-security and immutable Linux image/native11/provenance/trust/non-root boot gate, including owned cleanup. Preserve raw advisories and the verified narrow mitigation. Windows builds or pure controller tests are not current-image proof.
5. Check publication-trigger safety, publish only the reviewed F06 branch, create/attach its PR and obtain actual exact-commit checks. Record final candidate SHA, PR URL, check references, migration/recovery/compatibility and remaining qualifications. Lack of main protection is not a waiver; no merge or deployment follows.

No additional T02–T05 module implementation is established by stale historical OPEN paragraphs: accepted calendar/provider/branding and named numbering/consumer evidence remains valid within its unchanged source/scenario bounds. The inherited cancelled-upload automatic-cleanup defect remains disclosed for F07, not silently fixed or used to start another phase. Actual composed F06/PERF-P04 acceptance, real business signer assignments and physical-device/native assistive measurements remain explicitly unperformed where not evidenced.

F09 remains inactive. F06 provider configuration does not activate live workers/schedules, invent budgets, rotate credentials or send real email. Candidate implementation/publication closure does not equal production closure.

**Do not merge main, deploy, mutate production, send real email, activate F09 or begin another phase under this handoff.**
