# F02 production build contract

The production image uses the same pinned Node 22.23.2 / npm 10.9.8 runtime as
engineering CI. The official Node image is digest-pinned. Dependency installation
uses `npm ci`; both the Next production build and shipping typecheck are blocking.

The Docker context is an allowlist. It excludes `.env` files, Git metadata,
private audits, operator scripts, database migrations and synthetic test ledgers.
Only the three `NEXT_PUBLIC_*` browser settings declared in the Dockerfile are
build arguments. Railway supplies the existing service-role, worker and signing
credentials at runtime. Never introduce them as Docker build arguments.

The final image runs as the unprivileged `node` user. It preserves the existing
full Next server and native dependencies; this is not a static export or a new
standalone tracing boundary. Development dependencies are retained for now to
avoid silently removing runtime Next/TypeScript/native consumers. Pruning needs
its own measured compatibility test. The existing Google Fonts build fetch still
requires network access; this is not an air-gapped build.

Railway detects the root `Dockerfile`. No new service, domain, database migration,
secret rotation or provider integration is required. Record the exact Git commit,
image/deployment ID and acceptance results for every rollout. Keep the previous
security-compatible deployment available; never roll back rotated credentials or
F01 database controls.

CI builds this image with synthetic loopback configuration, starts it only on a
loopback port, and verifies runtime versions, the unprivileged user, the login
page and an anonymous protected-route redirect. It cannot establish production
authentication, database access or renderer connectivity; perform those bounded
live checks after an authorized rollout.
