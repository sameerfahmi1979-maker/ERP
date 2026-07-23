# Email Notification System — Complete Setup Manual

**ALGT ERP · Microsoft 365 / Microsoft Graph · Based on live system audit · 22 July 2026**

---

## Current System Status

> **The email system is LIVE and sending.**
> The last batch of DMS expiry emails was sent on 22 July 2026 at 06:00 UTC. All 288 emails in the queue have been delivered. No failures exist.

| Metric | Value |
|---|---|
| Total Emails Sent | **288** |
| Failed / Pending | **0** |
| Feature Flags Active | **7 / 7** |
| Last Scheduler Run | Today 06:00 UTC |

| Component | Status | Detail |
|---|---|---|
| Email Provider | ✅ Configured | Microsoft 365 · erp@algt.net · Last test: SUCCESS 29 Jun 2026 |
| Azure App Registration | ✅ Active | Client ID: dcfb5c46 · Tenant: 0936a1e6 |
| Sender Mailbox | ✅ OK | erp@algt.net · Display: ALGT ERP System |
| DMS Expiry Scheduler | ✅ Running | Daily 06:00 UTC · 4 configured recipients |
| Notification Recipients | ⚠️ Verify | 4 users configured — confirm all 4 receive emails (see Part C) |

> **⚠️ Action needed — verify sameer@algt.net is receiving emails**
>
> Sameer Fahmi is in the DMS notification recipient list (User ID 1). However, recent queue records show emails going only to yaser@algt.net. Please follow Part C → Step C-2 to re-save the recipient settings and then check Admin → Notifications → Email Queue filtered to sameer@algt.net.

---

## Admin Pages — Quick Reference

All pages are accessed from within the ERP after logging in as an admin user.

| Page Name | URL Path | What you can do |
|---|---|---|
| Email Settings | `/admin/settings/email` | Configure M365 provider, rotate secret, test send, manage feature flags |
| DMS Notification Settings | `/admin/dms/notification-settings` | Add/remove recipients, set reminder days, toggle email/in-app |
| Email Queue | `/admin/notifications/email-queue` | View all sent/pending/failed emails, force-process, retry |
| Delivery Logs | `/admin/notifications/logs` | Per-attempt delivery results with error messages |
| Notification Templates | `/admin/notifications/templates` | Edit email subject and body templates |
| All Notifications | `/admin/notifications` | Full notification center (in-app + email) |
| DMS Approval Workflows | `/admin/dms/approval-workflows` | Configure which document types trigger approval emails |
| Report Schedules | `/admin/reports/schedules` | Set up recurring report email delivery |

---

## PART A — Azure App Registration (Microsoft 365 Side)

This is the Microsoft side. Your App Registration already exists and is working. You only need to come here to rotate the client secret when Azure warns it is about to expire (every 24 months).

---

### Step A-1 — Sign in to Azure Portal
*Where: portal.azure.com*

1. Go to https://portal.azure.com and sign in with your Microsoft 365 admin account.
2. You need the **'Application Administrator'** or **'Global Administrator'** role.
3. In the search bar at the top, type **'App registrations'** and click it.

---

### Step A-2 — Your App Registration (already exists)
*No action needed unless creating fresh*

1. Search for: **ERP Email Sender**
2. This registration already exists for ALGT. Open it to view details.
3. If it did not exist, you would click **'+ New registration'** → Name: ERP Email Sender, Account type: Single tenant, no Redirect URI → Register.

---

### Step A-3 — Copy Tenant ID and Client ID
*Where: App Registration → Overview*

- **Application (client) ID:** `dcfb5c46-e847-4597-8a1f-69da3823d1a8` ← already saved in ERP
- **Directory (tenant) ID:** `0936a1e6-a281-4ecb-9708-7706bd53ae2f` ← already saved in ERP
- You will only need these values again if you ever reset the ERP email configuration from scratch.

---

### Step A-4 — Rotate the Client Secret (when expired)
*Where: App Registration → Certificates & secrets*

1. Click **'Certificates & secrets'** in the left sidebar of the App Registration.
2. Under **'Client secrets'**, check the **'Expires'** column. Azure emails you 30 days before expiry.
3. To rotate: click **'+ New client secret'** → Description: `ERP Production Secret` → Expires: 24 months → **Add**.
4. **CRITICAL:** Copy the **Value** column immediately. It is shown **ONCE** and disappears on page refresh.
5. Then go to Part B, Step B-3 to update the secret in the ERP admin panel.

