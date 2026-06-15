# ERP BASE 002E.3 — Risk Register
## Comprehensive Risk Analysis for Email Integration

**Phase**: 002E.3 - Send by Email Engine (PLANNING)  
**Generated**: 2026-05-27  
**Author**: AI Risk Management & Security Analyst  
**Status**: ✅ RISK ANALYSIS COMPLETE

---

## 🎯 Risk Assessment Framework

**Likelihood**: LOW (1) | MEDIUM (2) | HIGH (3)  
**Impact**: LOW (1) | MEDIUM (2) | HIGH (3) | CRITICAL (4)  
**Risk Score**: Likelihood × Impact  

**Priority**:
- 🔴 CRITICAL (9-12): Address immediately
- 🟠 HIGH (6-8): Address before launch
- 🟡 MEDIUM (3-5): Monitor and mitigate
- 🟢 LOW (1-2): Accept or defer

---

## 🔴 CRITICAL RISKS (Score 9-12)

### RISK-001: Microsoft Credentials Exposed to Client

**Category**: Security  
**Likelihood**: MEDIUM (2) - Common mistake in Next.js  
**Impact**: CRITICAL (4) - Full account compromise  
**Risk Score**: 8 🟠 HIGH  

**Description**:
Developer accidentally uses `NEXT_PUBLIC_` prefix for Microsoft credentials, exposing tenant ID, client ID, or client secret to browser.

**Consequences**:
- Attacker can obtain access token
- Attacker can send emails as the company
- Reputation damage from spam/phishing emails
- M365 account lockout possible

**Mitigation**:
- ✅ **Preventive**: Use `.env.local` without `NEXT_PUBLIC_` prefix
- ✅ **Detective**: Code review checks for `NEXT_PUBLIC_MICROSOFT`
- ✅ **Detective**: Automated search in codebase: `grep -r "NEXT_PUBLIC_MICROSOFT" src/`
- ✅ **Corrective**: Rotate credentials immediately if exposed
- ✅ **Corrective**: Add to `.gitignore` and Git history cleanup if committed

**Acceptance Criteria**:
- No environment variables with `NEXT_PUBLIC_MICROSOFT` prefix
- TypeScript types enforce server-only access (`process.env` not in client components)
- Code review checklist includes credential exposure check

---

### RISK-002: Attachment Size Causes Memory Overflow

**Category**: Performance / Availability  
**Likelihood**: MEDIUM (2) - Possible with large exports  
**Impact**: HIGH (3) - Server crash  
**Risk Score**: 6 🟠 HIGH  

**Description**:
User exports 10,000+ rows as Excel, generating 50+ MB attachment. Base64 encoding doubles size (100+ MB). Server runs out of memory or request times out.

**Consequences**:
- Server action timeout (default 60s)
- Out of memory error (Node.js heap limit)
- Server crash (affects all users)
- Poor user experience (loading forever, then error)

**Mitigation**:
- ✅ **Preventive**: Client-side size limit (10 MB default)
- ✅ **Preventive**: Server-side size validation (double-check)
- ✅ **Preventive**: Warn user before generating large export ("500+ rows may be slow")
- ✅ **Corrective**: Clear error message: "Attachment too large. Please select fewer records."
- ✅ **Future**: Implement server-side generation (Phase 002E.4) to avoid base64 bloat

**Acceptance Criteria**:
- Client validates attachment size before sending
- Server validates attachment size in server action
- Error message actionable ("Select fewer records" not "Error 500")

---

## 🟠 HIGH RISKS (Score 6-8)

### RISK-003: OAuth Token Expired Mid-Send

**Category**: Reliability  
**Likelihood**: LOW (1) - Cached tokens valid 50 min  
**Impact**: HIGH (3) - Email send failure  
**Risk Score**: 3 🟡 MEDIUM  

**Description**:
Cached OAuth token expires between token acquisition and sendMail API call (race condition).

**Consequences**:
- Email send fails with "InvalidAuthenticationToken"
- User receives generic error message
- User may retry (works on retry because new token acquired)

**Mitigation**:
- ✅ **Preventive**: Cache tokens for only 50 minutes (10-minute safety buffer)
- ✅ **Preventive**: Validate token expiry before each use
- ✅ **Corrective**: Automatic retry on 401 error (clear cache, re-acquire token, retry once)
- ✅ **Detective**: Log token acquisition failures for monitoring

**Acceptance Criteria**:
- Token cache expires at 50 minutes (not 60)
- Retry logic implemented for authentication errors
- Maximum 1 automatic retry (prevent infinite loop)

---

### RISK-004: RLS Bypass via Direct Server Action Call

