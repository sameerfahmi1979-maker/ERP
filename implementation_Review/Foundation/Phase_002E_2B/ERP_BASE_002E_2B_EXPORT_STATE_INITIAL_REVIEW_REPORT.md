# ERP BASE 002E.2B — Export/Table-State Initial Review Report

**Phase**: 002E.2B - Fix Export to Respect Table State  
**Generated**: 2026-05-27  
**Author**: AI Lead ERP Engineer & QA Lead  
**Status**: Root Cause Analysis Complete

---

## 1. Executive Summary

The current export system **ignores table state entirely**. When a user:

- ✅ Selects 2 rows → Export still exports all rows
- ✅ Hides 3 columns → Export still exports all columns
- ✅ Searches/filters → Export still exports all rows
- ✅ Sorts descending → Export uses original data order

**Root Cause**: Export data is prepared at the **page level** (server component) from raw database queries, while table state (selection, filtering, sorting, visibility) is managed by **`ERPDataTable`** (client component). There is **no bridge** between them.

---

## 2. Root Cause Analysis

### 2.1 Current Architecture

**Data Flow**:
```
Database Query (page.tsx)
    ↓
All Organizations (server)
    ↓
exportData = organizations.map(...) (server)
    ↓
<ERPExportMenu data={exportData} /> (client)
    ↓
Export ALL data ❌
```

**Table State Flow**:
```
<ERPDataTable data={organizations} /> (client)
    ↓
TanStack Table manages:
    - Selected rows (table.getSelectedRowModel())
    - Filtered rows (table.getFilteredRowModel())
    - Sorted rows (table.getSortedRowModel())
    - Visible columns (table.getVisibleLeafColumns())
    ↓
State NEVER reaches ERPExportMenu ❌
```

---

### 2.2 Why Selected Rows Are Ignored

**File**: `src/app/(protected)/admin/organizations/page.tsx`

**Lines 48-52**:
```typescript
// Prepare export-friendly data
const exportData = organizations.map(org => ({
  ...org,
  created_at_formatted: org.created_at ? new Date(org.created_at).toLocaleString() : "",
}));
```

**Problem**:
- `exportData` is created from **ALL** `organizations` from the database
- No knowledge of which rows are selected in the table
- No knowledge of which rows are filtered/searched
- No knowledge of current sort order

**Passed to Export**:
```typescript
<OrganizationsTable 
  data={organizations}
  userProfileId={ctx.profile?.id || "default"}
  exportSlot={
    <ERPExportMenu
      title="Organizations Report"
      filename="organizations"
      data={exportData}  // ❌ ALL organizations, not selected
      columns={[/* all columns */]}
      ...
    />
  }
/>
```

---

### 2.3 Where Export Data Is Currently Created

**All 5 Admin Pages** follow the same flawed pattern:

| Page | Export Data Creation | Issue |
|------|---------------------|-------|
| `organizations/page.tsx` | Lines 48-52 | Exports all orgs |
| `branches/page.tsx` | Lines 45-53 | Exports all branches |
| `users/page.tsx` | Lines 50-57 | Exports all users |
| `roles/page.tsx` | Lines 42-47 | Exports all roles |
| `audit/page.tsx` | Lines 39-43 | Exports all audit logs |

**Common Pattern**:
1. Page fetches all data from database (server)
2. Page prepares `exportData` by flattening nested objects (server)
3. Page passes `exportData` to `<ERPExportMenu />` via `exportSlot` (static)
4. Table component receives `data` but export doesn't see table state

---

### 2.4 ERPExportMenu Component Analysis

**File**: `src/components/erp/export/erp-export-menu.tsx`

**Props Interface** (Lines 32-55):
```typescript
export interface ERPExportMenuProps<T = any> {
  title: string;
  filename: string;
  data: T[];             // ❌ Static array, no table state
  columns: ERPExportColumn<T>[];  // ❌ Static columns, no visibility info
  subtitle?: string;
  filters?: Record<string, unknown>;
  disabled?: boolean;
  generatedBy?: string;
  ...
}
```

