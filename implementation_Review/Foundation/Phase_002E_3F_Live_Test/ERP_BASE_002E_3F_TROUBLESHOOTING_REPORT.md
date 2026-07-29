# ERP BASE 002E.3F — Troubleshooting Report
## Email Send Issues & Resolution Guide

**Phase**: 002E.3F - Microsoft Graph Live Email Test  
**Status**: 📚 **REFERENCE GUIDE** (for when credentials are configured)  
**Date**: 2026-05-28  
**Author**: AI Troubleshooting Specialist & Microsoft Graph Expert  

---

## 🎯 Purpose

This report documents common Microsoft Graph email sending issues and their resolutions to assist administrators and developers when live testing begins.

---

## 🚫 Current Status: Configuration Missing

**Primary Issue**: Microsoft Graph credentials not configured

**Symptoms**:
- User clicks "Send Email" → Toast error: "Email service is not configured. Please contact administrator."
- No email sent
- Audit log: `email_send_failed` with reason "Microsoft Graph not configured"

**Resolution**: Complete Azure App Registration setup (see Initial Review Report for step-by-step guide)

---

## 📋 Troubleshooting Matrix

### Issue T1: `invalid_client` Error

**Symptom**:
- Email send fails
- Toast error: "Failed to send email"
- Server log: `invalid_client` or `AADSTS7000215`

**Root Causes**:
1. **Wrong Client ID** - `MICROSOFT_CLIENT_ID` does not match Azure app registration
2. **Wrong Client Secret** - `MICROSOFT_CLIENT_SECRET` is incorrect or expired
3. **Wrong Tenant ID** - `MICROSOFT_TENANT_ID` does not match Azure tenant

**Resolution Steps**:
1. Go to Azure Portal → Azure AD → App registrations
2. Find your app registration
3. **Verify Client ID**:
   - Copy Application (client) ID from Overview page
   - Compare with `MICROSOFT_CLIENT_ID` in `.env.local`
   - Update if mismatch
4. **Verify Tenant ID**:
   - Copy Directory (tenant) ID from Overview page
   - Compare with `MICROSOFT_TENANT_ID` in `.env.local`
   - Update if mismatch
5. **Regenerate Client Secret** (if expired/wrong):
   - Go to Certificates & secrets
   - Delete old secret (if exists)
   - Create new client secret
   - Copy secret value immediately ⚠️ (shown only once)
   - Update `MICROSOFT_CLIENT_SECRET` in `.env.local`
6. **Restart dev server**: `npm run dev`
7. **Test again**

**Prevention**:
- Store client secret securely (password manager, Azure Key Vault)
- Set client secret expiration reminder (before 24 months)
- Document secret rotation process

---

### Issue T2: `insufficient_privileges` or `Authorization_RequestDenied`

**Symptom**:
- Email send fails
- Toast error: "Failed to send email"
- Server log: `insufficient_privileges`, `Authorization_RequestDenied`, or `AADSTS65001`

**Root Causes**:
1. **Missing `Mail.Send` permission** - Permission not added to app registration
2. **Admin consent not granted** - Permission added but not consented by admin
3. **Wrong permission type** - Using delegated permission instead of application permission

**Resolution Steps**:
1. Go to Azure Portal → Azure AD → App registrations → Your app
2. Click "API permissions"
3. **Verify `Mail.Send` permission present**:
   - Should see: Microsoft Graph → Mail.Send (Application)
   - If missing, click "Add a permission" → Microsoft Graph → Application permissions → Search "Mail.Send" → Add
4. **Grant admin consent**:
   - Look for yellow warning: "Not granted for {your organization}"
   - Click "Grant admin consent for {your organization}"
   - Confirm in popup
   - Status should change to green checkmark
5. **Wait 5-10 minutes** (permission propagation)
6. **Test again**

**Prevention**:
- Always grant admin consent immediately after adding permissions
- Document required permissions in setup guide
- Include permission verification in setup checklist

---

### Issue T3: `MailboxNotFound` or `ResourceNotFound`

**Symptom**:
- Email send fails
- Toast error: "Failed to send email"
- Server log: `MailboxNotFound`, `ResourceNotFound`, or `AADSTS50001`

