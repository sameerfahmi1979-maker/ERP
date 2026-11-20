# Mobile DMS Android handoff

## 20 November 2026 — native HR release 1 (4.1.0 / code 10)

The same native Android package adds **HR** for employee profile, leave, attendance, supervisor timesheets, renewals and independent approvals. It uses `/api/mobile/hr/v1` with the same current ERP bearer session as DMS. Existing DMS capture, AI filing, preview, search, sharing and manual offline leases remain available. The ERP web Mobile DMS launcher stays retired.

Personal HR requires a verified `erp_user_employee_links` record matching the account and employee company/branch. The release does not assign roles or link users to employees. The live metadata preflight found zero such links; employee-account setup remains an administrator task. Staff menus and every record action use current exact ERP permissions and the union of separately assigned company/branch scopes. Medical and DMS evidence rights remain separate.

The reviewed database change grants only six capabilities to the existing `employee_self_service` role: `hr.employees.view.self`, `hr.leave.view.self`, `hr.attendance.view.self`, `hr.compliance.view.self`, `hr.actions.view.self`, and the new branch-classified `hr.requests.submit.self`. Company and Branch Administrator permissions follow the existing protected classification mechanism. No broad management, DMS or medical grants are added.

Profile correction proposals cover mobile number, personal email and emergency contact name/mobile. Accepted corrections use the canonical profile writer. Leave uses real ERP periods, pending reservations, policy checks, source versions and operation receipts. Required certificates retain exact original-file identity and integrity checks. Attendance corrections and renewal acceptance record requests for officer follow-up; final attendance and compliance facts remain in the existing ERP workflow. The **Recorded work site** filter matches attendance on the selected date; **Actual work site** is the entry destination. Supervisor saves and independent approval retain native F12 eligibility and employee-management authorization.

HR writes require connectivity. Interrupted submissions retain an encrypted account-bound original operation. Earlier-login entries allow receipt recovery, with no mutating replay across login epochs. Current target authority is rechecked before pending details or receipts are displayed. The same unresolved leave intent cannot be duplicated; independent later intents remain subject to ERP validation. Existing manual document offline saving still offers 1, 3 or 7 days.

Signed APK and source: `C:\dev\mobile_app\ALGT-Mobile-DMS.apk` and `C:\dev\mobile_app\android`. Release evidence is retained under `C:\dev\mobile_app\build`: `mobile-hr-4-1-release-receipt.json`, `mobile-hr-database-application.json`, source manifest, isolated native SQL logs and independent review reports. Deployment is verified against the expected source fingerprint. Browser and physical-device acceptance remain pending; no live employee business writes are used for release tests.

## 15 November 2026 — ERP web workspace retired

The owner requested removal of the **Mobile DMS** menu from ERP web. This change removes the `/dms/mobile` page, the **Capture on phone** shortcut from employee and site records, and Chrome install assets. The Release 1 Chrome installation and phone acceptance instructions are obsolete. The original Android launcher APK (1.0.0) depended on that page.

- The current native app is `C:\dev\mobile_app\ALGT-Mobile-DMS-3.4.0.apk`. Its source is in `C:\dev\mobile_app\android`. It has its own login, document upload and AI review, search, preview, download and sharing screens.
- Keep `/api/mobile/dms/v1` available at `https://erp.algt.net`. The native app also uses ERP Supabase authentication and scoped duplicate-file validation. Keep these interfaces available when updating ERP web.
- ERP web users continue to use **Documents**, **Upload Inbox**, and the existing document actions on employee and site records. This removal requires no database migration or document cleanup.

Build and signing details are in `C:\dev\mobile_app\ANDROID_APK.md`. Track website deployment and verification in the associated pull request. Physical Android acceptance is tracked independently.
