# Locally maintained security patches

Approved by the system owner on 6 October 2026. These are private local forks,
not official upstream releases. Original licenses are preserved beside source.
Original file digests and patched file digests are in PATCH-MANIFEST.json.

## braces 3.0.3 -> 3.0.3-algt.1 (MIT)

Addresses GHSA-vfj7-8cjw-p6xm with a non-overridable 128-level nesting ceiling
in parsing and iterative AST validation before recursive compile/expand/stringify
walkers. Both braces and parentheses are guarded, including unclosed input and
direct imports of lib modules. Supplied AST cycles and excessive node counts
are rejected. Escaped, quoted and bracketed literal delimiters remain literal.
Ordinary compile/expansion behavior and upstream range limits are preserved.

Over-deep input raises a controlled SyntaxError before recursion, rather than
an engine stack overflow. Callers must still handle invalid-input exceptions.
This is not a blanket denial-of-service guarantee: combinatorial output growth,
caller-disabled range limits and hostile executable getter objects are outside
this patch's narrowly stated scope.

## sprintf-js 1.0.3 -> 1.0.3-algt.1 (BSD-3-Clause)

Addresses GHSA-hp3w-g68c-fv3c by clamping numeric precision to the supported
0–100 range for e/f, and 1–100 for g, before calling native formatters. Valid
precision and ordinary formatting remain unchanged. Invalid/excessive precision
is bounded rather than producing an uncaught native RangeError. Applies to
sprintf, vsprintf and direct format(parse-tree) use. Width/output size and
unrelated historic library behavior are not claimed fixed.

## Verification and lifecycle

The original packages lack the new bounded-input protections. A retained
below-length-limit reproduction (4,000 brace/parenthesis levels) produces native
stack overflow in compile; other entrypoints accept that depth. Excessive e/f/g
precision produces native RangeError. The initial 6,000-level test accidentally
hit the existing input-length cap first; it is not evidence of stack overflow.
The corrected 24-case patch suite adds AST/cycle/boundary and escaping checks.
`npm run security:vendor` verifies every source digest, nested installed
resolution and absence of remaining registry copies. Windows/Linux CI runs
these checks after clean npm ci; Docker explicitly copies vendor source into
both build and runtime layers so local dependency links remain valid.

Registry audit cannot assess locally maintained source; a zero audit count is
not itself proof of these fixes. Do not remove the explicit verification gates.
Any vendor edit requires source review, manifest update and regression rerun.
F17/dependency maintenance owns upstream monitoring. Replace these forks with
official patched versions once available and verified; then remove overrides,
direct fork dependencies and local source together, retaining regression tests
and the historical evidence. No external package publication is authorized.

Advisories:
- https://github.com/advisories/GHSA-vfj7-8cjw-p6xm
- https://github.com/advisories/GHSA-hp3w-g68c-fv3c