**Export Logic** (Lines 80-114):
```typescript
const handleExport = async (type: "csv" | "excel" | "pdf" | "print") => {
  const options: ERPExportOptions<T> = {
    title,
    subtitle,
    filename,
    columns,     // ❌ All columns
    data,        // ❌ All data
    generatedBy,
    ...
  };
  
  // Execute export
  switch (type) {
    case "csv":
      result = exportToCSV(options);  // Uses options.data directly
    ...
  }
}
```

**Problem**:
- `data` prop is a **static array** passed at render time
- No access to `table` instance
- No access to selected/filtered/sorted rows
- No access to column visibility state

---

### 2.5 ERPDataTable Component Analysis

**File**: `src/components/erp/table/erp-data-table.tsx`

**Table Instance** (Lines 89-121):
```typescript
const table = useReactTable({
  data,
  columns: enhancedColumns,
  state: {
    sorting,
    columnSizing,
    columnVisibility,   // ✅ Has visibility state
    rowSelection,       // ✅ Has selection state
    globalFilter,       // ✅ Has filter state
  },
  ...
  getSortedRowModel: getSortedRowModel(),     // ✅ Can get sorted rows
  getFilteredRowModel: getFilteredRowModel(), // ✅ Can get filtered rows
  ...
});
```

**Available TanStack Methods**:
```typescript
table.getSelectedRowModel().rows   // ✅ Selected rows
table.getFilteredRowModel().rows   // ✅ Filtered rows
table.getSortedRowModel().rows     // ✅ Sorted rows
table.getVisibleLeafColumns()      // ✅ Visible columns
```

**Export Slot Rendering** (Lines 161-165):
```typescript
<div className="flex items-center gap-2">
  {toolbarSlot}
  {enableColumnVisibility && <ERPColumnMenu table={table} />}
  {exportSlot}  // ❌ Static JSX, no table state
</div>
```

**Problem**:
- `exportSlot` is static `React.ReactNode` passed as prop
- Cannot receive `table` instance
- Cannot dynamically update based on selection

---

## 3. Affected Components

### 3.1 Core Export Infrastructure

**Needs Changes**:
- ✅ `src/components/erp/export/erp-export-menu.tsx` - Add table state support
- ✅ `src/lib/export/export-types.ts` - Add table state types
- ✅ `src/components/erp/table/erp-data-table.tsx` - Pass table state to export
- ✅ `src/components/erp/table/erp-table-types.ts` - Add export config types

**No Changes Needed**:
- ✅ `src/lib/export/csv.ts` - Works with filtered data
- ✅ `src/lib/export/excel.ts` - Works with filtered data
- ✅ `src/lib/export/pdf.ts` - Works with filtered data
- ✅ `src/lib/export/print.ts` - Works with filtered data
- ✅ `src/lib/export/format-export-data.ts` - Works with any data

---

### 3.2 Admin Tables

**All 5 tables need migration**:

| Table Component | Current Export Slot | Needs Change |
|----------------|---------------------|--------------|
| `organizations-table.tsx` | Static `exportSlot` prop | ✅ Remove prop |
| `branches-table.tsx` | Static `exportSlot` prop | ✅ Remove prop |
| `users-table.tsx` | Static `exportSlot` prop | ✅ Remove prop |
| `roles-table.tsx` | Static `exportSlot` prop | ✅ Remove prop |
| `audit-logs-table.tsx` | Static `exportSlot` prop | ✅ Remove prop |

---

### 3.3 Admin Pages

**All 5 pages need migration**:

| Page Component | Current Pattern | Needs Change |
|----------------|----------------|--------------|
| `organizations/page.tsx` | Passes `exportSlot` to table | ✅ Pass `exportConfig` instead |
| `branches/page.tsx` | Passes `exportSlot` to table | ✅ Pass `exportConfig` instead |
| `users/page.tsx` | Passes `exportSlot` to table | ✅ Pass `exportConfig` instead |
| `roles/page.tsx` | Passes `exportSlot` to table | ✅ Pass `exportConfig` instead |
| `audit/page.tsx` | Passes `exportSlot` to table | ✅ Pass `exportConfig` instead |

