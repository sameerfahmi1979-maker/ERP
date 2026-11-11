# HR dashboard workspace

Local implementation, 7 November 2026. Uses the existing ERP appearance and the DMS dashboard's authenticated read/query and chart approach. It does not call the DMS data endpoint for HR figures.

## Data and navigation

- Route: `/admin/hr/dashboard`; authenticated POST read endpoint: `/api/reads/hr-dashboard`.
- Modes: `overview`, `options`, `records`. Legacy requests retain the existing reader.
- Shared metric definitions and predicates drive both counts and matching-record pages (25 rows per page).
- Company, branch, department, employee primary site, Dubai date and expiry window apply together. Company changes clear dependent filters.
- Workforce includes active, probation and on-leave employees. Workforce status is current, not historical headcount. Missing attendance means no recorded entry, not absence.
- Six headline cards, attention panels, workforce distributions and six operational groups cover workforce, time/leave, compliance, recruitment/joining, payroll readiness and HR operations.
- Employee links open existing record sections; recruitment links use existing candidate records or worklists. No invented record destinations or displayed UUIDs.
- Site-filtered recruitment follows requisition work site; employee metrics follow primary site. Unmapped recruitment records cannot be attributed to a selected company/site and are excluded from those filtered cohorts.
- Payroll figures are readiness indicators, not salary disclosure or proof of payment. Existing clinical, independent approval and resource-owner controls remain authoritative.

## Permissions and refresh

- Authenticated Supabase client only; existing permissions and RLS remain in force. No service-role client or database migration.
- Missing-row inference requires permission coverage across the selected employee cohort. Disjoint grants cannot fabricate a missing payroll/attendance result.
- Restricted, failed and unavailable states are distinct from a confirmed zero.
- Private query keys include current identity/grants and scope. Account changes, denied requests and inactive workspaces hide/clear owned data.
- Active views refresh every minute and support manual refresh. Existing realtime infrastructure is reused only when enabled; no worker/provider or realtime setting is activated.
- At most four metric read groups run concurrently. Complete cohort reads are count-checked and bounded; overflow fails instead of returning partial totals.
- Reads are not one transactional snapshot. Concurrent edits may change records between refresh and opening; conflicting page/count responses fail instead of claiming a complete page.

## Verification and remaining owner review

Non-browser reader/component tests cover scopes, paging, permissions, failed/partial reads, account switching, navigation, dates and existing HR/DMS regressions. Component tests run in JSDOM with mocked transport; they do not establish live database, physical-device or visual acceptance.

Owner review: open the local HR Dashboard, confirm permitted live figures and matching records, apply company/branch/site filters, and review light/dark appearance, keyboard operation and mobile layout. Do not treat this implementation as publication or deployment.