**Category**: Security  
**Likelihood**: LOW (1) - Requires technical knowledge  
**Impact**: HIGH (3) - Data exfiltration  
**Risk Score**: 3 🟡 MEDIUM  

**Description**:
Attacker crafts direct POST request to server action, bypassing client-side RLS filtering. Sends data for records they don't have access to.

**Consequences**:
- Attacker can email data from other companies
- Data leakage to unauthorized recipients
- Compliance violation (GDPR, SOC 2)

**Mitigation**:
- ✅ **Preventive**: Permission check in server action (`hasPermission(ctx, "organizations.view")`)
- ⚠️ **Limitation**: Server action receives data as JSON (doesn't re-query database)
- ⚠️ **Known Issue**: If attacker has valid session but sends data they shouldn't have, server won't detect
- ✅ **Future Enhancement** (Phase 002E.4): Re-query database to verify record IDs before sending

**Acceptance Criteria**:
- Server action checks user permission for module
- Document limitation in security plan
- Plan Phase 002E.4 enhancement for ID verification

**Risk Acceptance**:
- ✅ ACCEPTED for Phase 002E.3 (internal admin users only, low risk)
- 📝 Documented for Phase 002E.4 enhancement

---

### RISK-005: Audit Log Table Growth

**Category**: Performance / Storage  
**Likelihood**: HIGH (3) - Guaranteed over time  
**Impact**: MEDIUM (2) - Slow queries, storage cost  
**Risk Score**: 6 🟠 HIGH  

**Description**:
Email sends create audit log entries. Heavy usage (1000+ emails/month) causes `audit_logs` table to grow unbounded. Queries slow down, storage increases.

**Consequences**:
- Admin → Audit Logs page becomes slow (> 5 seconds)
- Database storage costs increase
- Backup times increase
- RLS policy queries slow down

**Mitigation**:
- ✅ **Preventive**: Index on `created_at` column (should already exist from Phase 002D)
- ✅ **Preventive**: Pagination on audit log page (implemented in Phase 002E.2A)
- ✅ **Future**: Implement audit log archival (Phase 003) - move logs > 90 days to archive table
- ✅ **Future**: Implement retention policy (delete logs > 1 year after archival)

**Acceptance Criteria**:
- Verify index on `audit_logs.created_at` exists
- Pagination working on audit log page (default: 50 per page)
- Document archival plan for Phase 003

---

## 🟡 MEDIUM RISKS (Score 3-5)

### RISK-006: Microsoft Graph API Throttling

**Category**: Reliability  
**Likelihood**: LOW (1) - Requires high volume  
**Impact**: MEDIUM (2) - Temporary send failure  
**Risk Score**: 2 🟢 LOW  

**Description**:
Microsoft Graph enforces rate limits (exact limits not publicly documented, but typically 10,000 requests/hour per app). If many users send emails simultaneously, API returns 429 Too Many Requests.

**Consequences**:
- Email send fails temporarily
- User receives error: "Service temporarily unavailable"
- User must retry manually

**Mitigation**:
- ✅ **Preventive**: Internal admin users only (low volume expected)
- ✅ **Corrective**: Return clear error message: "Email service busy. Please try again in a few minutes."
- ✅ **Future**: Implement exponential backoff retry (Phase 002E.4)
- ✅ **Future**: Implement email queue (Phase 002E.4)

**Acceptance Criteria**:
- Error message for 429 is user-friendly
- Document future rate limiting plan
- Monitor for 429 errors in logs

**Risk Acceptance**:
- ✅ ACCEPTED for Phase 002E.3 (low volume expected)

---

### RISK-007: Sender Mailbox Not Found After Deployment

**Category**: Configuration  
**Likelihood**: MEDIUM (2) - Common setup mistake  
**Impact**: MEDIUM (2) - Email feature broken  
**Risk Score**: 4 🟡 MEDIUM  

**Description**:
Developer configures `MICROSOFT_MAIL_SENDER=noreply@company.com`, but mailbox doesn't exist or isn't licensed in M365.

**Consequences**:
- All email sends fail with "MailboxNotFound"
- Users frustrated by persistent errors
- IT team must troubleshoot Azure/M365 config

**Mitigation**:
- ✅ **Preventive**: Setup guide explicitly requires mailbox verification (Step 8)
- ✅ **Preventive**: Test email send during Phase 002E.3F (live test)
- ✅ **Detective**: Clear error message: "Email service configuration error. Contact administrator."
- ✅ **Detective**: Log error code to server console for admin troubleshooting

**Acceptance Criteria**:
- Setup guide includes mailbox verification step
- Live test (002E.3F) catches this before production
- Error message doesn't expose sender email address to user

---

### RISK-008: Base64 Encoding Doubles Attachment Size

**Category**: Performance  
**Likelihood**: HIGH (3) - Inherent to Base64  
**Impact**: LOW (1) - Slight overhead  
**Risk Score**: 3 🟡 MEDIUM  

**Description**:
Base64 encoding increases binary data size by ~33%. A 7.5 MB PDF becomes 10 MB as base64. This counts against Microsoft Graph attachment limit (25 MB per message typically).

**Consequences**:
- Effective attachment limit is ~18 MB (not 25 MB)
- Larger request payloads (slower send)
- More memory usage in Node.js

**Mitigation**:
- ✅ **Preventive**: Client-side size limit set to 10 MB (safe buffer)
- ✅ **Informative**: User sees size limit as 10 MB (not confusing with Graph's 25 MB)
- ✅ **Future**: Server-side generation avoids base64 (direct binary to Graph API)

**Acceptance Criteria**:
- Client size limit enforced before base64 encoding
- Error message shows size limit as 10 MB
- Document base64 overhead for future optimization

**Risk Acceptance**:
- ✅ ACCEPTED for Phase 002E.3 (10 MB limit sufficient for most use cases)

---

### RISK-009: Email Body Contains Sensitive Data

**Category**: Security / Privacy  
**Likelihood**: MEDIUM (2) - User error possible  
**Impact**: MEDIUM (2) - Data leakage  
**Risk Score**: 4 🟡 MEDIUM  

**Description**:
User copies/pastes sensitive data (passwords, tokens, PII) into email body. Email is sent unencrypted over recipient's email provider (if they use Gmail, etc.).

**Consequences**:
- Sensitive data exposed to recipient email provider
- Compliance risk (GDPR, HIPAA)
- Data leakage if email intercepted or recipient compromised

**Mitigation**:
- ✅ **Preventive**: Default email body template doesn't include sensitive placeholders
- ✅ **Informative**: (Future) Add tooltip: "Do not include passwords or sensitive data in email"
- ⚠️ **Limitation**: Cannot programmatically detect all sensitive data (user responsibility)
- ✅ **Detective**: Audit logs record email sends (can trace if incident occurs)

**Acceptance Criteria**:
- Default template is safe (no sensitive placeholders)
- User education (internal training) on secure email practices
- Audit logging enables incident investigation

**Risk Acceptance**:
- ✅ ACCEPTED with user education (standard email security practice)

---

### RISK-010: Export Function Regression

**Category**: Quality / Stability  
**Likelihood**: LOW (1) - Separate functions created  
**Impact**: MEDIUM (2) - Existing downloads broken  
**Risk Score**: 2 🟢 LOW  

**Description**:
While implementing attachment generation functions, developer accidentally modifies existing export download functions (`exportToCSV`, `exportToExcel`, `exportToPDF`), breaking current export feature.

**Consequences**:
- Users can't download exports anymore
- Regression discovered only in browser testing (not caught by TypeScript)
- Rollback or hotfix required

**Mitigation**:
- ✅ **Preventive**: Create separate functions (`generate-attachment.ts` separate from `csv.ts`, `excel.ts`, `pdf.ts`)
- ✅ **Preventive**: Do not modify existing export functions
- ✅ **Preventive**: Code review checks existing exports still work
- ✅ **Detective**: Manual browser test for download exports before Phase 002E.3 completion

**Acceptance Criteria**:
- Attachment generation in separate file (`generate-attachment.ts`)
- Existing export files (`csv.ts`, `excel.ts`, `pdf.ts`) unchanged
- Browser test confirms downloads still work (PDF/Excel/CSV)

---

## 🟢 LOW RISKS (Score 1-2)

### RISK-011: Email Delivery Delay

**Category**: User Experience  
**Likelihood**: LOW (1) - Rare with Microsoft 365  
**Impact**: LOW (1) - Slight inconvenience  
**Risk Score**: 1 🟢 LOW  

**Description**:
Microsoft Graph accepts email (returns 202) but delivery is delayed by several minutes due to server load or recipient mail server issues.

**Consequences**:
- User expects email immediately, but recipient receives after 5-10 minutes
- User may think email failed and retry (duplicate emails)

**Mitigation**:
- ✅ **Informative**: Toast message: "Email sent successfully" (not "Email delivered")
- ✅ **Informative**: (Future) Add tooltip: "Email may take a few minutes to deliver"

**Risk Acceptance**:
- ✅ ACCEPTED (standard email behavior, user expectation management)

---

### RISK-012: Token Rotation Downtime

**Category**: Availability  
**Likelihood**: LOW (1) - Once every 12-24 months  
**Impact**: LOW (1) - Brief outage  
**Risk Score**: 1 🟢 LOW  

**Description**:
Client secret expires (24-month default). If admin doesn't rotate before expiry, all email sends fail until new secret is created and deployed.

**Consequences**:
- All email sends fail for ~10-30 minutes (until admin updates secret)
- Users frustrated by sudden failure

**Mitigation**:
- ✅ **Preventive**: Azure sends notification email 30 days before expiry
- ✅ **Preventive**: Document secret rotation procedure in setup guide
- ✅ **Preventive**: Set calendar reminder for secret rotation
- ✅ **Corrective**: Fast secret rotation (Steps 5 + 9 in setup guide)

**Risk Acceptance**:
- ✅ ACCEPTED (low frequency, manageable with calendar reminder)

---

### RISK-013: HTML Injection in Email Body

**Category**: Security (Low Impact)  
**Likelihood**: HIGH (3) - Users can input HTML  
**Impact**: LOW (1) - Limited scope  
**Risk Score**: 3 🟡 MEDIUM (but LOW priority)  

**Description**:
User enters HTML or script tags in email body (e.g., `<script>alert('xss')</script>`). Microsoft Graph sends as-is.

**Consequences**:
- Recipient email client may render HTML (formatted text)
- Script tags stripped by recipient email client (Outlook/Gmail sanitize)
- No risk to sender ERP system (Graph API doesn't execute code)

**Mitigation**:
- ✅ **Informative**: No mitigation needed (recipient email clients sanitize)
- ⚠️ **Note**: If user intentionally sends formatted HTML, it's a feature not a bug

**Risk Acceptance**:
- ✅ ACCEPTED (recipient email client responsibility to sanitize)

---

## 📊 Risk Summary Matrix

| Risk ID | Risk Name | L | I | Score | Priority | Mitigated? |
|---------|-----------|---|---|-------|----------|------------|
| RISK-001 | Credentials Exposed | 2 | 4 | 8 | 🟠 HIGH | ✅ Yes |
| RISK-002 | Memory Overflow | 2 | 3 | 6 | 🟠 HIGH | ✅ Yes |
| RISK-003 | Token Expired | 1 | 3 | 3 | 🟡 MED | ✅ Yes |
| RISK-004 | RLS Bypass | 1 | 3 | 3 | 🟡 MED | ⚠️ Partial |
| RISK-005 | Audit Log Growth | 3 | 2 | 6 | 🟠 HIGH | ✅ Yes |
| RISK-006 | API Throttling | 1 | 2 | 2 | 🟢 LOW | ✅ Yes |
| RISK-007 | Mailbox Not Found | 2 | 2 | 4 | 🟡 MED | ✅ Yes |
| RISK-008 | Base64 Overhead | 3 | 1 | 3 | 🟡 MED | ✅ Yes |
| RISK-009 | Sensitive Body Data | 2 | 2 | 4 | 🟡 MED | ⚠️ Partial |
| RISK-010 | Export Regression | 1 | 2 | 2 | 🟢 LOW | ✅ Yes |
| RISK-011 | Delivery Delay | 1 | 1 | 1 | 🟢 LOW | ✅ Yes |
| RISK-012 | Token Rotation | 1 | 1 | 1 | 🟢 LOW | ✅ Yes |
| RISK-013 | HTML Injection | 3 | 1 | 3 | 🟡 MED | ✅ Yes |

**L** = Likelihood, **I** = Impact

---

## 🎯 Risk Mitigation Acceptance Criteria

Phase 002E.3 risk mitigation is complete when:

✅ All HIGH priority risks addressed before launch  
✅ RISK-001: No `NEXT_PUBLIC_` Microsoft credentials  
✅ RISK-002: Size limits enforced (client + server)  
✅ RISK-003: Token cache timeout set to 50 minutes  
✅ RISK-004: Permission checks in server action (RLS limitation documented)  
✅ RISK-005: Pagination implemented, archival plan documented  
✅ MEDIUM priority risks accepted or mitigated  
✅ LOW priority risks accepted  
✅ Code review checklist includes risk checks  
✅ Browser testing validates mitigations  

---

## 📋 Future Risk Monitoring

**Phase 002E.4 Enhancements**:
- RISK-004: Implement server-side record ID verification
- RISK-006: Implement exponential backoff for rate limits
- RISK-002: Implement server-side attachment generation (avoid base64 overhead)

**Phase 003 Enhancements**:
- RISK-005: Implement audit log archival (90-day retention in main table)

**Ongoing**:
- Monitor audit logs for suspicious email activity
- Review Azure App Registration permissions quarterly
- Rotate client secret every 12-24 months
- Monitor error rates for RISK-006 (throttling)

---

**Report Status**: ✅ COMPLETE  
**All Planning Documents**: ✅ COMPLETE (8/8)  
**Phase 002E.3 Planning**: ✅ READY FOR IMPLEMENTATION  

---

**Report End**