---

### Step A-5 — Verify Mail.Send Permission
*Where: App Registration → API permissions*

1. Click **'API permissions'** in the App Registration left sidebar.
2. You should see: **Microsoft Graph → Mail.Send (Application) → Status: Granted for ALGT**
3. If status shows **'Not granted'**: click **'Grant admin consent for ALGT'** → Yes.
4. If Mail.Send is missing: click **'+ Add a permission'** → Microsoft Graph → Application permissions → search `Mail.Send` → check it → Add permissions → then grant consent.

---

### Step A-6 — Verify Sender Mailbox
*Where: admin.microsoft.com*

1. Go to https://admin.microsoft.com → **Users → Active users**.
2. Confirm **erp@algt.net** exists, status is Active, and has an Exchange Online license.
3. If it does not exist: click **'+ Add a user'** → create erp@algt.net → assign a Microsoft 365 license that includes Exchange Online.
4. Shared mailboxes also work (no license needed for under 50 GB). Create via Exchange Admin Center → Shared mailboxes.

---

## PART B — ERP Email Provider Settings (Inside the System)

This is where you configure the email provider from inside the ERP admin panel. No coding required — everything is done through the UI.

---

### Step B-1 — Open Email Settings Page
*Where: Admin → Settings → Email*

1. Log in to the ERP as sameer@algt.net.
2. In the left sidebar, click: **Admin → Settings → Email**
3. URL path: `/admin/settings/email`

---

### Step B-2 — Review the Configured Provider
*Should show M365_DEFAULT as Active*

- You will see a provider row: **Microsoft 365 (Default)** — code: `M365_DEFAULT`
- Sender email: `erp@algt.net`
- Sender display name: `ALGT ERP System`
- Status: Active / Default / Enabled
- Last successful test: 29 June 2026
- If the row shows an error badge, proceed to Step B-3.

---

### Step B-3 — Update the Client Secret
*Do this after rotating the secret in Azure (Step A-4)*

1. Click the **Edit (pencil) icon** on the M365_DEFAULT row.
2. The form shows: Tenant ID, Client ID, Sender Email, Display Name, Client Secret.
3. Paste the new client secret value from Azure (Step A-4) into the **Client Secret** field.
4. Click **Save**.

---

### Step B-4 — Send a Test Email
*To verify the provider works*

1. On the Email Settings page, find the **'Test Email'** section.
2. Enter your email: `sameer@algt.net`
3. Click **'Send Test Email'**.
4. Expected result: you receive an email from `erp@algt.net` within **60 seconds**.
5. If not received: check your Spam/Junk folder first. Then go to Part D (Email Queue) and look for the test email row and any error message.

---

### Step B-5 — Check Email Feature Flags
*All 7 should be enabled*

1. On the Email Settings page, scroll to the **'Email Feature Flags'** section.
2. All 7 flags are currently **ON** (confirmed from live database).
3. If any flag is OFF, click its toggle to enable it.

| Flag | Purpose |
|---|---|
| `DMS_EXPIRY_EMAILS` | Controls daily document expiry reminder emails |
| `WORKFLOW_EMAILS` | Controls DMS approval request/decision emails |
| `HR_EXPIRY_EMAILS` | HR document expiry emails |
| `FLEET_EXPIRY_EMAILS` | Fleet document expiry emails |
| `DMS_RENEWAL_EMAILS` | DMS document renewal notification emails |
| `REPORT_EMAILS` | Scheduled and on-demand report email delivery |
| `SYSTEM_TEST_EMAIL` | Admin test email sends from Email Settings page |

---

## PART C — Notification Recipients — Who Gets Emails

Controls which users receive DMS document expiry/renewal emails, how early they are notified, and whether emails or in-app notifications (or both) are sent.

---

### Step C-1 — Open DMS Notification Settings
*Where: Admin → DMS → Notification Settings*

1. In the left sidebar: **Admin → DMS → Notification Settings**
2. URL path: `/admin/dms/notification-settings`
3. This page controls who receives DMS document expiry and renewal emails.

---

### Step C-2 — Review and Update Email Recipients
*4 users currently configured*

The **'Recipient Users'** picker currently includes 4 users:

