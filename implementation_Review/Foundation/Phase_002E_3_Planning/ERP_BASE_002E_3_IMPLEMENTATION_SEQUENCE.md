# ERP BASE 002E.3 — Implementation Sequence
## Phased Implementation Plan for Email Integration

**Phase**: 002E.3 - Send by Email Engine (PLANNING)  
**Generated**: 2026-05-27  
**Author**: AI Implementation Architect  
**Status**: ✅ SEQUENCE COMPLETE

---

## 🎯 Implementation Strategy

**Approach**: Incremental, testable sub-phases

**Benefits**:
- ✅ Each sub-phase is independently testable
- ✅ Can pause between phases for validation
- ✅ Reduces risk of breaking existing export functionality
- ✅ Clear progress tracking

**Total Sub-Phases**: 6 (002E.3A through 002E.3F)

---

## 📊 Dependency Graph

```
002E.3A (Foundation)
    ↓
002E.3B (Attachments) ← depends on 002E.3A
    ↓
002E.3C (UI) ← depends on 002E.3B
    ↓
002E.3D (Integration) ← depends on 002E.3A + 002E.3C
    ↓
002E.3E (Security & Audit) ← depends on 002E.3D
    ↓
002E.3F (Live Test) ← depends on ALL previous
```

---

## 🔷 Phase 002E.3A — Email Engine Architecture & Microsoft Graph Provider

**Objective**: Build Microsoft Graph provider infrastructure

**Duration Estimate**: 2-3 hours

### Tasks

**1. Create Email Library Structure**

Files to create:
```
src/lib/email/
├── index.ts
├── email-types.ts
├── email-validation.ts
├── email-provider.ts
├── microsoft-graph-provider.ts
└── attachment-utils.ts
```

**2. Implement Type Definitions** (`email-types.ts`)

Types to define:
- `EmailAttachment`
- `EmailRecipient`
- `SendEmailInput`
- `SendEmailResult`
- `EmailProvider` (interface)
- `MicrosoftGraphConfig`

**3. Implement Email Validation** (`email-validation.ts`)

Functions:
- `validateEmail(email: string): boolean` - Regex validation
- `validateRecipients(recipients: EmailRecipient[]): ValidationResult` - Max count, duplicates
- `deduplicateRecipients(input: SendEmailInput): SendEmailInput`
- `parseEmailList(input: string): EmailRecipient[]` - Parse comma/semicolon/newline separated

**4. Implement Microsoft Graph Provider** (`microsoft-graph-provider.ts`)

Class: `MicrosoftGraphProvider implements EmailProvider`

Methods:
- `constructor(config: MicrosoftGraphConfig)`
- `async sendEmail(input: SendEmailInput): Promise<SendEmailResult>`
- `private async getAccessToken(): Promise<string>` - OAuth client credentials
- `private buildRequestBody(input: SendEmailInput): object` - Convert to Graph API format
- `private async callGraphAPI(token: string, body: object): Promise<Response>`

**Token Caching**:
- In-memory cache (class property)
- Cache duration: 50 minutes
- Clear on auth error

**5. Implement Attachment Utils** (`attachment-utils.ts`)

Functions:
- `arrayBufferToBase64(buffer: ArrayBuffer): string`
- `formatBytes(bytes: number): string`
- `validateAttachmentSize(sizeBytes: number, maxMB: number): boolean`

**6. Create Environment Variable Example**

Update `.env.local.example`:
```env
# Microsoft Graph Email Configuration
MICROSOFT_TENANT_ID=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_MAIL_SENDER=noreply@company.com

# Optional: Override defaults
MICROSOFT_GRAPH_BASE_URL=https://graph.microsoft.com/v1.0
MICROSOFT_MAIL_SAVE_TO_SENT_ITEMS=true
MICROSOFT_MAIL_MAX_ATTACHMENT_MB=10
MICROSOFT_MAIL_MAX_RECIPIENTS=20
```

### Acceptance Criteria

✅ All email library files created  
✅ Type definitions complete and exported  
✅ Email validation functions implemented  
✅ Microsoft Graph provider class implemented  
✅ Token caching logic working  
✅ Environment variables documented  
✅ `npm run typecheck` passes  
✅ No imports of these files yet (not integrated)  

