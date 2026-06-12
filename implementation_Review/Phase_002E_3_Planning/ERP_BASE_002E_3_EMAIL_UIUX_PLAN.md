# ERP BASE 002E.3 — Email UI/UX Plan
## Dialog Component Design for Send by Email

**Phase**: 002E.3 - Send by Email Engine (PLANNING)  
**Generated**: 2026-05-27  
**Author**: AI UX Designer & Email Workflow Specialist  
**Status**: ✅ PLANNING COMPLETE

---

## 🎯 UI/UX Objectives

1. **Simple**: Minimal fields, clear purpose
2. **Fast**: Pre-fill where possible, keyboard navigation
3. **Safe**: Validation before sending, clear error messages
4. **Informative**: Show what will be sent (preview)
5. **Consistent**: Match existing ERP drawer/dialog patterns

---

## 📐 Component Location

**New File**:
```
src/components/erp/email/erp-send-email-dialog.tsx
```

**Component Name**: `ERPSendEmailDialog`

---

## 🎨 Dialog Structure

### Visual Layout

```
┌──────────────────────── Send by Email ────────────────────────┐
│                                                                │
│  Send Report: Organizations Master Data                       │
│  2 selected records • PDF Attachment • 156 KB                 │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ To: *                                                    │ │
│  │ manager@company.com; hr@company.com                     │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ CC: (optional)                                           │ │
│  │                                                          │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ BCC: (optional)                                          │ │
│  │                                                          │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Subject: *                                               │ │
│  │ Organizations Report - 2026-05-27                        │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Message: *                                               │ │
│  │ Please find attached the organizations report.           │ │
│  │                                                          │ │
│  │                                                          │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                                │
│  Attachment Format: * ⚪ PDF  ⚪ Excel  ⚪ CSV               │
│                                                                │
│  📎 organizations_2026-05-27.pdf (156 KB)                     │
│                                                                │
│  ────────────────────────────────────────────────────────────│
│                                              [Cancel] [Send]  │
└────────────────────────────────────────────────────────────────┘
```

---

## 📋 Field Specifications

### 1. Report Title (Read-Only Display)

**Format**: `"Send Report: {title}"`

**Source**: From table `exportConfig.title`

**Examples**:
- "Send Report: Organizations Master Data"
- "Send Report: User Directory"
- "Send Report: Audit Log History"

---

### 2. Export Summary Line (Read-Only Display)

**Format**: `"{count} {mode} • {format} Attachment • {size}"`

**Examples**:
- "2 selected records • PDF Attachment • 156 KB"
- "15 filtered records • Excel Attachment • 342 KB"
- "All 42 records • CSV Attachment • 28 KB"

**Color Coding** (Future):
- Selected: Blue badge
- Filtered: Yellow badge
- All: Green badge

---

### 3. To Field (Required, Multiple)

**Type**: Text area (auto-expanding)

**Validation**:
- ✅ At least 1 email required
- ✅ Email format validation (regex)
- ✅ Max 20 total recipients (To + CC + BCC)
- ✅ Duplicate removal across To/CC/BCC
- ❌ Empty not allowed

**Input Format**: Comma, semicolon, or newline separated

**Examples**:
```
manager@company.com, hr@company.com
```
```
manager@company.com;
hr@company.com
```

**Error Messages**:
- "At least one recipient is required"
- "Invalid email address: xyz@"
- "Too many recipients (max 20)"

---

### 4. CC Field (Optional, Multiple)

**Type**: Text area (auto-expanding)

**Validation**: Same as To (except not required)

---

### 5. BCC Field (Optional, Multiple)

**Type**: Text area (auto-expanding)

**Validation**: Same as To (except not required)

**Tooltip**: "Recipients in BCC won't see each other's addresses"

---

### 6. Subject Field (Required)

**Type**: Single-line input

**Default Value**: `"{Module} Report - {Date}"`

**Examples**:
- "Organizations Report - 2026-05-27"
- "User Directory - 2026-05-27"
- "Audit Log History - 2026-05-27"

**Validation**:
- ✅ Required
- ✅ Max 255 characters
- ❌ Empty not allowed

**Error Messages**:
- "Subject is required"
- "Subject too long (max 255 characters)"

---

### 7. Message Body (Required)

**Type**: Multiline textarea (4-6 rows)

**Default Value**:
```
Please find attached the {module} report.

Generated by: {userName}
Date: {timestamp}

Best regards
```

**Validation**:
- ✅ Required
- ✅ Max 10,000 characters
- ❌ Empty not allowed

**HTML vs Plain Text**:
- Default format: **HTML** (for styling in email)
- Newlines converted to `<br>` tags
- Simple formatting supported (bold/italic - future)

**Error Messages**:
- "Message body is required"
- "Message too long (max 10,000 characters)"

---

### 8. Attachment Format Selector (Required)

**Type**: Radio buttons (horizontal layout)

**Options**:
- ⚪ PDF (default)
- ⚪ Excel
- ⚪ CSV

**Behavior**:
- Default selection: PDF
- Clicking radio generates attachment preview immediately (or on dialog open)

---

### 9. Attachment Preview (Read-Only Display)

**Format**: `📎 {filename} ({size})`

**Example**: `📎 organizations_2026-05-27.pdf (156 KB)`

**Styling**: Gray background box, slightly inset

**Purpose**: Confirms what will be attached

---

## 🔄 Component States

### 1. Initial (Idle)