| User ID | Name | Email | In List |
|---|---|---|---|
| 1 | Sameer Fahmi | sameer@algt.net | ✅ Yes |
| 14 | Sameer-2 | sameer.fahmi@pgi.ae | ✅ Yes |
| 16 | Gipson Barekye | gipson@algt.net | ✅ Yes |
| 18 | Yaser Al Najjar | yaser@algt.net | ✅ Yes |

- To **add** a user: click the user picker and search by name.
- To **remove** a user: click the X next to their name.
- Click **Save** after making changes.

---

### Step C-3 — Set Reminder Days Before Expiry
*Currently: 90, 60, 30, 14, 7, 3, 1, 0 days*

- The **'Reminder Days'** field controls HOW EARLY each recipient is notified before a document expires.
- **Current setting:** 90 days, 60 days, 30 days, 14 days, 7 days, 3 days, 1 day, 0 days (day of expiry).
- **Example:** A document expiring on 1 Aug 2026 will trigger emails on: 3 May, 2 Jun, 2 Jul, 18 Jul, 25 Jul, 29 Jul, 31 Jul, 1 Aug.
- To reduce email frequency, remove values (e.g. remove 90 and 60 to only start at 30 days).
- Edit the field, apply changes, click **Save**.

---

### Step C-4 — Toggle Email vs In-App Notifications
*Both are currently ON*

| Toggle | Current | Effect |
|---|---|---|
| Email Enabled | ON | Sends email to all recipients in the list |
| In-App Enabled | ON | Shows a notification bell counter in the ERP sidebar for each user |

- Turn **Email OFF** while keeping In-App ON: notifications only visible inside ERP, no email sent.
- Turn **In-App OFF** while keeping Email ON: only email, no bell in ERP.

---

## PART D — Email Queue — View, Process and Retry

The email queue is the central log of all outbound emails. You can view every email, force-send the queue, and retry failures — all from the admin panel.

---

### Step D-1 — View the Email Queue
*Where: Admin → Notifications → Email Queue*

1. Go to: **Admin → Notifications → Email Queue**
2. URL path: `/admin/notifications/email-queue`
3. The table shows all outbound emails with: Status, Recipient, Subject, Attempts, Sent time, Error.
4. Status values: `pending` (waiting to send) | `sent` (delivered) | `failed` (exhausted retries) | `cancelled`

---

### Step D-2 — Force-Process the Queue Now
*If emails are stuck as 'pending'*

1. Click the **'Process Queue'** button at the top of the Email Queue page.
2. This triggers the email engine immediately — you do not have to wait for the next scheduled run.
3. Refresh the page after 30 seconds to see updated statuses.

---

### Step D-3 — Retry a Failed Email
*For emails with status 'failed'*

1. Find the failed email row in the table.
2. Click the row's **action menu (three-dot icon)** on the right and choose **'Retry'**.
3. The email status resets to `pending` and will be sent in the next queue run.
4. The system automatically retries pending emails after **5 minutes**, then again after **30 minutes**.

---

### Step D-4 — View Detailed Delivery Logs
*Where: Admin → Notifications → Logs*

1. Go to: **Admin → Notifications → Logs**
2. URL path: `/admin/notifications/logs`
3. Each delivery attempt is logged with: timestamp, duration, success/fail, and exact error message.
4. Use this to diagnose why a specific email was not delivered.

---

## PART E — Automated Email Schedules

The ERP sends DMS expiry emails daily, approval emails instantly, and report emails on schedule.

---

### Step E-1 — DMS Daily Expiry Emails — Already Running
*Runs every day at 06:00 AM UTC (10:00 AM UAE time)*

- The DMS expiry scheduler runs **automatically every day at 06:00 UTC**.
- It scans ALL active DMS documents, identifies those expiring within the configured reminder days, and queues one email per document per recipient.
- **Confirmed running:** the scheduler ran today (22 July 2026) and sent a batch of emails.
- No action needed. The scheduler is a Supabase Edge Function running on autopilot.

---

### Step E-2 — Trigger DMS Emails Manually (without waiting for tomorrow)
*For ad-hoc or test runs*

1. The scheduler generates the queue entries automatically at 06:00 UTC.
2. After 06:00 UTC, go to **Admin → Notifications → Email Queue** and click **'Process Queue'**.
3. For a full on-demand re-scan outside the 06:00 UTC window, contact the system developer to trigger the Edge Function manually.