### Testing (Manual Smoke Test)

**Terminal Test** (optional):
```typescript
// Create test file: src/lib/email/__test.ts
import { MicrosoftGraphProvider } from "./microsoft-graph-provider";

const config = {
  tenantId: process.env.MICROSOFT_TENANT_ID!,
  clientId: process.env.MICROSOFT_CLIENT_ID!,
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
  senderEmail: process.env.MICROSOFT_MAIL_SENDER!,
};

const provider = new MicrosoftGraphProvider(config);

// Test token acquisition
const token = await provider.getAccessToken();
console.log("Token acquired:", token.substring(0, 20) + "...");

// Delete __test.ts after verification
```

---

## 🔷 Phase 002E.3B — Attachment Generation from Export Engine

**Objective**: Generate email attachments from existing export code

**Duration Estimate**: 1-2 hours

### Tasks

**1. Create Attachment Generation File**

File to create:
```
src/lib/export/generate-attachment.ts
```

**2. Implement CSV Attachment Generator**

Function: `generateCSVAttachment(options: ERPExportOptions): EmailAttachment`

Logic:
- Reuse CSV string generation from `csv.ts`
- Convert string to base64
- Calculate size
- Return `EmailAttachment` object

**3. Implement Excel Attachment Generator**

Function: `generateExcelAttachment(options: ERPExportOptions): EmailAttachment`

Logic:
- Reuse XLSX workbook generation from `excel.ts`
- Generate ArrayBuffer via `XLSX.write()`
- Convert to base64
- Calculate size
- Return `EmailAttachment` object

**4. Implement PDF Attachment Generator**

Function: `generatePDFAttachment(options: ERPExportOptions): EmailAttachment`

Logic:
- Reuse jsPDF generation from `pdf.ts`
- Generate ArrayBuffer via `doc.output('arraybuffer')`
- Convert to base64
- Calculate size
- Return `EmailAttachment` object

**5. Export from index**

Update `src/lib/export/index.ts`:
```typescript
export {
  generateCSVAttachment,
  generateExcelAttachment,
  generatePDFAttachment,
} from "./generate-attachment";
```

### Acceptance Criteria

✅ `generate-attachment.ts` created  
✅ All 3 attachment functions implemented  
✅ Base64 conversion working correctly  
✅ Size calculation accurate  
✅ Filename generation includes timestamp  
✅ MIME types correct (csv, xlsx, pdf)  
✅ `npm run typecheck` passes  
✅ Existing export downloads still work (no regression)  

### Testing

**Browser Console Test**:
```typescript
import { generatePDFAttachment } from "@/lib/export";

const mockData = [
  { id: 1, name: "Test 1" },
  { id: 2, name: "Test 2" },
];

const result = generatePDFAttachment({
  title: "Test",
  filename: "test",
  data: mockData,
  columns: [
    { key: "id", header: "ID" },
    { key: "name", header: "Name" },
  ],
});

console.log("Attachment:", result);
// Expected: { filename: "test_2026-05-27.pdf", contentType: "application/pdf", base64Content: "...", sizeBytes: 1234 }
```

---

## 🔷 Phase 002E.3C — Send Email Dialog UI

**Objective**: Build email compose dialog component

**Duration Estimate**: 2-3 hours

### Tasks

**1. Create Email Component Folder**

```
src/components/erp/email/
└── erp-send-email-dialog.tsx
```

**2. Implement Dialog Component**

Component: `ERPSendEmailDialog`

Props:
- `open: boolean`
- `onOpenChange: (open: boolean) => void`
- `title: string` - Report title
- `filename: string`
- `data: any[]` - Table data
- `columns: ERPExportColumn<any>[]` - Column definitions
- `exportMode: "selected" | "filtered" | "all"`
- `generatedBy?: string`
- `onSuccess?: () => void`
- `onError?: (error: string) => void`

**3. Implement Form Fields**

