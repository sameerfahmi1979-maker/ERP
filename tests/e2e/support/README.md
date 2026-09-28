# Honest integration contracts

These tests accept only a deliberately configured **loopback synthetic environment**. They never load `.env.local`, default to a real person/record, issue production documents, toggle production flags or dispatch email/AI workers. Missing settings are `BLOCKED` setup errors (nonzero exit), not passes or silent skips.

For browser routes, set `APP_BASE_URL`, `E2E_USER_EMAIL` (`@example.invalid`), `E2E_USER_PASSWORD`, `E2E_DOCUMENT_ID`, `E2E_DOCUMENT_TITLE`, `E2E_REVIEW_STATE` and `E2E_OBSERVABILITY_STATE` (`on` or `off`). Seed and ledger the exact document first, with an empty review queue; no first-row selection/list fallback. Run `npm run test:routes`. Provision each feature state locally and run both; one state does not prove the opposite. Tests do not mutate flags themselves.

For print/PDF HTTP integration, set `APP_BASE_URL`, `GOTENBERG_URL`, the local server's `PDF_PRINT_TOKEN_SECRET`, `E2E_EMPLOYEE_ID`, `E2E_EMPLOYEE_NAME`, `E2E_COMPANY_ID`, `E2E_COMPANY_NAME` and `E2E_PROFILE_ID`. Seed published `hr-employment-letter-en` and draft `bilingual-sample-en-ar` governance rows in the local database. Run `npm run test:pdf`. This uses the actual application token signer and actual HTTP print route, not a copied HMAC implementation. PDF validation parses the returned bytes, every page and expected synthetic content. It is not official issuance/storage/QR/reprint acceptance; those remain F08.

Credentials are environment-only. Test-server secrets are never production secrets. Test output, signed URLs and PDF attachments stay local/restricted; do not publish Playwright HTML/JSON logs unreviewed. Traces/screenshots are disabled because they can capture credentials/tokens. The `server-only` alias is confined to this trusted Node test runner and never applies to shipping builds.

The ignored legacy `scripts/dms-ai-phase15-smoke.ts` is only a compatibility entrypoint. The tracked canonical implementation is `tooling/testing/dms-smoke.cjs`. HTTP 200/login/error text and success toasts are not PDF or authenticated route evidence. Worker authorization has independent bounded remediation tests.