**Root Causes**:
1. **Mailbox does not exist** - `MICROSOFT_MAIL_SENDER` email address is invalid
2. **Typo in sender email** - Incorrect spelling in `.env.local`
3. **Mailbox not licensed** - Mailbox exists but has no email license
4. **Shared mailbox not configured** - Shared mailbox not properly set up

**Resolution Steps**:
1. **Verify mailbox exists**:
   - Go to https://admin.microsoft.com
   - Navigate to Users → Active users (for user mailbox)
   - OR Teams & groups → Shared mailboxes (for shared mailbox)
   - Search for `MICROSOFT_MAIL_SENDER` email address
2. **If mailbox missing**:
   - Create user mailbox OR create shared mailbox
   - Assign email license (for user mailbox) OR no license needed (shared mailbox)
   - Wait 10-15 minutes for provisioning
3. **Verify spelling**:
   - Copy email address from Microsoft 365 admin center
   - Paste into `MICROSOFT_MAIL_SENDER` in `.env.local` (no typos)
4. **Restart dev server**: `npm run dev`
5. **Test again**

**Prevention**:
- Use shared mailbox (recommended - no license cost)
- Document mailbox setup in initial review report
- Test mailbox can send/receive before configuring ERP

---

### Issue T4: `MessageSizeExceeded` or `RequestEntityTooLarge`

**Symptom**:
- Email send fails for large attachments
- Toast error: "Failed to send email"
- Server log: `MessageSizeExceeded`, `RequestEntityTooLarge`

**Root Causes**:
1. **Attachment too large** - Exceeds 10 MB (default) or Microsoft Graph limit (25 MB)
2. **Base64 encoding overhead** - 33% size increase due to base64
3. **Multiple attachments** - Total size exceeds limit (if Phase 002E.4 implemented)

**Resolution Steps**:
1. **Check attachment size**:
   - In email dialog, observe attachment preview (shows size in KB/MB)
   - If > 10 MB, server will reject
2. **Reduce data selection**:
   - Select fewer rows
   - Hide unnecessary columns
   - Use filtered view instead of "all rows"
3. **Adjust limit** (if needed):
   - Update `MICROSOFT_MAIL_MAX_ATTACHMENT_MB` in `.env.local` (max: 25 MB per Microsoft)
   - Restart dev server
4. **Alternative**: Export to file, upload to SharePoint, send link instead

**Prevention**:
- Warn users about large exports (Phase 002E.3C already shows warning at 8 MB)
- Consider implementing pagination for large datasets (Phase 002E.4+)
- Use CSV instead of PDF/Excel for very large datasets (smaller file size)

---

### Issue T5: `InvalidRecipients` or `InvalidRecipient`

**Symptom**:
- Email send fails
- Toast error: "Failed to send email" or "Invalid email format"
- Server log: `InvalidRecipients`, `InvalidRecipient`

**Root Causes**:
1. **Invalid email format** - Recipient email is malformed
2. **Blocked recipient** - Domain or address blocked by tenant policy
3. **Distribution list not expanded** - DL address not supported (Graph API limitation)

**Resolution Steps**:
1. **Verify email format**:
   - Must be: `user@domain.com`
   - No spaces, no special chars (except `.`, `-`, `_`)
2. **Check for typos**:
   - `user@gmial.com` (typo) → `user@gmail.com` (correct)
3. **Test with known-good recipient**:
   - Send to your own email first
   - If succeeds, original recipient address is issue
4. **Check tenant restrictions**:
   - Microsoft 365 admin may restrict external recipients
   - Contact admin to whitelist domain if needed

**Prevention**:
- Client-side validation already implemented (Phase 002E.3C)
- Server-side validation also checks format (Phase 002E.3D)
- Test with internal recipients first

---

### Issue T6: `ErrorAccessDenied` or `AccessDenied`

**Symptom**:
- Email send fails
- Toast error: "Failed to send email"
- Server log: `ErrorAccessDenied`, `AccessDenied`

**Root Causes**:
1. **Application not allowed to send as mailbox** - Tenant policy restricts app sending
2. **Mailbox sending restrictions** - Mailbox settings block app sending
3. **Conditional Access policy** - Azure AD CA policy blocks service principal

**Resolution Steps**:
1. **Check tenant app policy**:
   - Exchange Online may restrict application sending
   - Contact Microsoft 365 admin to allow app access
