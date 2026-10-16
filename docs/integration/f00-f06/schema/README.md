# F06 / PERF-P04 template selection composition

Status: **SOURCE IMPLEMENTED; NATIVE/APP ACCEPTANCE PENDING.** This is not a release or deployment instruction.

## Source boundary

The reviewed F06 donor is `cd23c1c73e0ca847a92d337e91bb1de131e17839`. The reviewed PERF/F04/F05 donor is `581cf501890bb9a8b3116d4e5858d5efa58bf163`. Their shared prerequisites are byte-identical in Git. The generated [manifest](MIGRATION_MANIFEST_20261016.json) records 26 inherited prerequisites, 85 F06 migrations, 16 PERF migrations and one new composition migration, in chronological order. It is a **source manifest, not applied-history or native evidence**. F06/PERF timestamps interleave. Never apply one branch wholesale then the other or blindly replay already-applied prerequisites.

The new migration was created by Supabase CLI2.101.0 `migration new`, after CLI help discovery. Its timestamp is CLI-produced. It creates `public.perf_report_template_selection`, the missing metadata contract already consumed by the Report Center and Employee Letters. The old intentionally inert proposal remains unchanged and must not be executed as a migration.

The outer selector is a security-invoker/security-barrier view. It uses caller template RLS and the final reviewed F06 authority helper. Its inner safe branding view deliberately remains the existing owner/barrier projection: authenticated users have no raw branding-table read. No service-role fallback, source grant, policy change, helper replacement, provider call or issuance path is added.

Preconditions reject a changed helper body/owner/configuration/privilege, altered permissive template policy, changed safe branding definition, widened raw/table grants, missing RLS, wrong migration owner, old PostgreSQL or an existing selector. PostgreSQL normalizes a temporary expected view to compare the complete final F06 safe projection; the temporary witness is dropped. All permanent changes are atomic. Replay fails instead of hiding history divergence.

The selector omits body/layout/signature/stamp and private profile data. Authorized inactive metadata remains discoverable for a retained selection, but `selectable=false`; published/approved governance is additionally required by the existing `issuableOnly` reader. Null-company choices still require global authority. Passing a company filter cannot expand access.

## Verification commands

Offline source/manifest checks:

```powershell
node --test tests/integration/f00-f06/schema/migration-contract.test.cjs
```

After coordinator review and isolated schema application, run `catalog-acceptance.sql` with PostgreSQL stop-on-error, then:

```powershell
$env:ALGT_TEMPLATE_NATIVE_FIXTURE = '<private coordinator-owned fixture file>'
node --test --test-concurrency=1 tests/integration/f00-f06/schema/template-selection.native.test.cjs
```

The native suite is read-only. It refuses absent fixtures, any target except the specifically reserved integration lab, missing five-actor sessions, untracked identifiers or a scoped volume of1000 or fewer. It uses actual PostgREST **and the built application's actual HTTP route**, not mocked data. Report Center and Employee Letters criteria are independently exercised; this is **not a browser/rendered-UI journey** and cannot replace their separate browser acceptance.

Keep credentials in private evidence outside every publication checkout. Never commit the fixture. The fixture contract is documented in `tooling/integration/f00-f06/schema/native-fixture.cjs`: version1; lab project `algt-integration-20261016`; API port16921; application port16941; worker/provider flags false; synthetic prefix; public API key; five actors with their own bearer and application cookie; exact ordered expected selectable/issuable IDs; tracked scenario IDs. The loader expects `workersDisabled=true` and `providersDisabled=true` (the runner does not toggle them). Auth tokens must be actual isolated sessions, not fabricated production identities.

## Required native gate checklist

1. Pin the separate schema-only F02 predecessor and reconcile target history/catalog. Apply exact chronological source bytes without editing existing guards. Review and record the combined schema/application source identity.
2. Accept this migration's successful application and read-only catalog assertions. In an isolated rollback window, test replay, wrong-owner, missing/widened-safe-view, altered helper, widened raw grant, disabled RLS and extra permissive-policy rejection. Compare original catalogs/data after each. Do not manufacture production mutation authority.
3. Seed only tracked synthetic actors and records in the coordinator's new lab: global, company-scoped, branch-only, combined unrelated scopes and no-role. Provide over1100 approved active company-scoped templates plus one each inactive template, inactive branding, deleted template/branding, draft, foreign-company, global-branding and unbranded template. Exact IDs and actor expectations are private. No official document is issued.
4. Run the native suite: populated exact counts/pages/tail, point selection outside current page, exhausted page recovery, historical retention without issuance, draft eligibility, foreign/global/null-company denial, branch/combined-role isolation, anonymous denial, raw-branding denial and minimal DTOs. Verify both consumer criteria separately.
5. Test live permission/status changes and session invalidation in the isolated coordinator fixture; rerun metadata reads and actual Report Center/Employee Letters callback-retirement/browser tests. These mutation-controlled journeys are **not covered by the read-only native runner**. Do not mark them passed merely because source/component tests pass.
6. Final combined types/lint/build/security/regression checks and exact-head CI, plus independent fixture/session/resource cleanup. Keep old failures and bounded evidence separate. No merge or deployment is authorized by these scripts.

## Current execution evidence

- Four offline contract/manifest tests passed in the isolated schema worktree. The first generator attempt had a repository-root path error, corrected before the successful run; no database access occurred.
- Native SQL, HTTP, browser and migration rejection/replay tests: **NOT RUN** at this source checkpoint. Update with immutable candidate identity and actual receipts after execution; never use this checklist as an acceptance receipt.

References checked: [Supabase RLS and view guidance](https://supabase.com/docs/guides/database/postgres/row-level-security), the current Supabase changelog index, and final F06 source/release handoff. The public historical F06 handoff's pre-publication status text is superseded by PR10's immutable source identity for this composition; it is not rewritten here.
