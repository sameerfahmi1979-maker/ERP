# ERP Base Phase 002E.1B — Runtime Error Analysis Report

**Generated:** 2026-05-27 19:55 UTC+4  
**Status:** ✅ ERROR RESOLVED  
**Task:** Analyze and document the Base UI MenuGroupContext runtime error

---

## 1. Error Summary

**Error Message:**
```
Base UI: MenuGroupContext is missing. Menu group parts must be used within <MenuGroup> or <MenuRadioGroup>.
```

**Impact:** Application crashed on load when accessing `/admin/organizations` or `/admin/branches`

**Status:** ✅ **RESOLVED** in Phase 002E.1A

---

## 2. Root Cause Analysis

### 2.1 Technical Root Cause

The project uses **Base UI** (not Radix UI) for dropdown menus. In `src/components/ui/dropdown-menu.tsx`:

```tsx
function DropdownMenuLabel({...props}: MenuPrimitive.GroupLabel.Props) {
  return <MenuPrimitive.GroupLabel {...props} />
}
```

`MenuPrimitive.GroupLabel` **requires** a parent `MenuPrimitive.Group` context. Using `DropdownMenuLabel` directly inside `DropdownMenuContent` throws a context error.

### 2.2 Error Locations

**Primary Source:** `src/components/erp/erp-drawer-form.tsx` (line 146)
```tsx
<DropdownMenuContent>
  <DropdownMenuLabel>Export Document</DropdownMenuLabel>  {/* ❌ No wrapper */}
  <DropdownMenuItem>...</DropdownMenuItem>
</DropdownMenuContent>
```

**Secondary Sources:**
- `src/features/organizations/organizations-table.tsx` (line 130)
- `src/features/branches/branches-table.tsx` (line 136)

Both tables had the same incorrect pattern in their actions dropdowns.

### 2.3 Why The Error Occurred

During Antigravity drawer implementation, the developer assumed standard shadcn/Radix dropdown structure:
```tsx
<DropdownMenuContent>
  <DropdownMenuLabel>...</DropdownMenuLabel>  {/* Works in Radix */}
</DropdownMenuContent>
```

However, this project uses **Base UI**, which requires:
```tsx
<DropdownMenuContent>
  <DropdownMenuGroup>  {/* ✅ Required wrapper */}
    <DropdownMenuLabel>...</DropdownMenuLabel>
  </DropdownMenuGroup>
</DropdownMenuContent>
```

---

## 3. Affected Components

### 3.1 ERPDrawerHeader (Primary Issue)

**File:** `src/components/erp/erp-drawer-form.tsx`  
**Component:** `ERPDrawerHeader`  
**Lines:** 139-164 (before fix)

**Impact:**  
- All forms using ERPDrawerForm crashed on open
- Organizations Add/Edit drawer non-functional
- Branches Add/Edit drawer non-functional
- Users Add/Edit drawer non-functional
- Roles Add/Edit drawer non-functional

### 3.2 OrganizationsTable (Secondary Issue)

**File:** `src/features/organizations/organizations-table.tsx`  
**Component:** Row actions dropdown  
**Line:** 130

**Impact:**  
- Organization list page loaded
- Clicking "..." actions button crashed the page

### 3.3 BranchesTable (Secondary Issue)

**File:** `src/features/branches/branches-table.tsx`  
**Component:** Row actions dropdown  
**Line:** 136

**Impact:**  
- Branch list page loaded
- Clicking "..." actions button crashed the page

---

## 4. Fix Applied (Phase 002E.1A)

### 4.1 Drawer Header Fix

**Strategy:** Option A (Simplest and Safest)  
**Action:** Replaced broken dropdown with disabled placeholder button

**Before:**
```tsx
<DropdownMenu>
  <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuLabel>Export Document</DropdownMenuLabel>
    <DropdownMenuItem onClick={onPrint}>Print</DropdownMenuItem>
    {/* ... more items */}
  </DropdownMenuContent>
</DropdownMenu>
```

**After:**
```tsx
<Button
  type="button"
  variant="outline"
  size="sm"
  disabled
  title="Export and email actions will be enabled in Phase 002E.3"
>
  <Printer className="h-3.5 w-3.5" />
  <span>Actions</span>
</Button>
```

**Rationale:**
- Export/email actions not yet implemented (Phase 002E.3)
- Placeholder button safer than broken dropdown
- Aligns with Antigravity plan (features deferred to Phase 2)

### 4.2 Table Dropdowns Fix

**Strategy:** Option B (Correct Base UI Structure)  
**Action:** Added `DropdownMenuGroup` wrapper

**Before:**
```tsx
<DropdownMenuContent>
  <DropdownMenuLabel>Actions</DropdownMenuLabel>
  <DropdownMenuItem>Edit</DropdownMenuItem>
</DropdownMenuContent>
```

**After:**
```tsx
<DropdownMenuContent>
  <DropdownMenuGroup>  {/* ✅ Added */}
    <DropdownMenuLabel>Actions</DropdownMenuLabel>
    <DropdownMenuItem>Edit</DropdownMenuItem>
  </DropdownMenuGroup>
</DropdownMenuContent>
```

**Imports Updated:**
```tsx
import {
  DropdownMenuGroup,  // ✅ Added
  // ... other imports
} from "@/components/ui/dropdown-menu";
```

---

## 5. Validation Results

### 5.1 Post-Fix Validation

✅ **TypeScript:** Passes  
✅ **Build:** Passes  
✅ **Dev Server:** Running without errors  
✅ **Organizations Page:** Loads successfully  
✅ **Branches Page:** Loads successfully  
✅ **Drawers Open:** All forms open correctly  
✅ **Table Actions:** Dropdowns work correctly  
✅ **No Console Errors:** Clean browser console

### 5.2 Regression Testing

✅ **Organization CRUD:** Create/Edit/Delete work  
✅ **Branch CRUD:** Create/Edit/Delete work  
✅ **User CRUD:** Add/Edit/Assign Role work  
✅ **Role CRUD:** Create/Edit/View Details work

---

## 6. Future Restoration Plan (Phase 002E.3)

When implementing export/email in Phase 002E.3, restore the dropdown with **correct Base UI structure**:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuGroup>  {/* ✅ Critical: Required wrapper */}
      <DropdownMenuLabel>Export Document</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onPrint}>Print Record</DropdownMenuItem>
      <DropdownMenuItem onClick={onExportPDF}>Download PDF</DropdownMenuItem>
      <DropdownMenuItem onClick={onExportExcel}>Download Excel</DropdownMenuItem>
      <DropdownMenuItem onClick={onExportCSV}>Download CSV</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onSendEmail}>Send via Email</DropdownMenuItem>
    </DropdownMenuGroup>
  </DropdownMenuContent>
</DropdownMenu>
```

---

## 7. Lessons Learned

1. **Base UI ≠ Radix UI:** Project uses Base UI with different context requirements
2. **Always Check Component Definitions:** Review `src/components/ui/*` before using
3. **Group Wrappers Required:** Base UI menu labels need group context
4. **Placeholder Strategy:** Disabled buttons safer than broken dropdowns for unimplemented features
5. **Global Search:** Check all uses of `DropdownMenuLabel` across codebase

---

## 8. Conclusion

**Error:** ✅ Fully resolved  
**Cause:** Base UI context requirement not met  
**Fix:** Drawer actions simplified to disabled placeholder; table dropdowns corrected with group wrappers  
**Impact:** Zero — All CRUD workflows functional, no data loss  
**Prevention:** Document Base UI requirements, add to implementation checklist

---

**End of Runtime Error Analysis Report**
