# Engineering checks

The production/CI line is Node 22.23.2 and npm 10.9.8. Package engine requirements also account for the DOM-test runtime; use the pinned production line for release acceptance. Use `npm ci`, not an unreviewed dependency upgrade. Local corporate root certificates must be installed through the approved OS trust store (or a specifically approved `NODE_EXTRA_CA_CERTS` file). Do not disable TLS verification.

- `npm run typecheck`: every shipping TypeScript file and generated Next route types.
- `npm run lint`: every application file under `src`, plus Next configuration. Errors always fail. The named legacy-warning register stays visible; new or increased warnings also fail. Do not expand the baseline merely to pass CI.
- `npm test`: existing application unit tests.
- `npm run test:remediation`: portable F01/F02 regressions; real implementation imports, no outbound provider/database traffic.
- `npm run build`: strict webpack production build.
- `npm run security:secrets`: redacted current tracked-text scan; `-- --staged` checks the index before publication. Not a history scan or proof that every possible secret is absent.
- `npm run schema:types -- --project-id=<approved-project-ref>`: read-only public schema generation with UTF-8 output. Add `--check` to reject drift. Authenticate the Supabase CLI outside CI and review changes before committing. Never expose a management token to a browser or public build.

The GitHub workflow is intentionally secret-free and does not deploy or migrate production. It has no `continue-on-error` or rule downgrade. Do not merge/deploy by bypassing a failing gate. Database/RLS replay and provider/browser evidence require the separately controlled local environment and are not implied by unit-test success.

Historical migration files are not a safe fresh-install recipe. The [verified current-schema baseline and forward-release procedure](schema/README.md) preserve the historical differences rather than pretending every old file can be replayed. Never run an indiscriminate root `supabase db push` or mark old migrations applied merely to remove a mismatch. Applied migration bodies and production recovery evidence are kept privately, outside this public repository's new publication.