---

## 4. Proposed Solution Design

### 4.1 Architectural Approach

**Option A: Render Prop** (rejected)
```typescript
exportSlot={(table) => <ERPExportMenu table={table} />}
```
❌ Complex API  
❌ Requires pages to pass render prop  
❌ Still separates export from table

**Option B: Move Export Inside ERPDataTable** (rejected partially)
```typescript
<ERPDataTable exportOptions={{title, filename}} />
```
✅ Clean API  
❌ Loses flexibility for custom export buttons

**Option C: Hybrid - Export Config + Internal Rendering** (✅ **CHOSEN**)
```typescript
<ERPDataTable
  exportConfig={{
    title: "Organizations Report",
    filename: "organizations",
    subtitle: "...",
    generatedBy: userName,
  }}
/>
```

✅ Clean API  
✅ Table internally manages export state  
✅ Export automatically gets table state  
✅ Backward compatible (exportConfig optional)

---

### 4.2 Implementation Strategy

**Step 1: Add Column Metadata Support**

Extend TanStack column definitions with export metadata:

```typescript
// In src/components/erp/table/erp-table-types.ts
declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    exportable?: boolean;           // Default true
    exportHeader?: string;          // Override header for export
    exportValue?: (row: TData) => string | number | boolean | null;
  }
}
```

**Step 2: Add Export Config Type**

```typescript
export interface ERPTableExportConfig {
  title: string;
  subtitle?: string;
  filename: string;
  generatedBy?: string;
  orientation?: "portrait" | "landscape";
}
```

**Step 3: Modify ERPDataTable**

```typescript
interface ERPDataTableProps<TData> {
  // ... existing props
  exportConfig?: ERPTableExportConfig;  // New prop
  // Remove: exportSlot?: React.ReactNode;
}
```

**Step 4: Implement Export State Extraction**

```typescript
// Inside ERPDataTable
const getExportData = () => {
  const selectedRows = table.getSelectedRowModel().rows;
  const filteredRows = table.getFilteredRowModel().rows;
  
  // Priority: selected > filtered > all
  const exportRows = selectedRows.length > 0 
    ? selectedRows 
    : filteredRows;
  
  return exportRows.map(row => row.original);
};

const getExportColumns = () => {
  return table
    .getVisibleLeafColumns()
    .filter(col => col.id !== "select" && col.id !== "actions")
    .filter(col => col.columnDef.meta?.exportable !== false)
    .map(col => ({
      key: col.id,
      header: col.columnDef.meta?.exportHeader || 
              (typeof col.columnDef.header === "string" ? col.columnDef.header : col.id),
      getValue: col.columnDef.meta?.exportValue,
      width: col.getSize(),
    }));
};
```

**Step 5: Render Export Menu Internally**

```typescript
{exportConfig && (
  <ERPExportMenu
    title={exportConfig.title}
    filename={exportConfig.filename}
    data={getExportData()}          // Dynamic from table state
    columns={getExportColumns()}     // Dynamic from visible columns
    subtitle={exportConfig.subtitle}
    generatedBy={exportConfig.generatedBy}
    disabled={table.getRowModel().rows.length === 0}
  />
)}
```

---

### 4.3 Export Row Priority Logic

```typescript
function getExportRows(table: Table<any>) {
  const selectedRows = table.getSelectedRowModel().rows;
  
  // Priority 1: Export selected rows if any
  if (selectedRows.length > 0) {
    return {
      rows: selectedRows.map(row => row.original),
      mode: "selected",
      count: selectedRows.length,
    };
  }
  
  // Priority 2: Export filtered rows (respects search/filter)
  const filteredRows = table.getFilteredRowModel().rows;
  return {
    rows: filteredRows.map(row => row.original),
    mode: "filtered",
    count: filteredRows.length,
  };
}
```

---

### 4.4 Export Column Filtering Logic

