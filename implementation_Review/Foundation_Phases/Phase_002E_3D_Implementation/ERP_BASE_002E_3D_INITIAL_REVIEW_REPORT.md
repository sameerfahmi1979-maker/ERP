# ERP BASE 002E.3D — Initial Review Report
## Export Menu Integration & Server Action Analysis

**Phase**: 002E.3D - Export Menu Integration + Server Action  
**Status**: ✅ **REVIEW COMPLETE**  
**Date**: 2026-05-28  
**Reviewer**: AI Microsoft Graph Integration Engineer & Server Action Specialist  

---

## 🎯 Review Objective

Analyze existing components to design and implement:
1. Server action for sending emails via Microsoft Graph
2. Integration of email dialog into export menu
3. Wire attachment generation to email sending
4. Implement audit logging for email sends
5. Handle Microsoft Graph configuration errors gracefully

---

## 📋 Files Reviewed

### Export System (Phase 002E.2)

**1. `src/components/erp/export/erp-export-menu.tsx`** (206 lines)

**Current Behavior**:
- Client component with dropdown menu
- Supports Print, PDF, Excel, CSV exports
- Uses `handleExport()` function for each type
- Shows loading state with `isExporting` + `exportType`
- Uses `toast` for success/error notifications (sonner)
- Disabled when no data
- Props include: title, filename, data, columns, subtitle, filters, generatedBy, orientation

**Key Props**:
```typescript
export interface ERPExportMenuProps<T = any> {
  title: string;
  filename: string;
  data: T[];
  columns: ERPExportColumn<T>[];
  subtitle?: string;
  filters?: Record<string, unknown>;
  disabled?: boolean;
  generatedBy?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  showText?: boolean;
  orientation?: "portrait" | "landscape";
}
```

**Export Flow**:
```typescript
const handleExport = async (type: "csv" | "excel" | "pdf" | "print") => {
  setIsExporting(true);
  setExportType(type);
  
  const options: ERPExportOptions<T> = {
    title, subtitle, filename, columns, data,
    generatedBy, generatedAt: new Date(), filters, orientation,
  };
  
  // Calls exportToCSV(), exportToExcel(), exportToPDF(), or exportToPrint()
  // Shows toast on success/error
  
  setIsExporting(false);
  setExportType(null);
};
```

**Integration Points**:
- ✅ Already uses `toast` (sonner) - consistent with email notifications
- ✅ Already has loading state pattern - reusable for email sending
- ✅ Already passes all export options - can reuse for attachment generation
- ✅ Uses `DropdownMenuGroup` + `DropdownMenuItem` - safe pattern established

**What We Need to Add**:
1. New "Send by Email" menu item after "Export to CSV"
2. State for email dialog open/close
3. Handler for email dialog `onSend` callback
4. Call to server action
5. Toast notifications for email send success/failure

---

### Email Dialog UI (Phase 002E.3C)

**2. `src/components/erp/email/erp-send-email-dialog.tsx`** (397 lines)

**Current Behavior**:
- Opens dialog for email composition
- Validates To/CC/BCC, subject, body
- Generates attachment on format change
- Shows attachment preview
- **Currently**: Calls `onPreparedSend` callback + shows `alert()`
- **Does NOT send email** (Phase 002E.3C limitation)

**Current Props**:
```typescript
export type ERPSendEmailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  defaultSubject?: string;
  defaultBody?: string;
  attachmentOptions: AttachmentOption[];
  defaultAttachmentType?: AttachmentFormat;
  generatedBy?: string;
  recordCount?: number;
  exportMode?: "selected" | "filtered" | "all";
  moduleCode?: string;
  onPreparedSend?: (input: PreparedEmailInput) => void; // ← Currently no-op
};
```

**What We Need to Change**:
1. Make `onPreparedSend` async: `Promise<{ success: boolean; error?: string }>`
2. Remove `alert()` (Phase 002E.3C testing code)
3. Show loading state while sending
4. Handle success/error from callback
5. Close dialog on success
6. Keep form open on error (allow retry)

**Backward Compatibility**: Keep `onPreparedSend` name to minimize changes

---

### Email Types (Phase 002E.3C)

**3. `src/components/erp/email/email-types-ui.ts`** (87 lines)

**Types Available**:
```typescript
export type PreparedEmailInput = {
  to: string;        // Raw comma-separated emails
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  attachmentType: AttachmentFormat;
  attachment?: EmailAttachment | null;
};
```