Fields:
- To (required, textarea, multi-email)
- CC (optional, textarea)
- BCC (optional, textarea)
- Subject (required, input, max 255 chars)
- Body (required, textarea, 4-6 rows, max 10k chars)
- Attachment Format (required, radio: PDF/Excel/CSV)
- Attachment Preview (read-only display)

**4. Implement Client-Side Validation**

Validations:
- Email format (regex)
- Recipient count (max 20)
- Duplicate removal
- Required fields
- Length limits

**5. Implement Attachment Generation**

Logic:
- Generate attachment when dialog opens (default: PDF)
- Regenerate when user changes format radio
- Show loading state during generation
- Display preview: `📎 filename (size KB)`

**6. Implement State Management**

States:
- `idle` - Waiting for user input
- `generating_attachment` - Creating PDF/Excel/CSV
- `validating` - Checking inputs
- `sending` - Calling server action
- `sent` - Success (auto-close)
- `failed` - Error (show message, stay open)

**7. Style with shadcn/ui Components**

Components to use:
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`
- `Input`, `Textarea`, `RadioGroup`, `RadioGroupItem`
- `Label`, `Button`, `Badge`
- `Alert`, `AlertDescription` (for errors)

### Acceptance Criteria

✅ Dialog component created  
✅ All form fields implemented  
✅ Client-side validation working  
✅ Attachment generation integrated  
✅ Attachment preview updates on format change  
✅ Keyboard navigation working (Tab, Escape)  
✅ Loading states display correctly  
✅ Styled consistently with ERP theme  
✅ `npm run typecheck` passes  
✅ Component builds successfully  

### Testing

**Storybook Test** (if available) or **Manual Browser Test**:
1. Open dialog with mock data
2. Verify all fields present
3. Type invalid email → expect error
4. Type valid email → error clears
5. Change attachment format → preview updates
6. Fill all fields → Send button enabled
7. Click Cancel → dialog closes

---

## 🔷 Phase 002E.3D — Export Menu Integration

**Objective**: Add "Send by Email" option to export menu

**Duration Estimate**: 1 hour

### Tasks

**1. Update ERPExportMenu Component**

File: `src/components/erp/export/erp-export-menu.tsx`

Changes:
- Add "Send by Email" menu item (after Export to CSV)
- Add icon: `Mail` from `lucide-react`
- Add state: `emailDialogOpen`
- Pass table data/columns to dialog

**2. Render Email Dialog**

Logic:
```typescript
const [emailDialogOpen, setEmailDialogOpen] = useState(false);

// In render:
<DropdownMenuItem onClick={() => setEmailDialogOpen(true)}>
  <Mail className="mr-2 h-4 w-4" />
  <span>Send by Email</span>
</DropdownMenuItem>

<ERPSendEmailDialog
  open={emailDialogOpen}
  onOpenChange={setEmailDialogOpen}
  title={title}
  filename={filename}
  data={data}
  columns={columns}
  exportMode={exportMode}
  generatedBy={generatedBy}
