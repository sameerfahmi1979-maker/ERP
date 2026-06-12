# ERP BASE 002E.3 — Microsoft Graph Setup Guide
## Step-by-Step Azure Configuration for Email Integration

**Phase**: 002E.3 - Send by Email Engine (PLANNING)  
**Generated**: 2026-05-27  
**Author**: AI Microsoft 365 Configuration Specialist  
**Audience**: System Administrator / IT Manager  
**Status**: ✅ GUIDE COMPLETE

---

## 🎯 Overview

This guide walks through configuring Microsoft 365 / Azure Active Directory to enable the ERP system to send emails via Microsoft Graph API.

**Prerequisites**:
- Microsoft 365 tenant (Business, Enterprise, or Education)
- Azure Active Directory admin access
- Valid M365 mailbox for sender (e.g., `noreply@company.com`)
- ~15 minutes setup time

---

## 📋 Step 1: Sign In to Azure Portal

1. Navigate to **https://portal.azure.com**
2. Sign in with your **Microsoft 365 admin account**
3. Ensure you have "Application Administrator" or "Global Administrator" role

**Verification**:
- You should see the Azure Portal dashboard
- Left sidebar shows "Azure Active Directory" (or "Microsoft Entra ID")

---

## 📋 Step 2: Create App Registration

**2.1** From Azure Portal home, click **Azure Active Directory** (or search for it)

**2.2** In left sidebar, click **App registrations**

**2.3** Click **+ New registration** (top toolbar)

**2.4** Fill in registration form:

| Field | Value |
|-------|-------|
| Name | `ERP Email Sender` (or your company preference) |
| Supported account types | **Accounts in this organizational directory only (Single tenant)** |
| Redirect URI | Leave blank (not needed for server-to-server) |

**2.5** Click **Register**

**2.6** App Registration is created. You'll see the Overview page.

---

## 📋 Step 3: Copy Application (Client) ID

**3.1** On the **Overview** page, locate **Application (client) ID**

**Example**:
```
Application (client) ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

**3.2** Click the **Copy** icon next to the ID

**3.3** Save this value temporarily (you'll add it to `.env.local` later)

---

## 📋 Step 4: Copy Directory (Tenant) ID

**4.1** On the same **Overview** page, locate **Directory (tenant) ID**

**Example**:
```
Directory (tenant) ID: 9z8y7x6w-5v4u-3t2s-1r0q-ponmlkjihgfe
```

**4.2** Click the **Copy** icon next to the ID

**4.3** Save this value temporarily

---

## 📋 Step 5: Create Client Secret

**5.1** In left sidebar of your app registration, click **Certificates & secrets**

**5.2** Under **Client secrets** tab, click **+ New client secret**

**5.3** Fill in form:

| Field | Value |
|-------|-------|
| Description | `ERP Production Secret` (or your preference) |
| Expires | **24 months** (recommended) or **Custom** |

**5.4** Click **Add**

**5.5** Secret is created. **CRITICAL**: Copy the **Value** immediately (shown once only)

**Example**:
```
Value: abc123xyz789...
```

**5.6** Save this value securely (you cannot view it again)

**Note**: If you lose the secret, you must create a new one.

---

## 📋 Step 6: Add Microsoft Graph API Permission

**6.1** In left sidebar, click **API permissions**

**6.2** Click **+ Add a permission**

**6.3** In "Request API permissions" panel:
- Click **Microsoft Graph** tile
- Click **Application permissions** (NOT Delegated permissions)

**6.4** In search box, type: `Mail.Send`

**6.5** Expand **Mail** section, check **Mail.Send**

**Permission Description**:
```
Mail.Send - Application
Send mail as any user
```

**6.6** Click **Add permissions** (bottom of panel)

**6.7** You'll return to API permissions list. You should see:

| API / Permission name | Type | Status |
|----------------------|------|--------|
| Microsoft Graph / Mail.Send | Application | ⚠️ Not granted |

---

## 📋 Step 7: Grant Admin Consent

**CRITICAL STEP**: Without admin consent, the app cannot send emails.

**7.1** On the **API permissions** page, click **✓ Grant admin consent for [Your Organization]**

**7.2** Confirmation dialog appears:
```
Do you want to grant consent for the requested permissions for all accounts in [Organization]?
This cannot be revoked.
```

**7.3** Click **Yes**

**7.4** Status changes to:

| API / Permission name | Type | Status |
|----------------------|------|--------|
| Microsoft Graph / Mail.Send | Application | ✅ Granted for [Organization] |

**Verification**: Green checkmark in "Status" column

---

## 📋 Step 8: Verify Sender Mailbox Exists

**8.1** Navigate to **Microsoft 365 Admin Center**: https://admin.microsoft.com

**8.2** Go to **Users** → **Active users**

**8.3** Confirm your sender mailbox exists:

**Example**:
- Display name: `ERP Notifications`
- Email: `noreply@company.com`
- Status: Active
- License: Must have Exchange Online (included in most M365 plans)

**8.4** If mailbox doesn't exist:
- Click **+ Add a user**
- Create mailbox with desired address (e.g., `noreply@company.com`, `erp@company.com`)
- Assign license with Exchange Online

**Note**: Shared mailboxes work too (and don't require a license for < 50GB).

---

## 📋 Step 9: Configure ERP Environment Variables

**9.1** Open your ERP project root directory

**9.2** Locate file: `.env.local.example`

**9.3** Copy it to `.env.local`:
```bash
cp .env.local.example .env.local
```

**9.4** Open `.env.local` in text editor

**9.5** Fill in the Microsoft Graph section with values from Steps 3-8:

```env
# Microsoft Graph Email Configuration
MICROSOFT_TENANT_ID=9z8y7x6w-5v4u-3t2s-1r0q-ponmlkjihgfe
MICROSOFT_CLIENT_ID=a1b2c3d4-e5f6-7890-abcd-ef1234567890
MICROSOFT_CLIENT_SECRET=abc123xyz789...
MICROSOFT_MAIL_SENDER=noreply@company.com