**What We Need**:
- Convert `PreparedEmailInput` to `SendEmailInput` (from `email-types.ts`)
- Parse email strings to `EmailRecipient[]` arrays
- Add context metadata (moduleCode, recordCount, exportMode)

---

### Email Foundation (Phase 002E.3A)

**4. `src/lib/email/email-types.ts`** (91 lines)

**Types Available**:
```typescript
export type SendEmailInput = {
  to: EmailRecipient[];        // Array of {email, name?}
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  subject: string;
  body: string;
  bodyFormat?: "text" | "html";
  attachments: EmailAttachment[];
  saveToSentItems?: boolean;
};

export type SendEmailResult = {
  success: boolean;
  provider: "microsoft_graph";
  error?: string;
  statusCode?: number;
  graphErrorCode?: string;
};
```

**What We Need**:
- Use `SendEmailInput` for server action input
- Use `SendEmailResult` for server action output
- Convert string arrays to `EmailRecipient[]` arrays

---

**5. `src/lib/email/email-validation.ts`** (178 lines)

**Helpers Available**:
- ✅ `validateEmail(email: string): boolean`
- ✅ `parseEmailList(input: string): EmailRecipient[]`
- ✅ `deduplicateRecipients(input: SendEmailInput): SendEmailInput`
- ✅ `validateSendEmailInput(input: SendEmailInput, config: MicrosoftGraphConfig): {valid, errors}`

**Usage in Server Action**:
```typescript
import { parseEmailList, deduplicateRecipients, validateSendEmailInput } from "@/lib/email/email-validation";
```

---

**6. `src/lib/email/microsoft-graph-config.ts`** (server-only)

**Config Loader**:
```typescript
export function getMicrosoftGraphConfig(): MicrosoftGraphConfigResult {
  // Returns: { configured: boolean, config?: MicrosoftGraphConfig, missing: string[] }
}
```

**Behavior**:
- Reads from environment variables
- Returns `configured: false` if any required env vars missing
- Lists missing env vars in `missing` array

**Server Action Usage**:
```typescript
const configResult = getMicrosoftGraphConfig();
if (!configResult.configured) {
  return {
    success: false,
    error: "Email service is not configured. Please contact administrator.",
    // Do NOT expose missing env var names to client
  };
}
```

---

**7. `src/lib/email/microsoft-graph-provider.ts`** (server-only)

**Provider Class**:
```typescript
export class MicrosoftGraphProvider implements EmailProvider {
  constructor(config: MicrosoftGraphConfig) {}
  
  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    // OAuth token acquisition
    // API call to graph.microsoft.com/v1.0/users/{sender}/sendMail
    // Error handling
  }
}
```

**Server Action Usage**:
```typescript
const provider = new MicrosoftGraphProvider(config);
const result = await provider.sendEmail(emailInput);
```

---

### Audit Logging (Existing)

**8. `src/server/actions/audit.ts`** (137 lines)

**Audit Logger**:
```typescript
export type AuditLogParams = {
  module_code: string;
  entity_name: string;
  entity_id: number | null;
  entity_reference: string;
  action: string;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  owner_company_id?: number | null;
  branch_id?: number | null;
};

export async function logAudit(params: AuditLogParams): Promise<AuditLogResult>
```

