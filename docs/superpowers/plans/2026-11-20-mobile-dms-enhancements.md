# Android DMS 4.0 Implementation Plan

> For agentic workers, use the installed Superpowers implementation and review guidance. Track tasks with checkboxes.

Goal is one signed employee APK containing the accepted role-based enhancements and manual offline library.

Architecture extends native Java and the protected ERP mobile API. Tech stack is Android SDK 35/JDK 17 and existing Next/Supabase services. Spec is docs/superpowers/specs/2026-11-20-mobile-dms-enhancements-design.md.

## Global constraints

Preserve ERP web retirement, existing API clients, per-company/branch authority, existing signing certificate and retained upload/approval idempotency. No browser/device automation. Native Android API dependencies only. Manual offline storage uses authenticated encryption and a maximum seven-day authorization lease. Preserve unrelated dirty work. All feature changes must be exercised from ordinary app entry points before a release claim.

## Review focus

Account switching and logout must not expose previous-user data. Offline expiry and clock rollback must not extend grants. Jobs must not race foreground uploads. Partial-name search must preserve scope and unambiguous filing. Permission denial and network failures must remain distinct from empty results.

## Tasks

- [ ] 1. ERP mobile capabilities and workflow operations. Extend route command schema with role-aware home, personal/folder search, filters, task/expiry/renewal/approval actions and offline authorization; reuse authoritative readers. Add isolated allow/deny, malformed-input, partial-search and compatibility checks. Backend task owns route and new server/mobile helper files.
- [ ] 2. Offline and account privacy. Add OfflineDocuments and LocalSecurity Java modules. Implement per-account AES-GCM storage, lease validation, metadata search, remove/refresh/clear, app lock and safe logout. Preserve old drafts by encrypting on read. Add focused JVM tests for lease/clock validation. This task owns new storage/security classes and LocalDraft encryption only.
- [ ] 3. Capture and persistent work. Add native ScanEditor and UploadJobs Java modules plus a background JobService. Provide image crop/rotate/contrast controls and persistent recoverable queue/notifications. Preserve request operation IDs, account identity and server duplicate checks. This task owns new scanner/job classes only and supplies manifest changes to integrator.
- [ ] 4. Native screens and integration. Implement four navigation areas, personal/folder document views and filters, upload history and ERP tasks, chosen-record filing, offline saving/preview/library/settings, incoming Android Share and typed AI fields. Integrate new modules, manifest permissions/service, version 4.0.0/code 9. Main agent owns LauncherActivity, ErpApi, manifest and resources/build scripts.
- [ ] 5. Review and release. Independent source and security review, fix findings, build/type/tests, CI, deploy exactly reviewed ERP API changes while preserving newer production, sign and verify final APK, update handoff and distribution instructions. Repeat checks only after relevant changes or findings.