```typescript
function getExportColumns(table: Table<any>) {
  return table
    .getVisibleLeafColumns()
    .filter(column => {
      // Exclude UI-only columns
      if (column.id === "select") return false;
      if (column.id === "actions") return false;
      
      // Exclude columns marked as non-exportable
      if (column.columnDef.meta?.exportable === false) return false;
      
      return true;
    })
    .map(column => ({
      key: column.id,
      header: column.columnDef.meta?.exportHeader || 
              getColumnHeader(column),
      getValue: column.columnDef.meta?.exportValue,
      width: Math.max(column.getSize(), 15), // Min 15
    }));
}
```

---

## 5. Sensitive Field Handling

### 5.1 Fields That Must Never Export

**User Table**:
- ❌ `auth_user_id` (UUID)
- ❌ `raw_user_metadata` (JSON)
- ❌ `raw_app_metadata` (JSON)

**Audit Logs Table**:
- ❌ `old_values` (large JSON, already excluded from export)
- ❌ `new_values` (large JSON, already excluded from export)

**All Tables**:
- ❌ Columns with `meta: { exportable: false }`

### 5.2 Implementation

Mark sensitive columns explicitly:

```typescript
// In users-table.tsx
{
  id: "auth_user_id",
  accessorKey: "auth_user_id",
  header: "Auth User ID",
  meta: { exportable: false },  // Never export
  cell: ({ row }) => <span className="font-mono text-xs">{row.original.auth_user_id}</span>,
}
```

---

## 6. Visual Feedback Requirements

### 6.1 Export Button Label

**Current**:
```
[Download Icon] Export
```

**Required**:
```
When rows selected:
[Download Icon] Export (3 selected)

When no rows selected:
[Download Icon] Export
```

### 6.2 Export Menu Tooltip/Hint

Add tooltip to export button:
```
"Select rows to export only selected records"
```

### 6.3 Export Subtitle

**Current**:
```
subtitle: "Owner company master data"
```

**Required**:
```
subtitle: "Owner company master data (3 selected records)"
// or
subtitle: "Owner company master data (filtered: 15 records)"
// or
subtitle: "Owner company master data (all 42 records)"
```

---

## 7. Migration Impact Assessment

### 7.1 Breaking Changes

**For Table Components**:
- ❌ **BREAKING**: Remove `exportSlot` prop
- ❌ **BREAKING**: Remove `toolbarSlot` prop (if not used elsewhere)
- ✅ **NEW**: Add `exportConfig` prop

**For Page Components**:
- ❌ **BREAKING**: Cannot pass `<ERPExportMenu />` as `exportSlot`
- ✅ **NEW**: Pass export configuration as object

**Example Migration**:

**Before**:
```typescript
<OrganizationsTable
  data={organizations}
  userProfileId={ctx.profile?.id}
  exportSlot={<ERPExportMenu title="..." data={exportData} columns={...} />}
/>
```

**After**:
```typescript
<OrganizationsTable
  data={organizations}
  userProfileId={ctx.profile?.id}
  exportConfig={{
    title: "Organizations Report",
    filename: "organizations",
    subtitle: "Owner company master data",
    generatedBy: ctx.profile?.full_name,
  }}
/>
```

---

### 7.2 Backward Compatibility

**Option 1: Support Both** (not recommended)
```typescript
interface ERPDataTableProps<TData> {
  exportSlot?: React.ReactNode;      // Deprecated
  exportConfig?: ERPTableExportConfig; // New
}
```

**Option 2: Breaking Change** (✅ **RECOMMENDED**)
- Remove `exportSlot` entirely
- All pages must use `exportConfig`
- Clean, consistent API

**Rationale**: Only 5 pages affected, all under our control, clean migration is better than tech debt.

---

## 8. Testing Strategy

### 8.1 Manual Test Matrix

| Test Case | Organizations | Branches | Users | Roles | Audit |
|-----------|--------------|----------|-------|-------|-------|
| Select 2 rows, export CSV | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| Select 2 rows, export Excel | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| Select 2 rows, export PDF | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| Select 2 rows, print | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| Hide column, export | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| Search, export (no selection) | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| Sort desc, export | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |
| Export with no data | ⏳ | ⏳ | ⏳ | ⏳ | ⏳ |