**Behavior**:
- Dialog opens
- Fields populated with defaults
- Attachment preview generated
- Send button enabled if To + Subject + Message filled
- Focus on To field

---

### 2. Generating Attachment

**Trigger**: User changes attachment format radio button

**Behavior**:
- Disable attachment format radio (briefly)
- Show spinner next to attachment preview
- Generate new attachment
- Update preview (filename + size)
- Re-enable radio

**Duration**: 100-500ms

---

### 3. Validating

**Trigger**: User clicks Send button

**Behavior**:
- Validate all fields
- Show inline error messages for invalid fields
- If valid, proceed to Sending state
- If invalid, remain in Idle, highlight errors

---

### 4. Sending

**Trigger**: Validation passed, server action called

**Behavior**:
- Disable all input fields
- Disable Send button
- Show loading spinner on Send button
- Change button text: "Sending..."
- Prevent dialog close (Escape/backdrop click disabled)

**Duration**: 1-2 seconds typically

---

### 5. Sent (Success)

**Trigger**: Server action returns success

**Behavior**:
- Close dialog automatically
- Show toast notification: "Email sent successfully to {count} recipients"
- Clear form state
- Return focus to Export menu

**Duration**: Dialog closes immediately

---

### 6. Failed (Error)

**Trigger**: Server action returns error

**Behavior**:
- Keep dialog open
- Re-enable all fields
- Re-enable Send button
- Show error message banner at top of dialog (red background)
- Allow user to fix and retry or cancel

**Error Message Examples**:
- "Failed to send email. Please try again."
- "Email service not configured. Contact administrator."
- "Attachment too large. Please select fewer records."

---

### 7. Provider Not Configured

**Trigger**: Missing environment variables detected

**Behavior**:
- Show disabled state immediately on dialog open
- Display message: "Email service is not configured. Contact your administrator."
- Disable all fields
- Hide Send button or show disabled Send button

---

## 🎨 Styling Guidelines

### Colors

**Primary**: Consistent with ERP theme (`primary` color)
**Success**: Green (#10b981)
**Error**: Red (#ef4444)
**Warning**: Yellow (#f59e0b)
**Muted**: Gray (#9ca3af)

---

### Spacing

**Field Gaps**: 1rem (16px)
**Section Gaps**: 1.5rem (24px)
**Button Spacing**: 0.75rem (12px)

---

### Typography

**Title**: 1.125rem (18px), font-semibold
**Summary Line**: 0.875rem (14px), text-muted-foreground
**Labels**: 0.875rem (14px), font-medium
**Input Text**: 0.875rem (14px)
**Error Messages**: 0.75rem (12px), text-red-500

---

## ⌨️ Keyboard Shortcuts

**Tab**: Navigate between fields
**Shift+Tab**: Navigate backwards
**Ctrl+Enter / Cmd+Enter**: Send email (if valid)
**Escape**: Cancel / Close dialog (if not sending)

---

## 📱 Responsive Behavior

**Desktop (>768px)**: Full width dialog (max-width: 600px)
**Tablet (768px)**: Drawer-style slide from right
**Mobile (<640px)**: Full-screen overlay

---

## 🧪 Validation Rules Summary

| Field | Required | Format | Max Length | Max Count |
|-------|----------|--------|------------|-----------|
| To | ✅ Yes | Email | - | 20 total |
| CC | ❌ No | Email | - | (included in 20) |
| BCC | ❌ No | Email | - | (included in 20) |
| Subject | ✅ Yes | Text | 255 chars | - |
| Body | ✅ Yes | Text | 10,000 chars | - |
| Attachment Format | ✅ Yes | Radio | - | 1 selection |

---

## 🔌 Props Interface

```typescript
export interface ERPSendEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  
  // Data from table
  title: string;
  subtitle?: string;
  filename: string;
  data: any[];
  columns: ERPExportColumn<any>[];
  exportMode: "selected" | "filtered" | "all";
  
  // User context
  generatedBy?: string;
  
  // Callbacks
  onSuccess?: () => void;
  onError?: (error: string) => void;
}
```

---

## 🎯 User Flow

```
1. User selects rows in Organizations table
2. User clicks Export → Send by Email
3. Dialog opens with:
   - To field focused (empty)
   - Subject pre-filled: "Organizations Report - 2026-05-27"
   - Message pre-filled with template
   - PDF format selected
   - Attachment preview showing "organizations_2026-05-27.pdf (156 KB)"
4. User types recipient: "manager@company.com"
5. User clicks Send
6. Validation passes
7. Dialog shows "Sending..." (1-2 seconds)
8. Email sent successfully
9. Dialog closes
10. Toast shows "Email sent successfully to 1 recipient"
11. Audit log entry created
```

---

## 🎯 Acceptance Criteria (UI Component)

Component is complete when:

✅ Dialog opens when called  
✅ Fields pre-populated with defaults  
✅ Email validation works (To/CC/BCC)  
✅ Attachment format selector works  
✅ Attachment preview updates when format changes  
✅ Send button triggers server action  
✅ Loading state shows during send  
✅ Success closes dialog + shows toast  
✅ Error shows message + keeps dialog open  
✅ Keyboard navigation works (Tab, Enter, Escape)  
✅ Responsive on mobile/tablet/desktop  
✅ Consistent styling with ERP theme  

---

**Report Status**: ✅ COMPLETE  
**Code Changes**: ❌ NONE (planning only)  
**Next Document**: `ERP_BASE_002E_3_ATTACHMENT_GENERATION_PLAN.md`  

---

**Report End**
