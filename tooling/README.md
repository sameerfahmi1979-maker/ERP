# Engineering checks

Supported Node minimum: 22.19 (system CA support); the verified production/CI line is Node 22.23.2 and npm 10.9.8. Use `npm ci`, not an unreviewed dependency upgrade. Local corporate root certificates must be installed through the approved OS trust store (or a specifically approved `NODE_EXTRA_CA_CERTS` file). Do not disable TLS verification.

- `npm run typecheck`: every shipping TypeScript file and generated Next route types.
- `npm run lint`: every application file under `src`, plus Next configuration. Existing failures remain failures.
- `npm test`: existing application unit tests.
- `npm run test:remediation`: portable F01/F02 regressions; real implementation imports, no outbound provider/database traffic.
- `npm run build`: strict webpack production build.
- `npm run security:secrets`: redacted current tracked-text scan; `-- --staged` checks the index before publication. Not a history scan or proof that every possible secret is absent.
- `npm run schema:types -- --project-id=<approved-project-ref>`: read-only public schema generation with UTF-8 output. Add `--check` to reject drift. Authenticate the Supabase CLI outside CI and review changes before committing. Never expose a management token to a browser or public build.

The GitHub workflow is intentionally secret-free and does not deploy or migrate production. Its whole-application lint job may fail while the recorded legacy diagnostics are repaired; it has no `continue-on-error` or rule downgrade. Do not merge/deploy by bypassing that gate. Database/RLS replay and provider/browser evidence require the separately controlled local environment and are not implied by unit-test success.

Historical migration files are not a safe fresh-install recipe until lineage reconciliation is accepted. Never run an indiscriminate root `supabase db push` or mark old migrations applied merely to remove a mismatch. Applied migration bodies and production recovery evidence are kept privately, outside this public repository's new publication.