---

### 8.2 Automated Validation

```bash
npm run typecheck  # No TypeScript errors
npm run build      # Production build succeeds
npm run lint       # No linting errors
```

---

## 9. Implementation Timeline

### Phase 1: Core Infrastructure (1-2 hours)
1. Add column metadata types
2. Add export config types
3. Update `ERPDataTable` to support `exportConfig`
4. Implement export state extraction logic
5. Implement export column filtering logic

### Phase 2: Table/Page Migration (1-2 hours)
1. Migrate Organizations
2. Migrate Branches
3. Migrate Users (handle sensitive fields)
4. Migrate Roles
5. Migrate Audit Logs (handle sensitive fields)

### Phase 3: Testing & Reports (1 hour)
1. Manual testing all formats
2. Generate implementation report
3. Generate validation report
4. Generate security review report
5. Generate next steps document

**Total Estimated Time**: 3-5 hours

---

## 10. Risks and Mitigations

### Risk 1: Breaking Change Impact

**Risk**: Removing `exportSlot` prop breaks existing code.

**Mitigation**:
- All 5 pages are under our control
- Can be migrated in single commit
- TypeScript will catch any missed migrations

**Severity**: Low

---

### Risk 2: Complex Cell Rendering

**Risk**: Some cells have complex rendering (icons, badges, formatted dates) that may not export well.

**Example**:
```typescript
cell: ({ row }) => (
  <div className="flex items-start gap-3">
    <Building2 className="h-5 w-5" />
    <span>{row.original.legal_name_en}</span>
  </div>
)
```

**Mitigation**:
- Use `meta.exportValue` to provide plain text/number
- Fallback to `accessorKey` or `accessorFn` result
- For dates, export ISO string or formatted string

**Example Fix**:
```typescript
{
  id: "company",
  accessorKey: "legal_name_en",
  header: "Organization",
  meta: {
    exportHeader: "Organization Name",
    exportValue: (row) => row.legal_name_en,  // Plain text
  },
  cell: ({ row }) => (
    <div className="flex items-start gap-3">
      <Building2 className="h-5 w-5" />
      <span>{row.original.legal_name_en}</span>
    </div>
  ),
}
```

**Severity**: Medium

---

### Risk 3: Large Datasets

**Risk**: Exporting 10,000+ rows could freeze browser.

**Assessment**:
- Current admin tables have < 1000 rows
- Export is already synchronous (not a new issue)
- Future: Can add worker threads or server-side export

**Mitigation**: Document as known limitation for Phase 003+.

**Severity**: Low (not applicable to current data size)

---

## 11. Permissions and Security Review

### 11.1 No Backend Changes

✅ **No database migrations**  
✅ **No RLS policy changes**  
✅ **No RBAC changes**  
✅ **No audit logic changes**  

Export respects the **same RLS-filtered data** already loaded on the page.

---

### 11.2 Sensitive Field Protection

**Strategy**: Mark sensitive columns with `meta: { exportable: false }`.

**Enforcement**: `getExportColumns()` filters out these columns.

**Validation**: Security review report will verify no sensitive fields exported.

---

## 12. Recommendation

**Proceed with implementation** using the proposed hybrid approach:

✅ Add `exportConfig` prop to `ERPDataTable`  
✅ Remove `exportSlot` prop (breaking change, clean migration)  
✅ Implement export state extraction inside `ERPDataTable`  
✅ Add column metadata for export control  
✅ Migrate all 5 admin pages  
✅ Test all export formats (CSV/Excel/PDF/Print)  
✅ Generate comprehensive reports  

**Estimated Effort**: 3-5 hours  
**Risk Level**: Low  
**Value**: High (critical user-facing bug fix)  

---

**Report Complete**  
**Next Step**: Begin implementation of Phase 002E.2B

---

**Report End**