/>
```

**3. Update ERPDataTable**

File: `src/components/erp/table/erp-data-table.tsx`

Changes:
- Pass `exportMode` to `ERPExportMenu` (already calculated)
- Ensure `data` prop to export menu is from `exportData` (already done)

**4. Create Server Action**

File: `src/server/actions/email.ts`

Function: `sendExportEmail(input: SendExportEmailInput)`

Logic:
1. Get auth context
2. Check permissions
3. Validate input
4. Generate attachment (server-side or accept base64 from client)
5. Call Microsoft Graph provider
6. Log audit (success + failure)
7. Return result

Input Type:
```typescript
type SendExportEmailInput = {
  to: EmailRecipient[];
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  subject: string;
  body: string;
  bodyFormat?: "text" | "html";
  attachmentBase64: string;
  attachmentFilename: string;
  attachmentContentType: string;
  attachmentSizeBytes: number;
  moduleCode: string;
  reportTitle: string;
  recordCount: number;
  exportMode: "selected" | "filtered" | "all";
};
```

### Acceptance Criteria

✅ "Send by Email" menu item added to export menu  
✅ Clicking menu item opens email dialog  
✅ Dialog receives correct table data/columns  
✅ Server action created and exported  
✅ Server action validates input  
✅ Server action calls Microsoft Graph provider  
✅ `npm run typecheck` passes  
✅ `npm run build` succeeds  
✅ No existing export functionality broken  

### Testing

**Browser Test**:
1. Navigate to Organizations page
2. Select 2 rows
3. Click Export → Send by Email
4. Verify dialog opens with 2 selected records
5. Fill email form
6. Click Send
7. Verify server action called (check network tab)

---

## 🔷 Phase 002E.3E — Audit Logging & Security Validation

**Objective**: Implement comprehensive audit logging and validate security

**Duration Estimate**: 1 hour

### Tasks

**1. Implement Audit Logging in Server Action**

File: `src/server/actions/email.ts`

Changes:
- On success: Log `email_send_success` event
- On failure: Log `email_send_failed` event
- Include metadata (to_count, subject, attachment info, module_code)
- Exclude sensitive data (recipient addresses, body, base64)

Example:
```typescript
// On success
await logAudit({
  module_code: "email",
  entity_name: "email_send",
  entity_id: null,
  entity_reference: `${input.reportTitle}_${format(new Date(), "yyyy-MM-dd")}`,
  action: "email_send_success",
  new_values: {
    provider: "microsoft_graph",
    to_count: input.to.length,
    cc_count: input.cc?.length || 0,
    bcc_count: input.bcc?.length || 0,
    subject: input.subject,
    attachment_filename: input.attachmentFilename,
    attachment_type: input.attachmentContentType.includes("pdf") ? "pdf" : input.attachmentContentType.includes("excel") || input.attachmentContentType.includes("spreadsheet") ? "excel" : "csv",
    attachment_size_kb: Math.round(input.attachmentSizeBytes / 1024),
    module_code: input.moduleCode,
    record_count: input.recordCount,
    export_mode: input.exportMode,
  },
});
```

**2. Validate Environment Variables**

Logic in server action:
```typescript
const requiredEnvVars = [
  "MICROSOFT_TENANT_ID",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_MAIL_SENDER",
];

const missing = requiredEnvVars.filter(v => !process.env[v]);
if (missing.length > 0) {
  return {
    success: false,
    error: "Email service not configured. Contact administrator.",
  };
}
```

**3. Validate Attachment Size**

```typescript
const maxSizeMB = Number(process.env.MICROSOFT_MAIL_MAX_ATTACHMENT_MB) || 10;
const maxSizeBytes = maxSizeMB * 1024 * 1024;

if (input.attachmentSizeBytes > maxSizeBytes) {
  await logAudit({ /* email_send_failed */ });
  return {
    success: false,
    error: `Attachment too large (${formatBytes(input.attachmentSizeBytes)}). Max: ${maxSizeMB} MB.`,
  };
}
```

**4. Security Review Checklist**

Verify:
- ✅ No `NEXT_PUBLIC_` Microsoft env vars
- ✅ Tokens never logged
- ✅ Client secret never logged
- ✅ Recipient addresses never logged to audit
- ✅ Email body never logged to audit
- ✅ Base64 attachment never logged
- ✅ Error messages don't expose credentials

### Acceptance Criteria

✅ Audit logging implemented for success  
✅ Audit logging implemented for failure  
✅ Audit logs exclude sensitive data  
✅ Environment variable validation working  
✅ Attachment size validation enforced  
✅ Security review checklist completed  
✅ `.env.local` in `.gitignore` confirmed  
✅ `.env.local.example` created  

### Testing

**Audit Log Verification**:
1. Send test email successfully
2. Navigate to Admin → Audit Logs
3. Filter by action: "email_send_success"
4. Verify entry exists with correct metadata
5. Verify no recipient addresses in log

**Security Test**:
1. Open browser DevTools → Network
2. Send email
3. Verify no tokens in response
4. Verify no client secret in response

---

## 🔷 Phase 002E.3F — Microsoft Graph Live Test

**Objective**: End-to-end testing with real Microsoft Graph API

**Duration Estimate**: 30 minutes - 1 hour

### Prerequisites

✅ Azure App Registration created  
✅ Mail.Send permission granted  
✅ `.env.local` configured with real credentials  
✅ Sender mailbox exists and licensed  

### Tasks

**1. Azure Configuration Verification**

Follow `ERP_BASE_002E_3_MICROSOFT_GRAPH_SETUP_GUIDE.md`:
- Steps 1-8 completed
- Admin consent status: ✅ Granted

**2. Restart Application**

```bash
# Stop dev server
Ctrl+C