**Current Limitations**:
- Requires `entity_name`, `entity_id`, `entity_reference` (email doesn't have entity)
- `old_values` / `new_values` not suitable for email metadata

**Workaround for Phase 002E.3D**:
```typescript
await logAudit({
  module_code: moduleCode || "email",
  entity_name: "email_send",
  entity_id: null,
  entity_reference: subject.substring(0, 50),
  action: result.success ? "email_send_success" : "email_send_failed",
  new_values: {
    to_count: to.length,
    cc_count: cc?.length || 0,
    bcc_count: bcc?.length || 0,
    attachment_filename: attachment.filename,
    attachment_size_bytes: attachment.sizeBytes,
    record_count: context?.recordCount,
    export_mode: context?.exportMode,
    error: result.error,
  },
});
```

**Phase 002E.3E Enhancement**: May add dedicated `email_logs` table

---

### RBAC (Existing)

**9. `src/lib/rbac/check.ts`** (99 lines)

**RBAC Pattern**:
```typescript
export async function getAuthContext(): Promise<AuthContext> {
  // Returns: { profile, roleCodes, permissionCodes }
}

export function hasPermission(ctx: AuthContext, requiredPermission: string): boolean {
  // Checks if user has permission
  // system_admin gets "erp.admin" (all permissions)
}
```

**Permission Strategy for Email**:
- **Option 1**: Reuse existing view permission (e.g., `organizations.view`)
  - Rationale: If user can view/export data, they can email it
  - Simple, no new permissions needed
- **Option 2**: Add dedicated `email.send` permission (Phase 002E.3E)
  - Rationale: More granular control
  - Requires permission migration

**Phase 002E.3D Decision**: Use Option 1 (reuse view permission)

**Server Action Implementation**:
```typescript
const ctx = await getAuthContext();

// Prefer module-specific permission if available
const requiredPermission = moduleCode ? `${moduleCode}.view` : "erp.admin";

if (!hasPermission(ctx, requiredPermission)) {
  return {
    success: false,
    error: "Permission denied: You do not have permission to send emails",
    statusCode: 403,
  };
}
```

---

### Server Action Pattern (Existing)

**10. Example: `src/server/actions/organizations.ts`**

**Pattern Observed**:
```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "./audit";
import { revalidatePath } from "next/cache";

export async function someAction(input: SomeInput): Promise<SomeResult> {
  try {
    // 1. Get auth context
    const ctx = await getAuthContext();
    
    // 2. Check permission
    if (!hasPermission(ctx, "organizations.view")) {
      return { success: false, error: "Permission denied" };
    }
    
    // 3. Validate input
    // ...
    
    // 4. Perform operation
    // ...
    
    // 5. Log audit
    await logAudit({
      module_code: "organizations",
      entity_name: "owner_companies",
      entity_id: result.id,
      entity_reference: result.company_code,
      action: "create",
      new_values: { /* ... */ },
    });
    
    // 6. Revalidate path (if needed)
    revalidatePath("/admin/organizations");
    
    return { success: true, data: result };
  } catch (error) {
    console.error("[someAction] Error:", error);
    return { success: false, error: String(error) };
  }
}
```

**Pattern for Email Server Action**:
1. ✅ Use `"use server"` directive
2. ✅ Get auth context
3. ✅ Check permission
4. ✅ Validate input server-side
5. ✅ Load Microsoft Graph config
6. ✅ Call provider
7. ✅ Log audit
8. ❌ No `revalidatePath` needed (no cache invalidation for email)

---

## 🧩 Integration Design

### Server Action: `sendExportEmail`

**File to Create**: `src/server/actions/email.ts`

**Function Signature**:
```typescript
export async function sendExportEmail(input: SendExportEmailInput): Promise<SendEmailResult>
```

**Input Type**:
```typescript
type SendExportEmailInput = {
  to: string[];              // Parsed from dialog
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  attachment: EmailAttachment;
  context?: {
    moduleCode?: string;
    recordCount?: number;
    exportMode?: "selected" | "filtered" | "all";
  };
};
```

**Output Type**: Reuse `SendEmailResult` from `email-types.ts`

**Flow**:
1. Get auth context
2. Check permission (use `moduleCode.view` or fallback to `erp.admin`)
3. Load Microsoft Graph config (handle missing config gracefully)
4. Convert string arrays to `EmailRecipient[]`
5. Build `SendEmailInput`
6. Validate using `validateSendEmailInput()`
7. Deduplicate using `deduplicateRecipients()`
8. Create `MicrosoftGraphProvider`
9. Send email via `provider.sendEmail()`
10. Log audit
11. Return result

---

### Export Menu Changes

**File to Modify**: `src/components/erp/export/erp-export-menu.tsx`

**Changes**:
1. Add imports:
   ```typescript
   import { MailPlus } from "lucide-react";
   import { ERPSendEmailDialog } from "@/components/erp/email/erp-send-email-dialog";
   import { sendExportEmail } from "@/server/actions/email";
   import { generatePDFAttachment, generateExcelAttachment, generateCSVAttachment } from "@/lib/export";
   import { parseEmailList } from "@/lib/email/email-validation";
   import type { PreparedEmailInput } from "@/components/erp/email/email-types-ui";
   import type { EmailAttachment } from "@/lib/email/email-types";
   import { format } from "date-fns";
   ```

2. Add state:
   ```typescript
   const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
   const [isSendingEmail, setIsSendingEmail] = useState(false);
   ```

3. Add "Send by Email" menu item:
   ```typescript
   <DropdownMenuSeparator />
   <DropdownMenuItem
     onClick={() => setIsEmailDialogOpen(true)}
     disabled={isExporting || isSendingEmail}
     className="cursor-pointer"
   >
     <MailPlus className="mr-2 h-4 w-4" />
     <span>Send by Email</span>
   </DropdownMenuItem>
   ```

4. Add email dialog:
   ```typescript
   <ERPSendEmailDialog
     open={isEmailDialogOpen}
     onOpenChange={setIsEmailDialogOpen}
     title={title}
     subtitle={subtitle}
     defaultSubject={`${title} - ${format(new Date(), "yyyy-MM-dd")}`}
     attachmentOptions={[
       {
         type: "pdf",
         label: "PDF",
         filename: filename,
         generateAttachment: () => generatePDFAttachment({
           title, subtitle, filename, columns, data,
           generatedBy, generatedAt: new Date(), filters, orientation,
         }),
       },
       {
         type: "excel",
         label: "Excel",
         filename: filename,
         generateAttachment: () => generateExcelAttachment({ /* ... */ }),
       },
       {
         type: "csv",
         label: "CSV",
         filename: filename,
         generateAttachment: () => generateCSVAttachment({ /* ... */ }),
       },
     ]}
     recordCount={data.length}
     exportMode="all" // TODO: Add exportMode prop to ERPExportMenuProps
     generatedBy={generatedBy}
     moduleCode="organizations" // TODO: Add moduleCode prop to ERPExportMenuProps
     onPreparedSend={handleSendEmail}
   />
   ```

5. Add email send handler:
   ```typescript
   const handleSendEmail = async (input: PreparedEmailInput) => {
     if (!input.attachment) {
       toast.error("No attachment generated");
       return { success: false, error: "No attachment" };
     }
     
     setIsSendingEmail(true);
     
     try {
       const result = await sendExportEmail({
         to: input.to.split(/[,;\n]/).map(e => e.trim()).filter(e => e),
         cc: input.cc ? input.cc.split(/[,;\n]/).map(e => e.trim()).filter(e => e) : undefined,
         bcc: input.bcc ? input.bcc.split(/[,;\n]/).map(e => e.trim()).filter(e => e) : undefined,
         subject: input.subject,
         body: input.body,
         attachment: input.attachment,
         context: {
           moduleCode: "organizations", // TODO: From prop
           recordCount: data.length,
           exportMode: "all", // TODO: From state
         },
       });
       
       if (result.success) {
         toast.success("Email sent successfully!");
         setIsEmailDialogOpen(false);
       } else {
         toast.error(result.error || "Failed to send email");
       }
       
       return result;
     } catch (error) {
       console.error("[ERPExportMenu] Send email error:", error);
       toast.error("Failed to send email. Please try again.");
       return { success: false, error: String(error) };
     } finally {
       setIsSendingEmail(false);
     }
   };
   ```

---

### Email Dialog Changes

**File to Modify**: `src/components/erp/email/erp-send-email-dialog.tsx`

**Changes**:
1. Update `onPreparedSend` prop to async:
   ```typescript
   onPreparedSend?: (input: PreparedEmailInput) => Promise<{ success: boolean; error?: string }>;
   ```

2. Remove `alert()` (line ~287):
   ```typescript
   // DELETE:
   alert(`[Phase 002E.3C] Email prepared successfully!...`);
   ```

3. Update `handlePreparedSend` to await callback:
   ```typescript
   const [isSending, setIsSending] = useState(false);
   
   const handlePreparedSend = async () => {
     setHasAttemptedSubmit(true);
     
     if (!validateForm()) {
       return;
     }
     
     if (!attachment || !onPreparedSend) {
       return;
     }
     
     setIsSending(true);
     
     try {
       const result = await onPreparedSend(preparedInput);
       
       if (result.success) {
         // Close dialog (parent will show success toast)
         onOpenChange(false);
       } else {
         // Show error but keep dialog open (allow retry)
         // Parent already showed toast
       }
     } catch (error) {
       console.error("[ERPSendEmailDialog] Send error:", error);
       // Parent already showed toast
     } finally {
       setIsSending(false);
     }
   };
   ```

4. Update Send button:
   ```typescript
   <Button
     onClick={handlePreparedSend}
     disabled={isGeneratingAttachment || isSending || (hasAttemptedSubmit && Object.keys(validationErrors).length > 0)}
   >
     <Send className="h-4 w-4 mr-2" />
     {isSending ? "Sending..." : "Send Email"}
   </Button>
   ```

5. Disable form while sending:
   ```typescript
   disabled={isSending}
   ```

---

## 🔒 Security Analysis

### Secrets Protection
- ✅ Microsoft credentials in `.env.local` (server-only)
- ✅ Server action uses `"use server"` directive
- ✅ No client access to credentials
- ✅ Config loader returns generic error if missing (doesn't expose env var names)

### Permission Checks
- ✅ Server action checks RBAC permission
- ✅ Falls back to `erp.admin` if moduleCode missing
- ✅ Returns 403 error if permission denied

### Input Validation
- ✅ Client-side validation (Phase 002E.3C)
- ✅ Server-side validation (using `validateSendEmailInput`)
- ✅ Attachment size checked
- ✅ Recipient count checked

### Audit Logging
- ✅ Email sends logged
- ✅ Failures logged
- ❌ Attachment content NOT logged (too large, privacy)
- ❌ Email body NOT logged (privacy)

### RLS/Database
- ✅ No database schema changes
- ✅ No RLS modifications
- ✅ Uses existing audit log table (safe)

---

## 🎯 Implementation Risks

### Risk 1: Microsoft Graph Config Missing
**Likelihood**: High (first-time setup)  
**Impact**: Low (graceful error handling)  
**Mitigation**: Return clear error message, don't crash

### Risk 2: Large Attachments (>10 MB)
**Likelihood**: Medium  
**Impact**: Medium (email fails)  
**Mitigation**: Server-side size check, client warning at >8 MB

### Risk 3: Email Format Issues (Unicode, newlines)
**Likelihood**: Low  
**Impact**: Low (Graph API handles)  
**Mitigation**: Use plain text for Phase 002E.3D

### Risk 4: Audit Log Schema Mismatch
**Likelihood**: Low  
**Impact**: Low (audit fails but email sends)  
**Mitigation**: Catch audit errors, don't fail email

### Risk 5: Toast Library Not Imported
**Likelihood**: Very Low (already used in export menu)  
**Impact**: Very Low (compilation error)  
**Mitigation**: Already verified `sonner` imported

---

## ✅ Implementation Plan

### Step 1: Create Server Action
- ✅ Create `src/server/actions/email.ts`
- ✅ Implement `sendExportEmail()` function
- ✅ Handle Microsoft Graph config loading
- ✅ Implement permission check
- ✅ Implement validation
- ✅ Implement audit logging
- ✅ Handle errors gracefully

### Step 2: Update Email Dialog
- ✅ Change `onPreparedSend` to async
- ✅ Remove `alert()`
- ✅ Add `isSending` state
- ✅ Update Send button (loading state)
- ✅ Disable form while sending
- ✅ Handle success/error from callback

### Step 3: Update Export Menu
- ✅ Add "Send by Email" menu item
- ✅ Add email dialog state
- ✅ Add attachment options
- ✅ Implement `handleSendEmail()` callback
- ✅ Call server action
- ✅ Show toasts

### Step 4: Validation & Testing
- ✅ Run `npm run typecheck`
- ✅ Run `npm run build`
- ✅ Test without Microsoft credentials (error handling)
- ✅ Test with credentials (if available)

### Step 5: Generate Reports
- ✅ Initial Review (this document)
- ✅ Implementation Report
- ✅ Email Send Validation Report
- ✅ Security Review Report
- ✅ Next Steps Report

---

## 📚 Ready to Proceed

**Estimated Implementation Time**: ~2-3 hours  
**Estimated Lines of Code**: ~350 lines  

**Files to Create**: 1
- `src/server/actions/email.ts` (~200 lines)

**Files to Modify**: 2
- `src/components/erp/export/erp-export-menu.tsx` (+100 lines)
- `src/components/erp/email/erp-send-email-dialog.tsx` (~50 line changes)

**Dependencies**:
- ✅ All Phase 002E.3A-3C components ready
- ✅ All helpers available
- ✅ RBAC pattern understood
- ✅ Audit pattern understood
- ✅ Server action pattern understood

**Risk Level**: **LOW** (clear patterns, no database changes)

---

**Report Status**: ✅ COMPLETE  
**Implementation Plan**: ✅ APPROVED  
**Ready for Coding**: ✅ YES  

---

**Report End**