2. **Check mailbox permissions**:
   - Ensure app has `Send As` or `Send on Behalf` permissions (if using user mailbox)
   - For shared mailbox, app should have access by default
3. **Check Conditional Access**:
   - Azure AD → Security → Conditional Access
   - Verify no policies block service principal logins
   - May need to exclude app from CA policy
4. **Alternative**: Use delegated permissions (requires user login) instead of application permissions

**Prevention**:
- Use shared mailbox (fewer restrictions)
- Document tenant policy requirements in setup guide
- Test with minimal tenant restrictions first

---

### Issue T7: Token Acquisition Fails (500 Error)

**Symptom**:
- Email send fails immediately
- Toast error: "Failed to send email"
- Server log: `Failed to acquire token`, HTTP 400/500

**Root Causes**:
1. **Network connectivity issue** - Cannot reach `login.microsoftonline.com`
2. **Firewall blocking** - Corporate firewall blocks OAuth endpoints
3. **DNS resolution failure** - Cannot resolve Microsoft login domain
4. **TLS/SSL issue** - Certificate validation fails

**Resolution Steps**:
1. **Test network connectivity**:
   ```bash
   curl https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration
   ```
   - Should return JSON config
   - If fails, network/firewall issue
2. **Check firewall rules**:
   - Allow outbound HTTPS (443) to `login.microsoftonline.com`
   - Allow outbound HTTPS (443) to `graph.microsoft.com`
3. **Check DNS**:
   ```bash
   nslookup login.microsoftonline.com
   ```
   - Should resolve to Microsoft IP
4. **Check TLS**:
   - Ensure Node.js can validate Microsoft certificates
   - May need to configure corporate proxy if behind one

**Prevention**:
- Document network requirements in setup guide
- Test connectivity before configuring credentials
- Work with IT/Network team for firewall whitelisting

---

### Issue T8: Email Delivered to Junk/Spam Folder

**Symptom**:
- Email send succeeds (success toast shown)
- Audit log: `email_send_success`
- BUT: Email in recipient Junk folder (not Inbox)

**Root Causes**:
1. **SPF not configured** - Domain SPF record doesn't include Microsoft
2. **DKIM not configured** - Email signature missing
3. **External sender warning** - Triggers spam filter
4. **Recipient spam settings** - User's personal spam filter too aggressive

**Resolution Steps**:
1. **Check email headers** (in Junk folder):
   - Look for `Authentication-Results` header
   - Check SPF, DKIM, DMARC results
2. **Configure SPF record** (if SPF fail):
   - Add Microsoft to your domain's SPF TXT record:
     ```
     v=spf1 include:spf.protection.outlook.com ~all
     ```
   - DNS change may take 24-48 hours
3. **Enable DKIM** (if DKIM fail):
   - Go to Microsoft 365 admin center
   - Security → DKIM
   - Enable for your domain
4. **Train spam filter**:
   - In Outlook, mark email as "Not Junk"
   - Add sender (`MICROSOFT_MAIL_SENDER`) to Safe Senders list
5. **Contact recipient IT**:
   - Ask to whitelist sender domain
   - May need to adjust Exchange Online spam policies

**Prevention**:
- Configure SPF/DKIM before production launch
- Use recognizable sender address (e.g., `noreply@yourcompany.com`)
- Include unsubscribe footer (if sending to external recipients)

---

### Issue T9: Sent Items Folder Not Populated

**Symptom**:
- Email send succeeds
- Recipient receives email
- BUT: Sent Items folder empty (sender mailbox)

**Root Causes**:
1. **Application permission limitation** - App permissions don't save to Sent Items (Microsoft behavior)
2. **Shared mailbox limitation** - Shared mailboxes may not save sent items for app-sent emails
3. **Graph API parameter** - `saveToSentItems: false` in request

**Resolution Steps**:
1. **Verify `saveToSentItems` parameter**:
   - Check `src/lib/email/microsoft-graph-provider.ts`
   - Ensure `buildGraphMessage()` includes:
     ```typescript
     saveToSentItems: this.config.saveToSentItems, // Should be true
     ```
2. **Verify `.env.local` setting**:
   - `MICROSOFT_MAIL_SAVE_TO_SENT_ITEMS=true`
