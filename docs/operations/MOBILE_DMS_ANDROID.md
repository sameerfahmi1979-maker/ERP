# Mobile DMS Android handoff

## 15 November 2026 — ERP web workspace retired

The owner requested removal of the **Mobile DMS** menu from ERP web. This change removes the `/dms/mobile` page, the **Capture on phone** shortcut from employee and site records, and Chrome install assets. The Release 1 Chrome installation and phone acceptance instructions are obsolete. The original Android launcher APK (1.0.0) depended on that page.

- The current native app is `C:\dev\mobile_app\ALGT-Mobile-DMS-3.4.0.apk`. Its source is in `C:\dev\mobile_app\android`. It has its own login, document upload and AI review, search, preview, download and sharing screens.
- Keep `/api/mobile/dms/v1` available at `https://erp.algt.net`. The native app also uses ERP Supabase authentication and scoped duplicate-file validation. Keep these interfaces available when updating ERP web.
- ERP web users continue to use **Documents**, **Upload Inbox**, and the existing document actions on employee and site records. This removal requires no database migration or document cleanup.

Build and signing details are in `C:\dev\mobile_app\ANDROID_APK.md`. Track website deployment and verification in the associated pull request. Physical Android acceptance is tracked independently.
