# P03: Employees, Departments and Documents pilots

## Scope

This candidate builds on P02's private read transport, query lifecycle and account-owned cache. It changes these three lists only; it is not app-wide adoption, a redesign, or a production release. Mutations, draft ownership, conflicts, permissions and F06/F09 work remain with their owners.

- Employees: matching server seed reuse, full-result server sort/filter/count/page, independent lean choices, scoped inactive selected labels, targeted refresh and existing workspace criteria.
- Departments: reuse current request authorization, explicit list projection, complete count-checked reads in 500-row batches. Client-side pagination is limited to a maximum 1,000-row configuration set, not growing business records. Above that bound the page fails explicitly; it never truncates. A larger installation requires server pagination. Existing record prefetch remains unchanged pending browser measurement.
- Documents: default 25-row protected page, maximum 100, stable ID tie-break, exact total, server-side search/filter/order, targeted refresh. Existing full-result compatibility callers read 100-row batches, reject changed counts/duplicates and fail explicitly over 10,000 rows; they never return a successful partial export. Large background exports remain a separate delivery concern.
- Choice sets have explicit 5,000-row safety limits; category/type filters include historical inactive values. Failed choices are not successful empty lists.

## Database dependencies

Apply the two reviewed P03 migrations in timestamp order before selecting this application build:

1. `20261006123609_perf_p03_document_tag_count.sql` adds invoker-only computed predicates and protected content-search RPC. Caller RLS remains in force; content/file URLs are not returned by the predicates. The search RPC selects through F03's protected document reader.
2. `20261006125436_perf_p03_protected_document_statement_scope.sql` resolves statement-local scopes and shared candidate-requisition decisions once. It retains live principal checks, company/branch assignment tuples, confidentiality, linked HR/recruitment/medical/dependent gates and all content masks. It does not change policies or grants on existing security functions. Exact F03 preimage checks deliberately reject later divergent security work.

No persistent authorization cache or caller-supplied principal is introduced. Existing security wrappers and mutation policies are untouched. Do not remove the preimage guards to force deployment. Reconcile F06 or other security changes explicitly first.

## Verification commands

```text
node node_modules/vitest/vitest.mjs run --config tests/performance/p03.config.mts
node node_modules/typescript/bin/tsc --project tests/performance/p03.tsconfig.json --noEmit
npm run test:remediation
npm run typecheck
npm run lint
npm run build
npm run security:secrets
npm run security:vendor
```

The `p03.local` suite is opt-in and rejects missing/freshness/target admission. It requires the owner's separately registered, loopback-only synthetic lab. It must never receive production credentials. Native measurements are backend service measurements, not browser timings. Ordinary CI runs only offline tests, not the private lab.

## Integration/release hold

Browser measurements and interaction acceptance are owner-deferred, not passed. The existing scoped common-master positive-access mismatch belongs to F06 and is not repaired by widening permissions here. Validate both pilots and dependent choices against the selected F06 integration before release. No production performance guarantee follows from a synthetic workload.

Before any future release: reconcile the parent PR chain, run migration preflight/replay and security tests against the exact release schema, confirm F06 compatibility, compare query counts/bytes/timings, verify permitted full-result consumers, and run the deferred browser journeys. Publication of this branch is not authorization to merge or deploy it.

For rollback, first select the preceding compatible application build. Additive invoker helpers may remain unused. Restore the protected reader only from the reviewed release preimage with its exact owner/grants; do not reset a database or disable RLS. Restoring the old reader may restore its performance defect, so retest and prefer a reviewed forward correction. Private lab runners preserve and verify the exact pre-test function definitions/owners/ACLs and roll back registered synthetic fixture changes.
