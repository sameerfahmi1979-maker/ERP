# PERF-P00 inventory and baseline preparation

## Scope and status

This tooling-only candidate does not change ERP application code, permissions,
database schema, workers or deployment configuration. No merge or production
deployment is authorized by this pull request.

Browser baseline measurements remain **NOT RUN**. The owner requested work on
the non-browser items while that permission gate remains unresolved. Neither
publication nor a green tooling check closes full P00 browser acceptance.

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
purity. The current 763-export triage resolves declarations, but **manual delegated
effect review remains open**. The tool deliberately does not turn those entries
into passes or erase them from the inventory.

## Verification

Run `node node_modules/vitest/vitest.mjs run --config tests/performance/p00.config.mts`.
This is an offline test suite: no browser, production database or provider access.
The local Windows run has 73 passes, zero failures and eight explicitly skipped
file-symlink cases because that host does not permit creating file symlinks.

The dedicated Windows/Linux CI workflow requires every case to execute and fails
if any case is skipped. It does not change host security permissions to force a pass.
CI results must be inspected independently; adding the workflow is not a passing result.

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

## Remaining acceptance

- Manual semantic/effect review beyond the export syntax triage.
- Passing native file-link and ordinary repository checks on the published commit.
- Actual browser measurements, separately deferred by the owner.
- Fresh identical schema/fixture/build binding when paired measurement resumes.
