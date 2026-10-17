# Active schema candidate: exact 130-step dependency plan

Status: source implementation only; native acceptance and release remain open.

Use `DEPENDENCY_MANIFEST_V3_20261016.json` for the current candidate. The original 128-step manifest and the accepted 129-step lineage manifest are retained unchanged as historical source identities, not alternative current release plans. The source builder is `tooling/integration/f00-f06/schema/branding-acl-manifest.cjs`.

The new CLI-created `20261016121837_integration_raw_branding_acl_boundary.sql` is the sole additional migration, immediately before the unchanged template-selection composition. Existing original donors and the accepted document-lineage bridge are unchanged. A current timestamp is intentionally not backdated; normal timestamp-sorted CLI replay remains unsupported.

## Distinguish the two findings

The immutable F02 baseline archive grants anonymous and authenticated roles CRUD plus PostgreSQL 17 MAINTAIN on raw branding. F06 revoked CRUD but left MAINTAIN. This is the legitimate narrow source defect addressed here.

The failed integration restore additionally inherited TRUNCATE, REFERENCES and TRIGGER while creating objects as `supabase_admin`. Those extra grants are a laboratory restoration artifact, not evidence of production exposure. This migration rejects that state rather than concealing it. The failed database and receipts must remain quarantined and must not serve as acceptance evidence.

## Boundaries and evidence

- Admit only the exact reviewed PostgreSQL 17 `m`-only browser ACL preimage; reject reapplication, CRUD/Dxt, PUBLIC, column grants, grant options and owner/service drift.
- Remove browser/PUBLIC raw-table privileges with `RESTRICT`; preserve owner and service-role grants, all column/RLS/view/function/role/default-privilege metadata, and business data.
- Check catalog ACL inheritance and effective MAINTAIN, including implicit `pg_maintain` membership, only after the strict PostgreSQL 17 admission guard. Older or future major versions require a separate review and fail closed.
- Retain original template-selection and lineage catalog assertions. Additionally run `branding-acl-catalog-acceptance.sql` against final130.
- Require an independently verified faithful baseline, positive rollback, rejection/rollback witnesses, actual130 replay, authority/application acceptance and independent review. Offline source tests do not prove database behavior.
- Null donors remain explicit: original template composition keeps its established immutable donor; accepted lineage bridge keeps its reviewed donor; the new ACL migration must be bound to its newly reviewed immutable commit. A mutable checkout or filename is never a substitute.

No deployment, production mutation, main merge, provider/worker activation or F07 is authorized by this record.

## Focused source verification

`tests/integration/f00-f06/schema/branding-acl.test.cjs`: 14 offline tests passed. The first run had two source-test false positives (a comment mentioning CASCADE and a quoted privilege name); statement checks were corrected and all assertions rerun. Fifteen fixed native rejection/rollback builders are provided in `branding-acl-witnesses.cjs`; they have not been executed by the author. The coordinator must record their actual outcomes, independent before/after snapshots and exact SQL identity. Synthetic compensation of a quarantined restore, if used for rollback-only guard checks, is not faithful-baseline or final replay acceptance.
