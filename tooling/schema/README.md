# Schema baseline and release boundary

The historical `supabase/migrations` directory is evidence, **not a pending deployment queue**. It contains renamed and divergent scripts. Do not run an unrestricted `db push`, `db reset`, migration squash or migration-history repair against the linked production project.

F02 established a schema-only baseline after comparing the current production catalog with the isolated local schema and restoring that schema into a fresh empty database. The private restore artifact and reconciliation register are retained with the F02 audit evidence. No production records are in that artifact. Platform-managed Auth/Storage services still require Supabase provisioning; an application schema archive is not a complete disaster-recovery backup.

`baseline-manifest.json` contains only fingerprints and applied version identifiers. It is not SQL and cannot deploy anything. `release-guard.cjs` compares a **fresh** read-only migration-history index and canonical catalog with the reviewed boundary. It fails on drift and approves zero pending migrations. This protects this release procedure, not arbitrary manual CLI commands.

For the next schema-changing phase:

1. Capture fresh read-only history and catalog using the same normalization as F02 (statement-array SHA-256; canonical JSON keys; logical live-column order excluding dropped-column holes).
2. Run `node tooling/schema/release-guard.cjs <history-index.json> <catalog.json>`.
3. Write a new additive migration with a new version; never edit an applied body. Enumerate exact migration paths and hashes in the phase release manifest. Old local-only files are not candidates.
4. Restore the baseline in an isolated Supabase environment, apply only the new manifest, and run positive/negative permissions and application regressions. Verify empty/synthetic fixture ownership and outbound-delivery isolation.
5. Compare before/after catalog, risk, compatibility and rollback. Obtain the required production window/authorization. Only then use the controlled release operator for those exact files.
6. Verify applied history and catalog afterward, retain the old baseline, and establish a separately reviewed successor manifest.

Supabase `supabase_migrations.schema_migrations` tracks applied database SQL. DMS `dms_metadata_definitions` and `dms_document_metadata_values` describe document fields and their values. `dms_ai_erp_apply_runs`, `dms_ai_erp_apply_items` and `dms_ai_erp_apply_correction_proposals` record applying reviewed DMS data to ERP records. These have different consumers and meanings. They are not interchangeable deployment ledgers and must not be merged, marked applied, renamed or dropped to make counts match.

Historical scripts not reproduced from their exact original state are explicitly **not certified for independent replay**. The verified current schema, not a reconstruction of every historical data transformation, is the chosen forward-release baseline.
