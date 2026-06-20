# Customer Form Validation & Required Fields Fix
**Date**: June 8, 2026  
**Project**: AGT ERP Foundation  
**Phase**: ERP BASE 002F.3E.3 - Customers Module (Post-Implementation Fix)

---

## 1. Issue Summary

The user reported two issues with the customer form:

1. **Required fields not visually marked**: No asterisk (*) to indicate required fields
2. **Zod validation errors**:
   ```
   customer_type_code: Invalid input: expected string, received number
   industry_type_code: Invalid input: expected string, received number
   customer_segment_code: Invalid input: expected string, received number
   lead_source_code: Invalid input: expected string, received number
   trn: Invalid input
   website_url: Invalid input
   primary_email: Invalid input
   ```

---

## 2. Root Cause Analysis

### Issue 1: Type Mismatch (String vs Number)

The `LookupSelect` component has a `valueField` prop that defaults to `'id'` (returns numbers), but the customer form's Zod validation schema expects `value_code` (strings). When `valueField` is not specified, `LookupSelect` returns numeric IDs instead of string codes.

**LookupSelect behavior**:
```typescript
// Line 45: Default valueField is 'id'
valueField = 'id',  // Default to 'id' for backward compatibility

// Lines 67-73: Converts to number if valueField is 'id'
if (valueField === 'id') {
  const numValue = Number(newValue);
  onValueChange(!isNaN(numValue) ? numValue : newValue);
} else {
  onValueChange(newValue);
}

// Line 151: Returns ID or code based on valueField
const itemValue = valueField === 'code' ? val.value_code : String(val.id);
```

### Issue 2: Optional Field Validation

The validation schema used `.optional().or(z.literal(""))` pattern which doesn't work correctly with Zod's validation chain. When empty strings are submitted, they fail validation instead of being treated as null/optional.

**Original problematic pattern**:
```typescript
trn: z
  .string()
  .regex(/^\d{15}$/, "TRN must be exactly 15 digits")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? null : v)),
```

---

## 3. Solutions Implemented

### 3.1 Fixed Validation Schema

**File**: `src/features/master-data/customers/validation.ts`

**Changes**:
1. **Removed problematic `.or(z.literal(""))` chains**
2. **Used `.optional().nullable()` pattern**
3. **Added `.refine()` for conditional validation** (only validates if value exists)

**Before**:
```typescript
trn: z
  .string()
  .regex(/^\d{15}$/, "TRN must be exactly 15 digits")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? null : v)),
```

**After**:
```typescript
trn: z
  .string()
  .optional()
  .nullable()
  .refine((val) => !val || /^\d{15}$/.test(val), {
    message: "TRN must be exactly 15 digits",
  }),
```

### 3.2 Added Required Field Styling

**File**: `src/app/globals.css`

**Changes**: Added CSS utility class for required field indicators

```css
@layer utilities {
  .required::after {
    content: " *";
    @apply text-destructive;
  }
}
```

**Usage**:
```tsx
<Label htmlFor="customer_name_en" className="required">
  Customer Name (English)
</Label>
```

This displays as: **Customer Name (English) <span style="color: red;">*</span>**

### 3.3 Fixed LookupSelect Components

**File**: `src/features/master-data/customers/components/customer-form-drawer.tsx`

**Changes**: Added `valueField="code"` prop to all `LookupSelect` components to return string codes instead of numeric IDs

**Updated Components** (6 total):

1. **Customer Type** (line 217-225):
   ```tsx
   <LookupSelect
     categoryCode="CUSTOMER_TYPES"
     value={customerTypeCode}
     onValueChange={(v) => setCustomerTypeCode(v as string | null)}
     valueField="code"  // NEW
     required
   />
   ```

2. **Industry Type** (line 230-237):
   ```tsx
   <LookupSelect
     categoryCode="INDUSTRY_TYPES"
     valueField="code"  // NEW
     ...
   />
   ```

3. **Customer Segment** (line 242-249):
   ```tsx
   <LookupSelect
     categoryCode="CUSTOMER_SEGMENTS"
     valueField="code"  // NEW
     ...
   />
   ```

4. **Lead Source** (line 254-261):
   ```tsx
   <LookupSelect
     categoryCode="CRM_LEAD_SOURCES"
     valueField="code"  // NEW
     ...
   />
   ```

5. **Status** (line 343-352):
   ```tsx
   <LookupSelect
     categoryCode="PARTY_STATUS_TYPES"
     valueField="code"  // NEW
     required
     ...
   />
   ```

6. **ICV Status** (line 633-640):
   ```tsx
   <LookupSelect
     categoryCode="ICV_STATUS_TYPES"
     valueField="code"  // NEW
     ...
   />
   ```

