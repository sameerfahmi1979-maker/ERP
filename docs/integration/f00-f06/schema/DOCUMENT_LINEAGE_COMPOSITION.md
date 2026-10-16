# Document lineage composition — 16 October 2026

Status: source implemented; **native replay, authority parity and application acceptance pending**. Not production deployment authority.

## Why a bridge is required

Native replay of the immutable reviewed donors stopped before original migration111 changed anything. Two document function bodies differed and three helpers were absent. The exact expected bodies existed only in uncommitted historical PERF development files. Those older files cannot simply be added by timestamp: original103/104 explicitly require the other lineage.

The new CLI-generated `20261016111938_integration_perf_document_lineage.sql` reconciles the proven post110 catalog. It replaces two functions and creates four private helpers only. It preserves existing HR/recruitment evidence wrappers, tables, RLS policies, relation/column grants and F03 session/scope protections. Seventeen exact native-observed function body/metadata/ACL preimages, private-schema creation authority, missing helper identities, required non-null subject columns and four complete policy sets are guarded. The unchanged transitive `requisition_permission` is independently pinned by original108; no bridge replacement is made to it. Final authority parity must cover its null/deleted-requisition cases.

Owner-only subject helpers deliberately omit the duplicate live-principal check; they cannot be executed by authenticated/anonymous/service roles and are called only inside the protected reader's active-principal branch. Existing externally callable evidence wrappers retain their own original live-principal checks. No new public RPC or raw-document fallback is added.

## Exact dependency order

Use [DEPENDENCY_MANIFEST_20261016.json](DEPENDENCY_MANIFEST_20261016.json), version2, **129 exact sources**. The original [128-row manifest](MIGRATION_MANIFEST_20261016.json) remains byte-identical historical evidence.

1. Original migrations1–110, unchanged.
2. New current-timestamp document-lineage bridge.
3. Original120: `20261014065706_perf_item4_statement_permission_reads.sql`.
4. Original121: `20261014072522_perf_dms_notification_subject_sets.sql`.
5. Original111 onward, omitting only relocated120/121; all other relative order, especially F06, stays unchanged.

Original120 produces the notification policy preimage required by121. Both121 and111 require reader body `0740033a5d712f7e883dbff80680e2cb`. Original111 then transforms that body to `0c4be0e6b69b7fa8bb2ba0c446d3aae5`, required by113. Consequently121 must precede111. No original guard, checksum, timestamp or filename is edited. The complete suffix was inspected: other F06 batch/finance changes, report/email/notification projection creation, and later risk/audit policy changes do not supply these lineage prerequisites. Their own native guards still must pass.

**Standard timestamp-sorted CLI push/up is unsupported for this composition.** Deployment would require a separately reviewed dependency-aware execution/history contract and separate release authorization. This source packet must not fabricate applied rows or overwrite failed receipts.

## Reviewed historical body provenance

Historical names refer to read-only inspected development sources; they are not imported wholesale.

| Adopted function body | Historical source | Body MD5 |
|---|---|---|
| `document_permission` | `20261003084455_perf_linked_employee_gate.sql` | `1c6c7a6c40749c9bea0e28cc99e03595` |
| `perf_hr_document_subjects_allowed` | `20261001222443_perf_document_subject_reads.sql` | `6d025f4b9359e7685d1085f2179b40b0` |
| `perf_recruitment_document_subjects_allowed` | same subject source | `68539a4aa725e86fa64e50e60b114f90` |
| `read_documents_filtered_v2` | linked-employee source above | `0740033a5d712f7e883dbff80680e2cb` |
| `read_documents_filtered` | `20261001213535_perf_expiry_document_reads.sql` | `c95a1a5ba0facbcb902b429be8a29a12` |
| `read_documents` | `20261001202515_perf_filtered_document_reads.sql` | `6bc7814a408d77990df6e20bb2c58033` |

All selected raw bodies equal their LF hashes. Original donor files must be read from Git blobs: Windows working-tree CRLF conversion changes a literal inside111 and would falsely produce a different postimage. Source tests now demonstrate the exact immutable111 transformation and expected113 hash.

## Acceptance and receipt contract

- Offline schema suite: **99 passed, 0 failed** at the full packet checkpoint, including12 lineage/order/witness cases and27 reconciled-receipt cases. After final safety-field/path alignment, the affected lineage/reconciliation suites passed **40/40**, including one new safety-field case. Initial test-development failures were a checkout CRLF mismatch and an extra trailing newline; corrected before the passing runs. These are not native SQL results.
- `document-lineage-witnesses.cjs` supplies13 fixed rollback-only negative builders: replay, wrong owner, schema creation grant, partial helper, body drift, helper owner, execute grant/grant option, search path, security mode, nullable subject, disabled RLS and extra permissive policy. The coordinator must compare full before/after catalog and data hashes for every case; unrelated SQL errors cannot count as guard passes.
- Coordinator-owned independent native parity must compare pre-bridge/post-bridge/post111 point decisions and every protected field, not counts alone: no-role, global, company/branch, self/direct manager, combined disjoint grants, revoked/inactive sessions/roles/permissions; missing/deleted/moved subjects and linked recruitment/HR/medical/dependent evidence; null/empty filters, status intersections, superseded/future states and results beyond1000.
- Execute both final catalog assertions, original template selection SQL and `document-lineage-catalog-acceptance.sql`, on the complete exact candidate. Run original guard rejections and real application/browser acceptance separately.
- Preserve original failed `schema-receipt.json` and failed continuation. New full-stack receipt is **`schema-reconciled-receipt.json`**, receiptVersion2, exact129 applied rows, both composition Git identities, preserved103+7 recovery provenance, independent fresh129 replay receipt and complete catalog equality.
- `assertReconciledSchemaReceipt` requires independently loaded raw failed/fresh/comparison receipt bytes **and both complete catalog objects**. Fresh state is `PASS_FRESH_FULL_SCHEMA_REPLAY_NOT_APP_ACCEPTANCE`; source/digest/commit/order and actual catalog objects must agree. A matching status or claimed hash alone does not pass. `guardedLab()` now requires this new receipt before admitting native application tests. The old128 validator remains only for historical contract regression tests.
- The independent fresh replay must use new resources. No relabelling the failed target, automatic retry, production writes, provider/worker activation, F07 or deployment is authorized here.

## Coordinator commands

Offline only:

```powershell
node --test tests/integration/f00-f06/schema/document-lineage.test.cjs tests/integration/f00-f06/schema/reconciled-receipt.test.cjs
```

The migration, manifest and prepared witness generators must be imported from reviewed immutable commits. Resolve the old selector's null manifest commit to its accepted `fe3d748...` source and the new bridge's null commit to this packet's reviewed commit independently; never substitute one for both. Reconciled/fresh applied rows must record those actual identities.

Native execution belongs to the coordinator's verified isolated resource adapters; this packet creates no database connection or automatic executor.