3. **Accept limitation**:
   - This is known Microsoft Graph behavior with application permissions
   - Sent Items may not populate reliably
   - **Workaround**: Use audit log instead (tracks all sent emails)

**Prevention**:
- Document this limitation in user guide
- Rely on audit log for sent email history
- Consider delegated permissions if Sent Items required (requires user login)

---

## 📊 Troubleshooting Flowchart

```
Email send fails
│
├─ Error: "Email service is not configured"
│  └─ Issue T0: Missing credentials → Configure .env.local
│
├─ Error contains "invalid_client" or "AADSTS7000215"
│  └─ Issue T1: Wrong credentials → Verify Client ID/Secret/Tenant ID
│
├─ Error contains "insufficient_privileges" or "Authorization_RequestDenied"
│  └─ Issue T2: Missing permissions → Add Mail.Send, grant admin consent
│
├─ Error contains "MailboxNotFound" or "ResourceNotFound"
│  └─ Issue T3: Mailbox missing → Create mailbox, verify spelling
│
├─ Error contains "MessageSizeExceeded" or "RequestEntityTooLarge"
│  └─ Issue T4: Attachment too large → Reduce selection, adjust limit
│
├─ Error contains "InvalidRecipients" or "InvalidRecipient"
│  └─ Issue T5: Bad email format → Verify recipient address
│
├─ Error contains "ErrorAccessDenied" or "AccessDenied"
│  └─ Issue T6: Tenant policy → Check mailbox permissions, CA policies
│
├─ Error: "Failed to acquire token" (500 error)
│  └─ Issue T7: Network issue → Check firewall, DNS, connectivity
│
├─ Email sent, but in Junk folder
│  └─ Issue T8: Spam filter → Configure SPF/DKIM, whitelist sender
│
└─ Email sent, but not in Sent Items
   └─ Issue T9: App permission limitation → Use audit log instead
```

---

## 🔍 Diagnostic Commands

### Check Microsoft Graph Connectivity
```bash
# Test OAuth endpoint
curl https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration

# Test Graph API endpoint
curl https://graph.microsoft.com/v1.0/
```

### Check DNS Resolution
```bash
# Windows
nslookup login.microsoftonline.com
nslookup graph.microsoft.com

# Linux/Mac
dig login.microsoftonline.com
dig graph.microsoft.com
```

### Check TLS/SSL
```bash
openssl s_client -connect login.microsoftonline.com:443 -servername login.microsoftonline.com
```

### Test Token Acquisition (Manual)
```bash
# Replace {tenant}, {client_id}, {client_secret} with your values
curl -X POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id={client_id}&client_secret={client_secret}&scope=https://graph.microsoft.com/.default&grant_type=client_credentials"
```

Expected response: JSON with `access_token` field

---

## 📋 Support Escalation

### Level 1: ERP Administrator
- Check `.env.local` configuration
- Verify Azure app registration exists
- Verify permissions granted
- Verify mailbox exists

### Level 2: Microsoft 365 Administrator
- Grant admin consent for permissions
- Configure mailbox (user or shared)
- Check tenant policies (Conditional Access, Exchange Online)
- Configure SPF/DKIM records

### Level 3: Network Administrator
- Whitelist Microsoft domains in firewall
- Configure proxy settings (if corporate proxy)
- Check DNS resolution
- Check TLS/SSL connectivity

### Level 4: Microsoft Support
- File ticket at https://admin.microsoft.com → Support → New service request
- Provide:
  - Tenant ID (sanitized)
  - App registration ID (sanitized)
  - Error message (with timestamp)
  - Correlation ID (from Graph API response header)

---

## 🎯 Quick Reference

**Most Common Issues** (90% of cases):
1. ✅ Missing credentials (Issue T0) → Configure `.env.local`
2. ✅ Admin consent not granted (Issue T2) → Grant consent in Azure Portal
3. ✅ Wrong Client Secret (Issue T1) → Regenerate and update

**Microsoft Resources**:
- **Graph API Errors**: https://learn.microsoft.com/en-us/graph/errors
- **Authentication Errors**: https://learn.microsoft.com/en-us/azure/active-directory/develop/reference-error-codes
- **SendMail API**: https://learn.microsoft.com/en-us/graph/api/user-sendmail

---

**Report End**  
**Next Action**: Reference this guide when troubleshooting live email issues
