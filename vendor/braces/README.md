# braces 3.0.3 — ALGT local nesting mitigation

This directory retains the published `braces` 3.0.3 package name, version,
MIT license, attribution, dependencies and original processing algorithms.
The local modification addresses uncontrolled recursive nesting described
by GHSA-vfj7-8cjw-p6xm. It is not an upstream release.

The parser rejects more than 100 combined brace/parenthesis containers before
pushing another container. Compile, expand and stringify independently check
caller-supplied ASTs using an iterative traversal, including child cycles,
parent chains, and nested/cyclic value or queue arrays. Shared children and
ordinary parser parent/previous-node references remain supported. Expansion
parent searches and append/flatten arrays have the same fixed bounds. Callers
cannot increase or disable these bounds through options. Rejection throws
`RangeError` with code `ERR_BRACES_NESTING` before recursive processing.

These are finite recursion guards, not a claim that arbitrary expansion,
regular-expression complexity, hostile getters or custom coercion are bounded.
The original 10,000-character parser limit and expansion range-limit behavior
remain in place. Ordinary patterns, options, output ordering and error behavior
are compared with the pristine upstream package by the standalone security suite.

Run from the ERP root:

    node --test tests/remediation/f06/braces-local-security.test.cjs

The npm advisory may still identify version 3.0.3. Keep the complete raw audit
visible. Any specific advisory treatment must verify this source's exact hashes,
the installed dependency's matching artifact, successful security/parity tests,
and independent review; every other high/critical issue remains a failing gate.

Upstream origin, integrity and original file hashes are in `PROVENANCE.json`.
The original copyright notice is preserved in `LICENSE`.
