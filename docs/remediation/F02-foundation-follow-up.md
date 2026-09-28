# F02 engineering follow-up

This follow-up repairs the whole-application blocking lint backlog without disabling rules or excluding shipping code. Lifecycle changes replace effect-driven form resets and unguarded fetch responses with explicit dialog identity, stable external UI preferences and query keys. It does not implement the full F03 permission redesign, F04 workspace reconstruction or F08 reporting replacement.

## Deliberate boundaries

- Legacy advisories stay visible in `tooling/quality/lint-warning-baseline.json`. Each has a disposition; the gate rejects every error and every new/increased warning. Unused validation/schema/contract bindings are not blindly activated or deleted as a lint fix.
- Applied migration history and divergent legacy SQL remain intact. The verified forward boundary is a schema-only baseline with read-only catalog parity and a clean-room restore, not an assertion that every old migration can be replayed. See `tooling/schema/README.md`.
- PDF transport requires explicit production `GOTENBERG_URL` and `INTERNAL_SITE_URL`. Values are server-only and validated on feature use, not while compiling unrelated pages. The public site URL is not a silent private-renderer fallback. Print-token secrets remain private and runtime-read. Supply only an approved internal origin, never user input.
- Fresh build jobs require only synthetic public placeholders. They must not receive production database, mail, worker or renderer secrets. Real provider/delivery acceptance remains separate.
- Existing `next/font` declarations download Google Fonts at build time. Tests/lint can run offline; compilation currently needs that public network access. Do not disable TLS or claim an air-gapped build. Self-hosting those font inputs is a future reproducibility improvement.
- The memory check now lives in tracked tooling. The old unrestricted admin-bootstrap package command is retired and fails without connecting to a database; its local historical script is retained as evidence. A safe replacement belongs to F03's privileged identity workflow.
- Archives, prototypes, old deployments, duplicate-looking indexes and prior audit evidence are retained. No delete or database-history repair is bundled with this follow-up.
- Next's middleware-to-proxy warning is retained for the bounded F03 identity/routing change. The current runtime still builds it; a cosmetic rename must not silently change authentication runtime or caching semantics.

## Required checks

Run `npm ci`, `npm test`, `npm run test:remediation`, `npm run lint`, `npm run build`, `npm run typecheck`, `npm run security:secrets`, and `npm audit --audit-level=high` on the pinned production runtime. The remediation suite imports actual helpers/actions/components and includes failed requests, delayed responses, dialog reset, storage failure, strict-mode behavior and migration/lint negative canaries. Tests use synthetic data and mocked delivery.

TEST-003's permissive smoke/PDF oracles are replaced with fail-closed synthetic fixture contracts. `npm run typecheck:e2e` and E2E enumeration run in CI; offline remediation tests reject login redirects, substitute lists, malformed PDFs, wrong-record content, blank pages and wrong page counts/dimensions. `npm run test:routes` requires explicitly seeded local credentials/records and ON/OFF feature expectations. `npm run test:pdf` executes actual signer/print-route/renderer integration against loopback services and parses the returned PDF. Neither command assumes a business user or production record. See `tests/e2e/support/README.md`. Browser journeys and HTTP print tests are separate evidence; a route's rendering success does not certify sidebar navigation, official issuance, reprint or final branded layout.

Before release, compare fresh migration history and canonical catalog with the non-secret baseline manifest; replay only the new explicitly reviewed migration list. This follow-up itself adds no production migration. Record the exact source/dependency hashes, rollback candidate, required runtime configuration, approved window and post-release checks. A public PR update is not a production deployment.
