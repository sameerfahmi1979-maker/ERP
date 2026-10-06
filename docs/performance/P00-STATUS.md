# PERF-P00 inventory and baseline preparation

## Scope and status

This tooling and dependency-patch candidate does not change ERP application code, permissions,
database schema or workers. Docker packaging includes the reviewed vendor sources
in both build and runtime layers; this is not a deployment. No merge or production
deployment is authorized by this pull request.

Browser baseline measurements remain **NOT RUN / OWNER-DEFERRED**. On 6 October
2026 the owner explicitly moved them out of P00 closeout to cloud validation
after the performance phases. No browser access restriction has been bypassed.
P00's revised non-browser scope is complete, subject to the final documentation
commit retaining passing checks. This is not cloud release approval or a
performance acceptance claim. No browser measurement has been fabricated.

The deferred gate includes Employees, Departments and DMS; admin and scoped
synthetic users; cold route, warm navigation, reload, workspace return and
search/filter scenarios. Preserve the frozen baseline and controlled fixture
manifest. The cloud follow-up must use supported browser access, record build,
data, actor and network conditions, keep all samples and compare equivalent
environments. It must not claim an improvement from unlike local/cloud timings.

On 6 October 2026 the owner approved **synthetic laboratory-only workload scope**.
Production volumes, concurrency and real-device/network distributions remain
unvalidated. No production performance guarantee or timing improvement is claimed.

## Inventory evidence

Private source-bound snapshot: 1,717 source files, 215 page routes, 891 conservative
discovery candidates and 225 preserved, hash-qualified overlays. These are not
counts of passing screens. Old acceptance qualifications are retained; changed
source/dependency hashes invalidate stale acceptance.

The export-review tool resolves each referenced action export to its declaration,
records source digests and call locations, and separates read/write/mixed/delegated
syntax. A read-looking name, select call, or lack of visible writes never proves
purity. All 763 referenced exports now have source-bound manual direct-business
contract reviews, with material delegated-business-helper notes. An independent
join verifies exact key coverage, no duplicate reviews, matching source hashes
and all 1,717 current files. Consumer-pattern classification is a separate sidecar;
the original inventory, 225 overlays and unresolved security/runtime holds remain
unchanged. Unknown RPC/provider/infrastructure effects remain explicit: this is
not exhaustive transitive purity, safe-cache admission or runtime acceptance.

## Verification

Run `node node_modules/vitest/vitest.mjs run --config tests/performance/p00.config.mts`.
This is an offline test suite: no browser, production database or provider access.
The latest local Windows run has 106 passes, zero failures and eight explicitly skipped
file-symlink cases because that host does not permit creating file symlinks.

The dedicated Windows/Linux CI workflow requires every case to execute and fails
if any case is skipped. It does not change host security permissions to force a pass.
On implementation commit f633accc720b70958cec5a93246593d79bb395ee, Windows and Linux
each passed all 114 cases, with zero failures or skips (run 37445857067).
Engineering run 37445857120 passed verification, lint and production-image checks.
Ordinary unit tests passed 464 cases and remediation tests passed 827; local lint
has zero errors and 134 existing warnings, with no new warnings. E2E listing and
image anonymous-route probes are not signed-in browser acceptance.

## Measurement binding

Read-only local attestation verified all 1,485 frozen baseline inputs and 1,694
frozen candidate inputs against their saved hashes, with no mismatches. Eight
tracked synthetic actors and active profiles were present. Email/AI provider
enabled counts were zero. Dependency, build, fixture-content and authorization
fingerprints are retained privately without passwords or provider keys in this PR.

This snapshot does not establish historical database-schema parity and must be
rechecked immediately before any future paired measurement. Server startup time
is not a user-journey timing.

## Boundaries of the tools

Inventory output requires an explicitly admitted ordinary directory. Existing
directory aliases, symbolic links and hard-linked output files are rejected;
all prior artifacts are backed up before replacement. This is not an atomic
transaction or protection against a malicious concurrent filesystem race.

Raw discovery and potential import reachability are not runtime execution.
No generated inventory, credentials, private audit reports, production records,
database dumps or runtime environment files belong in this public candidate.

## Deferred and later-phase acceptance

- Actual browser measurements, separately deferred by the owner.
- Fresh identical schema/fixture/build binding when paired measurement resumes.
- Source-specific transitive/RPC/security review and runtime tests before later
  read adoption or caching; P00 classification does not pass those gates.
- Existing affected native ACL revalidation and app-wide adoption holds.
- Production-volume, real-device and integrated release acceptance.

## Dependency remediation — 6 October 2026

Two targeted upstream patch updates are included: proxy-addr 2.0.7 to 2.0.8
and source-map-js 1.2.1 to 1.2.2. Framework versions are unchanged;
unrelated lockfile platform metadata is preserved.
Regression cases exercise trust boundaries, ordinary mappings and invalid or
excessive source-map offsets. No production changes are made by this PR.

The owner approved locally maintained patches for braces and sprintf-js, whose
advisories list no upstream patched version as checked on 6 October. Source,
original licenses, provenance digests, explicit local versions and maintenance
instructions are in vendor/. Root dependencies and overrides ensure nested
consumers resolve to those patches. A clean reinstall and resolution inspection
passed locally; npm audit reports zero vulnerabilities, but registry audit does
not evaluate local source and is not proof of patch safety. The mandatory vendor
integrity check and 24 regression/compatibility tests provide separate evidence.
No audit suppression, threshold relaxation or forced major downgrade is used.
See vendor/README.md for scope limitations. Published Windows/Linux, full
engineering and image checks passed on the implementation commit above. Local
fork maintenance remains an explicit duty until verified upstream fixes replace
the patches. Preserve frozen measurement builds and rebind dependencies before
future comparisons; those older builds were not silently upgraded.

References: [proxy-addr patch](https://github.com/advisories/GHSA-jqcg-44mw-7w3h),
[source-map-js patch](https://github.com/advisories/GHSA-68fv-2mgg-jv7q),
[braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
[sprintf-js advisory](https://github.com/advisories/GHSA-hp3w-g68c-fv3c).
