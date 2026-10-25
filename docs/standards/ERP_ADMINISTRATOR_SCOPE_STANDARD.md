# Administrator scope contract

Policy candidate: 2026-10-25.v1. Implementation acceptance and deployment remain separately gated. This document does not authorize any live role assignment.

Global System Administrator uses the reserved system_admin role and explicit null/null global assignment. Global System is a virtual administrative scope, never a business company or ownership ID. Preserve the legacy group_admin identity until separately reviewed.

Company Administrator requires one active real company and no branch. Branch Administrator requires that company and a specific active branch belonging to it. Labels and role_level are not authority. Do not infer a branch from an employee, name, default, first choice or current profile.

Every new permission must explicitly classify administrator_scope as global, company or branch after reviewing every consumer. Unreviewed permissions remain held and cannot be automatically inherited. Scope classification must be recorded in docs/security/administrator-capabilities.json and accompanied by native allow/deny fixtures. A prefix such as admin or view is not sufficient evidence. Global-only configuration remains global even when a scoped role can enter the same module.

The database maintains Company/Branch Administrator role_permissions from classification. These rows are derived, not manual checkbox grants. Retain their stable IDs and existing transaction locks. Do not replace locked grants with a computed union view or broaden current_user_has_permission globally to make a blocked action succeed. Ordinary role grants remain explicit; cloning a role does not confer future administrator inheritance.

All callers must authenticate with Supabase Auth getUser and validate the current ERP session through f03_current_session_valid. Preserve inactive/forced-password checks. The server and database must resolve actual record or parent company/branch, separately check source and destination on transfer, and enforce sensitivity and workflow controls. Permission capability arrays and menu visibility are not row authorization.

Apply the same current authority to lists, counts, selectors, exports, signed downloads, background work and uncertain-outcome retries. Recheck identity, permission and source versions before committing. Administrators do not bypass independent approval, retention, locks, financial/medical evidence or other unresolved business policies.

Only global administrators appoint Company/Global administrators. Company administrators may appoint branch administrators in their own company. Branch administrators may grant ordinary roles only within their branch. No scoped actor may reset, suspend, rehome or delete an identity with active authority outside their own administrative boundary. Preserve last-global-admin protection.

Tests must cover two companies and sibling branches, multiple assignments without scope mixing, confidential records, expired/revoked sessions, active-scope changes, concurrent revocation, new-module inheritance and unknown permissions. Use source, unit/component and native database tests. Browser testing/computer control requires a separate explicit owner instruction; visual/mobile acceptance remains owner-performed.

Do not release an inheritance change while an active administrator scope is malformed or a current consumer classification remains unresolved. Publish reviewed exact-commit checks and retain private access inventories outside the public repository.

A user may have multiple companies and branches. Store one assignment per company or branch and evaluate their exact union. The profile home company is not the maximum access boundary. Do not widen grants because two branches share a name. Preserve other assignments when one is revoked.

The existing remediation CI suite runs administrator-capability-contract.test.ts. It checks register/migration parity, fail-closed defaults and explicit classification in new literal permission inserts. It does not replace consumer review, generated/dynamic SQL review or native allow/deny acceptance. A passing contract test is not release approval.