---

### Step E-3 — DMS Approval Workflow Emails — Automatic
*Triggered instantly when approval actions happen*

- When a document is **SUBMITTED** for approval: the assigned approvers receive an email immediately.
- When a document is **APPROVED or REJECTED**: the submitter receives an email immediately.
- These emails fire automatically — no scheduler needed. Feature flag: `WORKFLOW_EMAILS = ON`.

---

### Step E-4 — Report Emails — On Demand + Scheduled
*Where: Admin → Reports → Schedules*

- Any grid/list in the ERP supports **Send by Email**: select rows → Export → Send by Email → fill recipient and message → Send.
- For recurring scheduled reports: **Admin → Reports → Schedules** → create a schedule with recipients and frequency.
- Feature flag: `REPORT_EMAILS = ON`.

---

## PART F — How to Test That Emails Are Working

### Test 1 — Send a System Test Email

1. Go to: **Admin → Settings → Email** (path: `/admin/settings/email`)
2. Scroll to the **Test Email** section.
3. Enter your email: `sameer@algt.net`
4. Click **Send Test Email**.
5. Expected: email from `erp@algt.net` arrives in your inbox within **60 seconds**.

> If not received: check Spam folder → then check Admin → Notifications → Email Queue for error.

### Test 2 — Send a Data Export by Email

1. Go to any list page in the ERP (e.g. Parties, Employees, Documents).
2. Select **1–3 rows** using the checkboxes.
3. Click **Export → Send by Email**.
4. Fill in: To (your email), Subject, Message, Attachment format (PDF or Excel).
5. Click **Send**.

> This tests the full Microsoft Graph attachment pipeline end-to-end.

---

## Troubleshooting — Common Problems and Fixes

| Problem | Cause | Fix |
|---|---|---|
| Email not received — check spam | Emails from erp@algt.net may land in Junk/Spam on first send. | Check Spam/Junk folder. Add erp@algt.net to your safe senders list in Outlook. |
| Test email fails: `invalid_client` | The Azure client secret has expired or is wrong. | Azure Portal → App Registration → Certificates & Secrets → create new secret (Step A-4) → update in ERP Email Settings (Step B-3). |
| Test email fails: `InsufficientPermissions` | Admin consent was not granted for the Mail.Send permission. | Azure Portal → App Registration → API permissions → click 'Grant admin consent for ALGT' → Yes → wait 1 minute → retry. |
| Test email fails: `MailboxNotFound` | The sender mailbox erp@algt.net does not exist or has no Exchange license. | admin.microsoft.com → Users → verify erp@algt.net exists, is Active, and has Exchange Online license. |
| Emails stuck as `pending` in queue | The scheduler has not run yet, or the API processor is blocked. | Admin → Notifications → Email Queue → click 'Process Queue' to force-send immediately. |
| Only Yaser receiving expiry emails, not Sameer | Sameer (User ID 1) is in recipient list but queue shows only yaser@algt.net in recent batch. The bridge may not be resolving all recipients. | Admin → DMS → Notification Settings → open edit → re-save the recipient list without changes. Wait for the next 06:00 UTC run. Then check Admin → Notifications → Email Queue and filter by sameer@algt.net. |
| Secret expired warning email from Azure | Azure sends a warning 30 days before the client secret expires. | Follow Step A-4 to create a new secret, then Step B-3 to update it in ERP. Do this before the expiry date or emails will stop working. |

---

## Ongoing Maintenance — What to Do and When

| Task | Frequency | Where |
|---|---|---|
| Rotate Azure Client Secret | Every 24 months (Azure warns 30 days before expiry) | Azure Portal → ERP Admin → Settings → Email (Steps A-4 then B-3) |
| Send test email to verify delivery | Monthly or after any Azure / server changes | Admin → Settings → Email → Test Email section |
| Check Email Queue for failures | Weekly | Admin → Notifications → Email Queue (look for `failed` status rows) |
| Review Delivery Logs if users report missing emails | On demand | Admin → Notifications → Logs |
| Update DMS notification recipients when staff change | When HR changes | Admin → DMS → Notification Settings |
| Adjust reminder days if too many / too few emails | Quarterly or based on feedback | Admin → DMS → Notification Settings → Reminder Days field |

---

*ALGT ERP Email Notification Manual · Generated 22 July 2026 · Based on live database and source code audit*