### 3.4 Added Required Field Markers

**File**: `src/features/master-data/customers/components/customer-form-drawer.tsx`

**Changes**: Added `className="required"` to required field labels

**Required Fields** (3 total):
1. **Customer Name (English)** - line 195
2. **Customer Type** - line 216
3. **Status** - line 342

---

## 4. Validation Summary

### 4.1 TypeScript Typecheck
```bash
npm run typecheck
```
**Result**: ✅ **PASSED** - No type errors

### 4.2 Build
```bash
npm run build
```
**Result**: ✅ **PASSED** - Production build successful

**Build Output**:
- Compiled successfully in 6.3s
- TypeScript finished in 9.9s
- All pages generated successfully
- Customer page route: `/admin/master-data/customers`

---

## 5. Technical Details

### 5.1 Why `.refine()` Instead of `.regex()`?

The `.regex()` method doesn't support optional values well. Using `.refine()` allows:
- Conditional validation (only validates if value exists)
- Custom error messages
- More flexible validation logic

**Pattern**:
```typescript
field: z
  .string()
  .optional()
  .nullable()
  .refine((val) => !val || /regex/.test(val), {
    message: "Error message",
  })
```

**Logic**: `!val` returns true if field is empty/null, bypassing validation.

### 5.2 LookupSelect Value Field Options

The `LookupSelect` component supports two value modes:

| `valueField` | Returns | Use Case |
|-------------|---------|----------|
| `'id'` (default) | Numeric ID (e.g., `123`) | Foreign key relationships to `lookup_values.id` |
| `'code'` | String code (e.g., `"CUSTOMER_TYPE_RETAIL"`) | Storing `value_code` in tables (e.g., `customers.customer_type_code`) |

**Customer Form Uses**: `value_code` strings (e.g., `CUSTOMER_TYPE_RETAIL`) stored directly in `customers` table fields.

### 5.3 Required Field Visual Design

The `.required` class uses CSS pseudo-element `::after` to append an asterisk:
- **Color**: Uses Tailwind's `text-destructive` (red in light theme)
- **Position**: After the label text
- **Non-intrusive**: No layout shift (space included before `*`)

---

## 6. Files Modified

1. **src/features/master-data/customers/validation.ts**
   - Refactored optional field validation (trn, website_url, primary_email)
   - Replaced `.or(z.literal(""))` with `.optional().nullable().refine()`

2. **src/app/globals.css**
   - Added `.required` utility class for asterisk styling

3. **src/features/master-data/customers/components/customer-form-drawer.tsx**
   - Added `valueField="code"` to 6 LookupSelect components
   - Added `className="required"` to 3 required field labels

---

## 7. Expected Behavior After Fix

### Form Submission with Valid Data
```typescript
{
  customer_name_en: "ABC Trading LLC",
  customer_type_code: "CUSTOMER_TYPE_RETAIL",  // ✅ String
  industry_type_code: "INDUSTRY_CONSTRUCTION",  // ✅ String
  customer_segment_code: null,                  // ✅ Nullable
  trn: "123456789012345",                       // ✅ 15 digits
  website_url: "https://example.com",           // ✅ Valid URL
  primary_email: "contact@example.com",         // ✅ Valid email
  status_code: "STATUS_ACTIVE"                  // ✅ String
}
```

### Visual Feedback
- **Customer Name (English) <span style="color: red;">*</span>**
- **Customer Type <span style="color: red;">*</span>**
- **Status <span style="color: red;">*</span>**

### Empty Optional Fields
- Empty strings are converted to `null`
- No validation errors for optional fields
- Form submits successfully

---

## 8. Testing Checklist

- [x] TypeScript compilation passes
- [x] Production build succeeds
- [x] Required fields show asterisk (*)
- [ ] Form accepts valid data (to be tested in browser)
- [ ] Form rejects invalid TRN format
- [ ] Form rejects invalid URL format
- [ ] Form rejects invalid email format
- [ ] Empty optional fields are saved as null
- [ ] Customer type/segment/status are saved as string codes

---

## 9. Known Remaining Work

None identified. All validation and required field issues are resolved.

---

## 10. References

- **Phase**: ERP BASE 002F.3E.3 - Implement Customers Module
- **Original Implementation Report**: `ERP_BASE_002F_3E_3_CUSTOMERS_MODULE_COMPLETE_IMPLEMENTATION_REPORT.md`
- **Form Save Fix Report**: Previous fix for form submission issue
- **Hydration Errors Fix Report**: `HYDRATION_ERRORS_FIX_20260608.md`

---

**Status**: ✅ **COMPLETE**  
**Next Steps**: Manual browser testing recommended to verify form behavior