# Clear cache
rm -rf .next

# Restart
npm run dev
```

**3. Test Case 1: Single Recipient PDF**

Steps:
1. Navigate to Organizations
2. Select 1 row
3. Export → Send by Email
4. To: Your work email
5. Subject: "Test Email 1 - PDF"
6. Body: "Testing PDF attachment"
7. Format: PDF
8. Send

Expected:
- ✅ Email received within 1 minute
- ✅ PDF attachment opens correctly
- ✅ Audit log entry created

**4. Test Case 2: Multiple Recipients Excel**

Steps:
1. Select 3 rows
2. Export → Send by Email
3. To: email1@company.com, email2@company.com
4. CC: email3@company.com
5. Subject: "Test Email 2 - Excel"
6. Format: Excel
7. Send

Expected:
- ✅ All recipients receive email
- ✅ Excel attachment opens correctly

**5. Test Case 3: CSV with Filters**

Steps:
1. Apply global search: "Alliance"
2. Don't select rows (use filtered)
3. Export → Send by Email
4. To: Your email
5. Subject: "Test Email 3 - Filtered CSV"
6. Format: CSV
7. Send

Expected:
- ✅ CSV contains only filtered records

**6. Test Case 4: Size Limit**

Steps:
1. Select 500+ rows (if available)
2. Export → Send by Email
3. Format: Excel
4. Expect error: "Attachment too large"

**7. Test Case 5: Invalid Email**

Steps:
1. To: "notanemail"
2. Expect validation error: "Invalid email address"

**8. Test Case 6: Missing Permission**

Steps:
1. Log in as user with no "organizations.view" permission
2. Attempt to send email from Organizations page
3. Expect error: "Insufficient permissions"

### Acceptance Criteria

✅ Test Case 1 passed (PDF sent & received)  
✅ Test Case 2 passed (multiple recipients)  
✅ Test Case 3 passed (filtered data)  
✅ Test Case 4 passed (size validation)  
✅ Test Case 5 passed (email validation)  
✅ Test Case 6 passed (permission check)  
✅ No console errors  
✅ No server errors  
✅ Audit logs created for all sends  

---

## 📊 Implementation Timeline

| Sub-Phase | Duration | Cumulative |
|-----------|----------|------------|
| 002E.3A | 2-3 hours | 2-3 hours |
| 002E.3B | 1-2 hours | 3-5 hours |
| 002E.3C | 2-3 hours | 5-8 hours |
| 002E.3D | 1 hour | 6-9 hours |
| 002E.3E | 1 hour | 7-10 hours |
| 002E.3F | 30 min - 1 hour | 7.5-11 hours |

**Total Estimated Time**: 7.5 - 11 hours (1-2 working days)

---

## 🎯 Phase 002E.3 Completion Criteria

Phase 002E.3 is fully complete when:

✅ All 6 sub-phases (A-F) completed  
✅ Microsoft Graph provider functional  
✅ Email dialog working correctly  
✅ Export menu integration successful  
✅ Audit logging implemented  
✅ Security review passed  
✅ Live test with real Microsoft Graph successful  
✅ All 5 admin pages support email  
✅ `npm run typecheck` passes  
✅ `npm run build` succeeds  
✅ Browser validation completed (all test cases passed)  

---

## 🔄 Next Phase

After Phase 002E.3 completion, proceed to:

**Phase 002E.4** (Future):
- Email templates
- Draft workflow
- Multiple attachments
- Scheduled sends

**Phase 002F** (Future):
- App settings backend
- Company letterhead integration
- Custom email headers/footers

---

**Report Status**: ✅ COMPLETE  
**Code Changes**: ❌ NONE (planning only)  
**Next Document**: `ERP_BASE_002E_3_RISK_REGISTER.md`  

---

**Report End**