# Optional: Override defaults
MICROSOFT_GRAPH_BASE_URL=https://graph.microsoft.com/v1.0
MICROSOFT_MAIL_SAVE_TO_SENT_ITEMS=true
MICROSOFT_MAIL_MAX_ATTACHMENT_MB=10
```

**9.6** Save file

**9.7** Verify `.env.local` is in `.gitignore` (should already be there)

---

## 📋 Step 10: Restart ERP Application

**10.1** Stop the dev server (if running):
```bash
Ctrl+C
```

**10.2** Clear Next.js cache (optional but recommended):
```bash
rm -rf .next
```

**10.3** Restart dev server:
```bash
npm run dev
```

**10.4** Verify server starts without errors:
```
✓ Ready in 2.5s
○ Local:        http://localhost:3000
```

---

## 📋 Step 11: Send Test Email

**11.1** Log in to ERP as admin user

**11.2** Navigate to **Admin → Organizations** (or any list page)

**11.3** Select 1-2 rows

**11.4** Click **Export** → **Send by Email**

**11.5** Fill in test email:
- To: Your work email address
- Subject: Test Email from ERP
- Message: This is a test email.
- Attachment Format: PDF

**11.6** Click **Send**

**11.7** Wait 1-2 seconds

**Expected Result**:
- ✅ Dialog closes
- ✅ Toast notification: "Email sent successfully to 1 recipient"
- ✅ Email appears in your inbox within 1 minute
- ✅ Attachment opens correctly

---

## 🚨 Common Errors & Solutions

### Error: "invalid_client"

**Full Error**:
```json
{
  "error": "invalid_client",
  "error_description": "AADSTS7000215: Invalid client secret is provided."
}
```

**Cause**: Client secret is incorrect or expired

**Solution**:
1. Return to Azure Portal → App Registration → Certificates & secrets
2. Check if secret expired (column "Expires")
3. If expired or wrong, create new secret (Step 5)
4. Update `.env.local` with new secret
5. Restart app

---

### Error: "unauthorized_client"

**Full Error**:
```json
{
  "error": "unauthorized_client",
  "error_description": "AADSTS700016: Application with identifier 'xxx' was not found in the directory."
}
```

**Cause**: Tenant ID or Client ID is incorrect

**Solution**:
1. Return to Azure Portal → App Registration → Overview
2. Double-check Application (client) ID and Directory (tenant) ID
3. Update `.env.local` with correct values
4. Restart app

---

### Error: "Forbidden" / "InsufficientPermissions"

**Full Error**:
```json
{
  "error": {
    "code": "InsufficientPermissions",
    "message": "The application does not have Mail.Send permission."
  }
}
```

**Cause**: Admin consent not granted

**Solution**:
1. Return to Azure Portal → App Registration → API permissions
2. Check status column for "Granted for [Organization]"
3. If not granted, click "Grant admin consent" (Step 7)
4. Wait 1 minute for propagation
5. Retry send

---

### Error: "MailboxNotFound"

**Full Error**:
```json
{
  "error": {
    "code": "MailboxNotFound",
    "message": "The requested mailbox 'noreply@company.com' was not found."
  }
}
```

**Cause**: Sender mailbox doesn't exist or isn't licensed

**Solution**:
1. Go to Microsoft 365 Admin Center → Users → Active users
2. Verify mailbox exists and is active
3. Verify mailbox has Exchange Online license
4. If missing, create mailbox or assign license (Step 8)
5. Wait 5-10 minutes for provisioning
6. Retry send

---

### Error: "MessageSizeExceeded"

**Full Error**:
```json
{
  "error": {
    "code": "MessageSizeExceeded",
    "message": "The message size exceeds the maximum allowed limit."
  }
}
```

**Cause**: Attachment is too large (> 10 MB or tenant limit)

**Solution**:
1. Select fewer records to reduce attachment size
2. Use CSV instead of Excel/PDF (smaller)
3. Increase limit in `.env.local`: `MICROSOFT_MAIL_MAX_ATTACHMENT_MB=15`
4. Note: Microsoft Graph max is typically 25 MB per message

---

### Error: "InvalidAuthenticationToken"

**Full Error**:
```json
{
  "error": {
    "code": "InvalidAuthenticationToken",
    "message": "Access token has expired or is not yet valid."
  }
}
```

**Cause**: Cached token expired (shouldn't happen if cache timeout is 50 min)

**Solution**:
1. This is usually temporary - retry send
2. If persists, check system clock is synchronized (OAuth depends on accurate time)
3. Check firewall isn't blocking `login.microsoftonline.com`

---

## 🔒 Security Best Practices

**✅ DO**:
- Rotate client secret every 12-24 months
- Store `.env.local` securely (never commit to Git)
- Use dedicated sender mailbox (not personal mailbox)
- Monitor audit logs for unexpected email activity
- Review API permissions annually

**❌ DO NOT**:
- Share client secret in chat, email, or docs
- Commit `.env.local` to version control
- Use production credentials in development
- Grant more permissions than needed (only Mail.Send)

---

## 📊 Monitoring & Maintenance

### Token Expiration

**Client Secret Expiration**:
- Default: 24 months
- Warning: Azure sends notification email 30 days before expiry
- Action: Create new secret, update `.env.local`, restart app

**Access Token Expiration**:
- Lifetime: 60 minutes
- Cached by app for 50 minutes (automatic)
- No manual maintenance needed

---

### Permission Review

**Quarterly Review**:
1. Azure Portal → App Registration → API permissions
2. Verify only "Mail.Send" is granted
3. Check for any unexpected permission additions
4. Review audit logs for suspicious activity

---

## 🎯 Setup Completion Checklist

Phase 002E.3 Microsoft Graph setup is complete when:

✅ App Registration created in Azure  
✅ Application (client) ID copied  
✅ Directory (tenant) ID copied  
✅ Client Secret created and copied  
✅ Mail.Send permission added  
✅ Admin consent granted (green checkmark)  
✅ Sender mailbox exists and licensed  
✅ `.env.local` created with all 4 required variables  
✅ App restarted successfully  
✅ Test email sent and received  
✅ Attachment opens correctly  
✅ Audit log entry created  

---

## 📞 Support Resources

**Microsoft Documentation**:
- Azure App Registration: https://learn.microsoft.com/azure/active-directory/develop/quickstart-register-app
- Microsoft Graph Mail API: https://learn.microsoft.com/graph/api/user-sendmail
- Graph API Permissions: https://learn.microsoft.com/graph/permissions-reference

**ERP Support**:
- Review `ERP_BASE_002E_3_SECURITY_AND_AUDIT_PLAN.md` for security guidance
- Check audit logs: Admin → Audit Logs → Filter by "email"
- Contact system administrator if errors persist

---

**Guide Status**: ✅ COMPLETE  
**Next Document**: `ERP_BASE_002E_3_IMPLEMENTATION_SEQUENCE.md`  

---

**Guide End**
