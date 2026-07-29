# ERP BASE 002F.3B — GLOBAL LOOKUP/DROPDOWN ENGINE TECHNICAL IMPLEMENTATION PLAN

**Document Status:** READY FOR SAMEER REVIEW  
**Phase:** ERP BASE 002F.3B  
**Created:** 2026-06-05  
**Purpose:** Complete technical implementation plan for Global Lookup/Dropdown Engine

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Existing Source Code Inspection Summary](#2-existing-source-code-inspection-summary)
3. [Proposed Database Schema Plan](#3-proposed-database-schema-plan)
4. [Required Seed Lookup Categories and Values](#4-required-seed-lookup-categories-and-values)
5. [Permissions Plan](#5-permissions-plan)
6. [RLS Policy Plan](#6-rls-policy-plan)
7. [Audit Logging Plan](#7-audit-logging-plan)
8. [Server Actions / Services Plan](#8-server-actions--services-plan)
9. [Validation Plan](#9-validation-plan)
10. [UI / Screen Plan](#10-ui--screen-plan)
11. [Reusable LookupSelect Component Plan](#11-reusable-lookupselect-component-plan)
12. [Export / Import Plan](#12-export--import-plan)
13. [Sidebar / Menu Modification Plan](#13-sidebar--menu-modification-plan)
14. [File Modification Plan](#14-file-modification-plan)
15. [Implementation Sequence Plan](#15-implementation-sequence-plan)
16. [Testing Plan](#16-testing-plan)
17. [Risk Analysis](#17-risk-analysis)
18. [Acceptance Criteria](#18-acceptance-criteria)
19. [Future Integration Notes](#19-future-integration-notes)
20. [Final Recommendation](#20-final-recommendation)

---

## 1. EXECUTIVE SUMMARY

### 1.1 Purpose of 002F.3B

This phase implements the **Global Lookup/Dropdown Engine** — a centralized, database-driven system for managing all dropdown values, reference data, and picklist options across the entire ERP application. This engine eliminates hardcoded arrays, provides multilingual support (English/Arabic), enables dynamic configuration without code changes, and establishes the foundation for all future master data phases.

### 1.2 Why This Is First

The Global Lookup Engine must be implemented FIRST because:

1. **Foundation for All Master Data**: Every subsequent master data phase (Geography, HR, Fleet, HSE, etc.) will depend on this engine for status codes, types, categories, and dynamic dropdowns
2. **Eliminates Technical Debt**: Replaces existing hardcoded CHECK constraints and status arrays that currently limit extensibility
3. **Enables Configuration**: Allows business users to add new lookup values without developer intervention or database migrations
4. **Standardizes Patterns**: Establishes consistent dropdown behavior, validation, and UI patterns for the entire application
5. **UAE Localization Ready**: Provides Arabic label support from the start, critical for UAE regulatory compliance

### 1.3 What This Phase WILL Implement

**Core Tables:**
- `global_lookup_categories` (category definitions with metadata)
- `global_lookup_values` (actual dropdown values with parent/child support)

**Foundation Seed Data:**
- 13 critical lookup categories (STATUS_TYPES, PRIORITY_LEVELS, APPROVAL_STATUS_TYPES, YES_NO_TYPES, PHONE_TYPES, EMAIL_TYPES, ADDRESS_TYPES, GENDER_TYPES, RELATIONSHIP_TYPES, DOCUMENT_STATUS_TYPES, RISK_LEVELS, SEVERITY_LEVELS, RECORD_VISIBILITY_TYPES)
- Minimal seed values to prove the engine works (3-7 values per category)

**UI/Screens:**
- Master Data Dashboard (`/admin/master-data`)
- Lookup Categories management page (`/admin/master-data/lookups/categories`)
- Lookup Values management page (`/admin/master-data/lookups/values`)
- Locked System Values filtered view (`/admin/master-data/lookups/system`)

**Reusable Components:**
- `LookupSelect` component for forms
- `useLookupValues()` hook for data loading
- Integration with existing `ERPDrawerForm` and `ERPDataTable` patterns

**Security & Governance:**
- 6 new permissions (master_data.* namespace)
- RLS policies compatible with existing RBAC
- Full audit logging for all lookup changes
- System-locked value protection

### 1.4 What This Phase WILL NOT Implement

**Out of Scope:**
- Dedicated geography tables (Countries, Emirates, Cities, Areas, Ports) — Phase 002F.3C
- Currency and exchange rate tables — Phase 002F.3C
- Unit of Measure (UOM) tables and conversions — Phase 002F.3C
- Payment Terms master data — Phase 002F.3C
- Tax configuration tables — Phase 002F.3C
- Bank master data — Phase 002F.3C
- Person/Contact master data — Phase 002F.3E
- HR-specific master data — Phase 002F.3F
- Fleet/Equipment master data — Phase 002F.3G
- Inventory/Procurement master data — Phase 002F.3H
- HSE/DMS master data — Phase 002F.3I
- Scrap/Waste/Demolition master data — Phase 002F.3J
- Complex import functionality (permission exists, UI can be future placeholder)
- Migration of existing hardcoded dropdowns (documented for Phase 002F.3K)

### 1.5 How This Supports Future Phases

**Phase 002F.3C (Core UAE Shared Master Data):** Will use lookups for currency types, port types, geography categories

**Phase 002F.3E (CRM Foundation):** Will use lookups for contact types, lead sources, opportunity stages

**Phase 002F.3F (HR Master Data):** Will use lookups for employment types, job levels, leave types

**Phase 002F.3G-3J (Operational Modules):** Will use lookups for equipment categories, HSE risk levels, waste types, etc.

**Phase 002F.3K (Readiness Gate):** Will audit all hardcoded dropdowns and migrate them to the lookup engine

### 1.6 Readiness Status

**READY FOR IMPLEMENTATION** — All patterns exist, no blocking dependencies, clear specification, existing codebase provides all required patterns.

---

## 2. EXISTING SOURCE CODE INSPECTION SUMMARY

| Area | Files/Tables Inspected | Current Pattern Found | Impact on 002F.3B |
|---|---|---|---|
| **Database Migrations** | `supabase/migrations/20260527120000_erp_base_foundation.sql`, `20260604180757_erp_base_002f2_global_numbering_engine.sql` | BIGINT identity PKs, timestamptz audit fields, `set_updated_at()` trigger function, UPPERCASE code fields with CHECK constraints | **FOLLOW EXACTLY** — Use same PK strategy, same audit field pattern, same trigger pattern |
| **Table Naming** | `owner_companies`, `global_numbering_rules`, `global_numbering_sequence_states` | snake_case, descriptive, prefixed with scope (global_ for system-wide) | Use `global_lookup_categories` and `global_lookup_values` |
| **Audit Fields** | All core tables | `created_at timestamptz default now()`, `created_by bigint`, `updated_at timestamptz default now()`, `updated_by bigint` | Include identical audit fields + deactivation audit fields |
| **RLS Helper Functions** | `current_user_profile_id()`, `current_user_has_permission(permission_code)`, `current_user_has_permission_any_scope(permission_code)`, `current_user_is_global_admin()` | SECURITY DEFINER functions with fixed search_path, stable, SQL or plpgsql | Use `current_user_has_permission_any_scope()` for global lookup access |
| **Permissions Table** | `public.permissions` | Columns: `id, permission_code (unique), permission_name, module_code, action_code, description, is_active, created_at, updated_at` | Add 6 new master_data.* permissions following this exact pattern |
| **Permission Seed Pattern** | Foundation migration lines 986-1013 | INSERT with explicit column list, uses permission_code as unique key | Seed new permissions with same pattern |
| **Role Assignment Pattern** | Foundation migration lines 1019-1062 | `INSERT INTO role_permissions SELECT r.id, p.id FROM roles r JOIN permissions p WHERE r.role_code = 'system_admin' AND p.permission_code IN (...)` | Assign new permissions to system_admin, group_admin, company_admin |
| **RLS Policy Pattern** | Foundation migration lines 752-958 | Named policies, separate for SELECT/INSERT/UPDATE/DELETE, uses permission helper functions, with check clauses | Create similar policies for lookup tables using `current_user_has_permission_any_scope()` |
| **Audit Logs Table** | `public.audit_logs` | Columns: `id, actor_user_profile_id, owner_company_id, branch_id, module_code, entity_name, entity_id, entity_reference, action, old_values jsonb, new_values jsonb, ip_address, user_agent, created_at` | Log all lookup CRUD actions with module_code='master_data', entity_name='global_lookup_categories' or 'global_lookup_values' |
| **Server Actions Pattern** | `src/server/actions/permissions.ts`, `src/server/actions/numbering.ts` | "use server" directive, `getAuthContext()`, `hasPermission()` checks, `createClient()` for Supabase, `logAudit()` calls, `revalidatePath()`, `ActionResult<T>` return type | Follow identical pattern for lookup actions |
| **Zod Validation** | `src/features/numbering/numbering-types.ts` (inferred from action usage) | Zod schemas for create/update, safeParse with error mapping | Create `lookup-types.ts` with Zod schemas for categories and values |
| **Sidebar Structure** | `src/components/layout/app-sidebar.tsx` | `NavGroup[]` array with label, items (label, icon, path), collapsible groups, active path highlighting | Add new "Master Data" group with Dashboard and Global Lookups subgroup |
| **Admin Pages** | `src/app/(protected)/admin/organizations/page.tsx`, `src/app/(protected)/admin/settings/numbering/page.tsx` | Async Server Components, `getAuthContext()`, `hasPermission()` gate, `ERPPageHeader`, `ERPSectionCard`, `ERPStatCard`, breadcrumbs, export config | Use identical page structure for all 4 new pages |
| **ERPDrawerForm** | `src/components/erp/erp-drawer-form.tsx` | Root component with open/onOpenChange, ERPDrawerHeader, ERPDrawerSectionNav with icons, ERPDrawerBody with ScrollArea, ERPDrawerSection for tabs, ERPFieldGrid (12-column), ERPDrawerFooter with cancel/submit | Integrate lookup forms into this exact pattern |
| **ERPDataTable** | Inferred from usage in organizations-table.tsx, numbering-rules-table.tsx | Client component, columns definition, actions (view/edit/delete), filters, search, pagination | Create LookupCategoriesTable and LookupValuesTable following this pattern |
| **Status Badge** | `ERPStatusBadge` in `erp-drawer-form.tsx` | Hardcoded color mapping for active/inactive/suspended | This is a candidate for future lookup migration but keep for now |
| **Hardcoded Status Arrays** | Foundation SQL lines 36, 60, 79 | `status text not null default 'active' check (status in ('active', 'inactive', 'suspended'))` | **CRITICAL** — Document for Phase 002F.3K migration, do NOT migrate now |
| **Existing Numbering Module** | `global_numbering_rules` table, `src/features/numbering/` folder structure, numbering actions | Full CRUD with preview/generate functions, form dialog, table, types, validation | **USE AS TEMPLATE** — Lookup module should mirror this structure |

**Key Findings:**

1. **Consistent Patterns Exist**: The codebase has mature, consistent patterns for migrations, RLS, permissions, actions, UI components
2. **No Blocking Issues**: All required infrastructure (RBAC, audit, drawer forms, data tables) is production-ready
3. **Numbering Module is Perfect Template**: Phase 002F.2 provides an excellent reference implementation
4. **Hardcoded Dropdowns Identified**: Multiple CHECK constraints with hardcoded values exist — these should be migrated in Phase 002F.3K, NOT now
5. **Permission System is Robust**: Existing `current_user_has_permission_any_scope()` is perfect for global lookup access

---

## 3. PROPOSED DATABASE SCHEMA PLAN

### 3.1 Table: global_lookup_categories

**Purpose:** Stores metadata about lookup categories (e.g., STATUS_TYPES, PRIORITY_LEVELS). Each category defines a collection of related lookup values.

**Complete SQL Definition:**

``sql
CREATE TABLE IF NOT EXISTS public.global_lookup_categories (
  -- Primary Key
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  
  -- Category Identification (UPPERCASE, IMMUTABLE after creation)
  category_code TEXT NOT NULL UNIQUE,
  category_name_en TEXT NOT NULL,
  category_name_ar TEXT,
  description TEXT,
  
  -- Scope and Organization
  module_code TEXT, -- e.g., 'SYSTEM', 'HR', 'FLEET', 'HSE', NULL for cross-module
  category_scope TEXT DEFAULT 'GLOBAL' CHECK (category_scope IN ('GLOBAL', 'COMPANY', 'BRANCH', 'MODULE')),
  
  -- Feature Flags (what this category supports)
  supports_hierarchy BOOLEAN NOT NULL DEFAULT FALSE, -- Can values have parent_value_id?
  supports_color BOOLEAN NOT NULL DEFAULT FALSE, -- Can values have color_hex?
  supports_icon BOOLEAN NOT NULL DEFAULT FALSE, -- Can values have icon_name?
  supports_effective_dates BOOLEAN NOT NULL DEFAULT FALSE, -- Can values have effective_from/to?
  supports_metadata BOOLEAN NOT NULL DEFAULT TRUE, -- Can values have metadata_json?
  
  -- Status and Governance
  is_system BOOLEAN NOT NULL DEFAULT FALSE, -- Created by system seed data
  is_locked BOOLEAN NOT NULL DEFAULT FALSE, -- Only system_admin can edit if TRUE
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  
  -- Audit Fields (Standard Pattern)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  
  -- Deactivation Audit
  deactivated_at TIMESTAMPTZ,
  deactivated_by BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  deactivation_reason TEXT,
  
  -- Constraints
  CONSTRAINT chk_category_code_format CHECK (category_code ~ '^[A-Z0-9_]+$'),
  CONSTRAINT chk_category_code_uppercase CHECK (category_code = UPPER(category_code)),
  CONSTRAINT chk_deactivation_logic CHECK (
    (is_active = TRUE AND deactivated_at IS NULL AND deactivated_by IS NULL) OR
    (is_active = FALSE AND deactivated_at IS NOT NULL)
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lookup_categories_category_code ON public.global_lookup_categories(category_code);
CREATE INDEX IF NOT EXISTS idx_lookup_categories_module_code ON public.global_lookup_categories(module_code);
CREATE INDEX IF NOT EXISTS idx_lookup_categories_is_active ON public.global_lookup_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_lookup_categories_is_system ON public.global_lookup_categories(is_system);
CREATE INDEX IF NOT EXISTS idx_lookup_categories_is_locked ON public.global_lookup_categories(is_locked);

-- Updated-at Trigger
CREATE TRIGGER trg_lookup_categories_updated_at
  BEFORE UPDATE ON public.global_lookup_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Comments
COMMENT ON TABLE public.global_lookup_categories IS 'Global lookup category definitions for dropdown values across the ERP';
COMMENT ON COLUMN public.global_lookup_categories.category_code IS 'Unique uppercase code (e.g., STATUS_TYPES, PRIORITY_LEVELS). Immutable after creation.';
COMMENT ON COLUMN public.global_lookup_categories.supports_hierarchy IS 'If TRUE, values can have parent_value_id for nested dropdowns';
COMMENT ON COLUMN public.global_lookup_categories.is_system IS 'If TRUE, created by system seed data. Cannot be deleted.';
COMMENT ON COLUMN public.global_lookup_categories.is_locked IS 'If TRUE, only users with master_data.lookups.lock permission can edit';
``

**Usage Examples:**
- `category_code: 'STATUS_TYPES'`, `category_name_en: 'Status Types'`, `supports_color: TRUE`
- `category_code: 'PRIORITY_LEVELS'`, `category_name_en: 'Priority Levels'`, `supports_color: TRUE`, `supports_hierarchy: FALSE`
- `category_code: 'ADDRESS_TYPES'`, `category_name_en: 'Address Types'`, `module_code: 'CRM'`, `supports_hierarchy: TRUE` (e.g., HEAD_OFFICE > BRANCH > SUB_BRANCH)

**RLS Strategy:** Global read for authenticated users with `master_data.lookups.view` permission. Write requires `master_data.lookups.manage`. Locked categories require `master_data.lookups.lock` for updates.

**Seed Data Approach:** Insert 13 foundation categories during migration (see Section 4).

---

### 3.2 Table: global_lookup_values

**Purpose:** Stores actual lookup values (e.g., ACTIVE, INACTIVE, HIGH, LOW). Each value belongs to one category and can have optional parent/child relationships, colors, icons, effective dates, and custom metadata.

**Complete SQL Definition:**

``sql
CREATE TABLE IF NOT EXISTS public.global_lookup_values (
  -- Primary Key
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  
  -- Category Link (REQUIRED)
  category_id BIGINT NOT NULL REFERENCES public.global_lookup_categories(id) ON DELETE RESTRICT,
  
  -- Value Identification (UPPERCASE within category)
  value_code TEXT NOT NULL,
  value_label_en TEXT NOT NULL,
  value_label_ar TEXT,
  description TEXT,
  
  -- Hierarchy Support (optional parent)
  parent_value_id BIGINT REFERENCES public.global_lookup_values(id) ON DELETE RESTRICT,
  
  -- Display Metadata
  color_hex TEXT, -- e.g., '#10B981', '#EF4444', '#F59E0B'
  icon_name TEXT, -- e.g., 'CheckCircle', 'AlertTriangle', 'XCircle'
  badge_variant TEXT, -- e.g., 'success', 'warning', 'destructive', 'default'
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Status and Governance
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Effective Date Support (optional)
  effective_from DATE,
  effective_to DATE,
  
  -- Extensibility
  metadata_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  
  -- Audit Fields (Standard Pattern)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  
  -- Deactivation Audit
  deactivated_at TIMESTAMPTZ,
  deactivated_by BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  deactivation_reason TEXT,
  
  -- Constraints
  CONSTRAINT uq_lookup_value_category_code UNIQUE (category_id, value_code),
  CONSTRAINT chk_value_code_format CHECK (value_code ~ '^[A-Z0-9_]+$'),
  CONSTRAINT chk_value_code_uppercase CHECK (value_code = UPPER(value_code)),
  CONSTRAINT chk_no_self_parent CHECK (id != parent_value_id),
  CONSTRAINT chk_color_hex_format CHECK (color_hex IS NULL OR color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT chk_effective_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT chk_deactivation_logic CHECK (
    (is_active = TRUE AND deactivated_at IS NULL AND deactivated_by IS NULL) OR
    (is_active = FALSE AND deactivated_at IS NOT NULL)
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lookup_values_category_id ON public.global_lookup_values(category_id);
CREATE INDEX IF NOT EXISTS idx_lookup_values_parent_value_id ON public.global_lookup_values(parent_value_id) WHERE parent_value_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lookup_values_is_active ON public.global_lookup_values(is_active);
CREATE INDEX IF NOT EXISTS idx_lookup_values_is_system ON public.global_lookup_values(is_system);
CREATE INDEX IF NOT EXISTS idx_lookup_values_is_locked ON public.global_lookup_values(is_locked);
CREATE INDEX IF NOT EXISTS idx_lookup_values_is_default ON public.global_lookup_values(is_default) WHERE is_default = TRUE;
CREATE INDEX IF NOT EXISTS idx_lookup_values_effective_dates ON public.global_lookup_values(effective_from, effective_to) WHERE effective_from IS NOT NULL OR effective_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lookup_values_sort_order ON public.global_lookup_values(category_id, sort_order);

-- Updated-at Trigger
CREATE TRIGGER trg_lookup_values_updated_at
  BEFORE UPDATE ON public.global_lookup_values
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Parent Value Same Category Validation Function
CREATE OR REPLACE FUNCTION public.validate_lookup_value_parent_category()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS 
BEGIN
  IF NEW.parent_value_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.global_lookup_values
      WHERE id = NEW.parent_value_id
        AND category_id = NEW.category_id
    ) THEN
      RAISE EXCEPTION 'Parent value must belong to the same category';
    END IF;
  END IF;
  RETURN NEW;
END;
;

CREATE TRIGGER trg_lookup_values_validate_parent
  BEFORE INSERT OR UPDATE ON public.global_lookup_values
  FOR EACH ROW EXECUTE FUNCTION public.validate_lookup_value_parent_category();

-- Comments
COMMENT ON TABLE public.global_lookup_values IS 'Global lookup values for dropdowns across the ERP';
COMMENT ON COLUMN public.global_lookup_values.value_code IS 'Unique uppercase code within category (e.g., ACTIVE, HIGH, PENDING_APPROVAL)';
COMMENT ON COLUMN public.global_lookup_values.parent_value_id IS 'Optional parent for hierarchical lookups (must be same category)';
COMMENT ON COLUMN public.global_lookup_values.color_hex IS 'Optional hex color for badges (e.g., #10B981 for green)';
COMMENT ON COLUMN public.global_lookup_values.is_default IS 'If TRUE, this value is the default selection for the category';
COMMENT ON COLUMN public.global_lookup_values.metadata_json IS 'Extensible JSON for custom attributes';
``

**Usage Examples:**
- Category: STATUS_TYPES → Values: ACTIVE (color: #10B981), INACTIVE (color: #6B7280), SUSPENDED (color: #F59E0B)
- Category: PRIORITY_LEVELS → Values: CRITICAL (color: #EF4444, sort_order: 1), HIGH (color: #F59E0B, sort_order: 2), MEDIUM (color: #3B82F6, sort_order: 3), LOW (color: #10B981, sort_order: 4)
- Category: ADDRESS_TYPES → Values: HEAD_OFFICE (parent: NULL), BRANCH (parent: HEAD_OFFICE), WAREHOUSE (parent: NULL)

**RLS Strategy:** Same as categories — global read with permission, write requires manage permission, locked values require lock permission.

**Seed Data Approach:** Insert 3-7 foundation values per category during migration (see Section 4).

---

### 3.3 Optional Table: global_lookup_usage_map

**Decision:** **DEFER TO FUTURE PHASE** (Not in 002F.3B scope)

**Rationale:** Usage tracking is valuable for preventing deletion of values currently in use, but it adds complexity:
- Requires triggers on every table that references lookup values
- Requires application-level tracking for text-based references
- Can be retrofitted later without breaking existing functionality

**Future Design (for reference):**
``sql
CREATE TABLE IF NOT EXISTS public.global_lookup_usage_map (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  lookup_category_code TEXT NOT NULL,
  lookup_value_id BIGINT NOT NULL REFERENCES public.global_lookup_values(id),
  entity_table_name TEXT NOT NULL,
  entity_column_name TEXT NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
``

**Workaround for 002F.3B:** Mark values as inactive instead of deleting. UI can show usage warnings based on manual queries if needed.

---

### 3.4 Optional Table: global_lookup_import_batches

**Decision:** **DEFER TO FUTURE PHASE** (Permission exists, UI can show placeholder)

**Rationale:** Import functionality is complex and requires:
- File upload handling
- Validation logic
- Error reporting
- Rollback mechanisms
- Permission checks

**Future Design (for reference):**
``sql
CREATE TABLE IF NOT EXISTS public.global_lookup_import_batches (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  batch_reference TEXT NOT NULL UNIQUE,
  import_type TEXT NOT NULL CHECK (import_type IN ('CATEGORIES', 'VALUES', 'BOTH')),
  file_name TEXT,
  file_size INTEGER,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'ROLLED_BACK')),
  total_rows INTEGER,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  error_log JSONB,
  imported_by BIGINT REFERENCES public.user_profiles(id),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
``

**Workaround for 002F.3B:** Add `master_data.lookups.import` permission now, show disabled "Import" button in UI with tooltip "Future enhancement", implement full import in Phase 002F.3K.

---

## 4. REQUIRED SEED LOOKUP CATEGORIES AND VALUES

### 4.1 Seed Strategy

**Principle:** Seed MINIMAL foundation values only. This phase proves the engine works and provides essential dropdowns for upcoming phases. Do NOT seed hundreds of values.

**Categories to Seed:** 13 critical categories
**Values per Category:** 3-7 values (foundation proof only)
**System Locked:** All seed categories and values will be marked `is_system=TRUE` and `is_locked=TRUE` initially

---

### 4.2 Complete Seed Data Specification

#### CATEGORY 1: STATUS_TYPES
**Purpose:** General-purpose status for most entities  
**Module:** SYSTEM  
**Supports:** Color, Badge  
**Hierarchy:** No  

**Values:**
| value_code | value_label_en | value_label_ar | color_hex | badge_variant | sort_order | is_default |
|---|---|---|---|---|---|---|
| ACTIVE | Active | نشط | #10B981 | success | 1 | TRUE |
| INACTIVE | Inactive | غير نشط | #6B7280 | default | 2 | FALSE |
| SUSPENDED | Suspended | معلق | #F59E0B | warning | 3 | FALSE |
| ARCHIVED | Archived | مؤرشف | #9CA3AF | secondary | 4 | FALSE |

---

#### CATEGORY 2: PRIORITY_LEVELS
**Purpose:** Task/issue/request priority levels  
**Module:** SYSTEM  
**Supports:** Color, Badge  
**Hierarchy:** No  

**Values:**
| value_code | value_label_en | value_label_ar | color_hex | badge_variant | sort_order | is_default |
|---|---|---|---|---|---|---|
| CRITICAL | Critical | حرج | #DC2626 | destructive | 1 | FALSE |
| HIGH | High | عالي | #F59E0B | warning | 2 | FALSE |
| MEDIUM | Medium | متوسط | #3B82F6 | default | 3 | TRUE |
| LOW | Low | منخفض | #10B981 | success | 4 | FALSE |

---

#### CATEGORY 3: APPROVAL_STATUS_TYPES
**Purpose:** Workflow approval status  
**Module:** SYSTEM  
**Supports:** Color, Badge  
**Hierarchy:** No  

**Values:**
| value_code | value_label_en | value_label_ar | color_hex | badge_variant | sort_order | is_default |
|---|---|---|---|---|---|---|
| DRAFT | Draft | مسودة | #9CA3AF | secondary | 1 | TRUE |
| PENDING_APPROVAL | Pending Approval | في انتظار الموافقة | #F59E0B | warning | 2 | FALSE |
| APPROVED | Approved | موافق عليه | #10B981 | success | 3 | FALSE |
| REJECTED | Rejected | مرفوض | #EF4444 | destructive | 4 | FALSE |
| CANCELLED | Cancelled | ملغى | #6B7280 | default | 5 | FALSE |

---

#### CATEGORY 4: RECORD_VISIBILITY_TYPES
**Purpose:** Data visibility scope (company-wide, branch-only, private)  
**Module:** SYSTEM  
**Supports:** Icon  
**Hierarchy:** No  

**Values:**
| value_code | value_label_en | value_label_ar | icon_name | sort_order | is_default |
|---|---|---|---|---|---|
| PUBLIC | Public | عام | Globe | 1 | FALSE |
| COMPANY_WIDE | Company Wide | على مستوى الشركة | Building2 | 2 | TRUE |
| BRANCH_ONLY | Branch Only | الفرع فقط | GitBranch | 3 | FALSE |
| PRIVATE | Private | خاص | Lock | 4 | FALSE |

---

#### CATEGORY 5: YES_NO_TYPES
**Purpose:** Binary yes/no choices  
**Module:** SYSTEM  
**Supports:** Color  
**Hierarchy:** No  

**Values:**
| value_code | value_label_en | value_label_ar | color_hex | sort_order | is_default |
|---|---|---|---|---|---|
| YES | Yes | نعم | #10B981 | 1 | FALSE |
| NO | No | لا | #EF4444 | 2 | FALSE |

---

#### CATEGORY 6: PHONE_TYPES
**Purpose:** Contact phone number types  
**Module:** CRM  
**Supports:** Icon  
**Hierarchy:** No  

**Values:**
| value_code | value_label_en | value_label_ar | icon_name | sort_order | is_default |
|---|---|---|---|---|---|
| MOBILE | Mobile | جوال | Smartphone | 1 | TRUE |
| OFFICE | Office | مكتب | Phone | 2 | FALSE |
| HOME | Home | منزل | Home | 3 | FALSE |
| FAX | Fax | فاكس | Printer | 4 | FALSE |
| WHATSAPP | WhatsApp | واتساب | MessageCircle | 5 | FALSE |

---

#### CATEGORY 7: EMAIL_TYPES
**Purpose:** Contact email types  
**Module:** CRM  
**Supports:** None  
**Hierarchy:** No  

**Values:**
| value_code | value_label_en | value_label_ar | sort_order | is_default |
|---|---|---|---|---|
| WORK | Work | عمل | 1 | TRUE |
| PERSONAL | Personal | شخصي | 2 | FALSE |
| BILLING | Billing | فواتير | 3 | FALSE |
| SUPPORT | Support | دعم فني | 4 | FALSE |

---

#### CATEGORY 8: ADDRESS_TYPES
**Purpose:** Address/location types  
**Module:** SYSTEM  
**Supports:** Hierarchy, Icon  
**Hierarchy:** YES  

**Values:**
| value_code | value_label_en | value_label_ar | parent_value_id | icon_name | sort_order | is_default |
|---|---|---|---|---|---|---|
| HEAD_OFFICE | Head Office | المكتب الرئيسي | NULL | Building2 | 1 | TRUE |
| BRANCH | Branch | فرع | NULL | GitBranch | 2 | FALSE |
| WAREHOUSE | Warehouse | مستودع | NULL | Package | 3 | FALSE |
| YARD | Yard | ساحة | NULL | Truck | 4 | FALSE |
| BILLING_ADDRESS | Billing Address | عنوان الفواتير | NULL | FileText | 5 | FALSE |
| SHIPPING_ADDRESS | Shipping Address | عنوان الشحن | NULL | Package | 6 | FALSE |
| SITE | Site | موقع | NULL | MapPin | 7 | FALSE |

---

#### CATEGORY 9: GENDER_TYPES
**Purpose:** Gender options (UAE-compliant)  
**Module:** HR  
**Supports:** None  
**Hierarchy:** No  

**Values:**
| value_code | value_label_en | value_label_ar | sort_order | is_default |
|---|---|---|---|---|
| MALE | Male | ذكر | 1 | FALSE |
| FEMALE | Female | أنثى | 2 | FALSE |
| PREFER_NOT_TO_SAY | Prefer not to say | أفضل عدم الإفصاح | 3 | FALSE |

---

#### CATEGORY 10: RELATIONSHIP_TYPES
**Purpose:** Personal/professional relationship types  
**Module:** HR  
**Supports:** None  
**Hierarchy:** No  

**Values:**
| value_code | value_label_en | value_label_ar | sort_order | is_default |
|---|---|---|---|---|
| SPOUSE | Spouse | زوج/زوجة | 1 | FALSE |
| CHILD | Child | طفل | 2 | FALSE |
| PARENT | Parent | والد/والدة | 3 | FALSE |
| SIBLING | Sibling | أخ/أخت | 4 | FALSE |
| EMERGENCY_CONTACT | Emergency Contact | جهة اتصال طوارئ | 5 | TRUE |
| DEPENDENT | Dependent | معال | 6 | FALSE |

---

#### CATEGORY 11: DOCUMENT_STATUS_TYPES
**Purpose:** Document lifecycle status (DMS)  
**Module:** DMS  
**Supports:** Color, Badge  
**Hierarchy:** No  

**Values:**
| value_code | value_label_en | value_label_ar | color_hex | badge_variant | sort_order | is_default |
|---|---|---|---|---|---|---|
| DRAFT | Draft | مسودة | #9CA3AF | secondary | 1 | TRUE |
| ACTIVE | Active | نشط | #10B981 | success | 2 | FALSE |
| EXPIRED | Expired | منتهي الصلاحية | #EF4444 | destructive | 3 | FALSE |
| ARCHIVED | Archived | مؤرشف | #6B7280 | default | 4 | FALSE |
| SUPERSEDED | Superseded | تم استبداله | #F59E0B | warning | 5 | FALSE |

---

#### CATEGORY 12: RISK_LEVELS
**Purpose:** HSE risk levels  
**Module:** HSE  
**Supports:** Color, Badge  
**Hierarchy:** No  

**Values:**
| value_code | value_label_en | value_label_ar | color_hex | badge_variant | sort_order | is_default |
|---|---|---|---|---|---|---|
| CRITICAL | Critical | حرج | #7F1D1D | destructive | 1 | FALSE |
| HIGH | High | عالي | #EF4444 | destructive | 2 | FALSE |
| MEDIUM | Medium | متوسط | #F59E0B | warning | 3 | TRUE |
| LOW | Low | منخفض | #10B981 | success | 4 | FALSE |
| NEGLIGIBLE | Negligible | ضئيل | #D1D5DB | default | 5 | FALSE |

---

#### CATEGORY 13: SEVERITY_LEVELS
**Purpose:** Incident/issue severity  
**Module:** HSE  
**Supports:** Color, Badge  
**Hierarchy:** No  

**Values:**
| value_code | value_label_en | value_label_ar | color_hex | badge_variant | sort_order | is_default |
|---|---|---|---|---|---|---|
| CATASTROPHIC | Catastrophic | كارثي | #7F1D1D | destructive | 1 | FALSE |
| MAJOR | Major | كبير | #EF4444 | destructive | 2 | FALSE |
| MODERATE | Moderate | متوسط | #F59E0B | warning | 3 | TRUE |
| MINOR | Minor | صغير | #3B82F6 | default | 4 | FALSE |
| INSIGNIFICANT | Insignificant | ضئيل جداً | #10B981 | success | 5 | FALSE |

---

### 4.3 Seed SQL Generation Strategy

**Migration Approach:**
1. Insert categories first (with explicit `id` sequence so values can reference correct category)
2. Insert values second (referencing category IDs)
3. Mark all as `is_system=TRUE`, `is_locked=TRUE`
4. Set `created_by=NULL` (system seed), `created_at=NOW()`
5. Use `ON CONFLICT (category_code) DO NOTHING` for idempotency
6. Use `ON CONFLICT (category_id, value_code) DO NOTHING` for idempotency

**Example SQL Structure:**
``sql
-- Insert categories
INSERT INTO public.global_lookup_categories (
  category_code, category_name_en, category_name_ar, description, module_code,
  supports_hierarchy, supports_color, is_system, is_locked, is_active
) VALUES
  ('STATUS_TYPES', 'Status Types', 'أنواع الحالة', 'General status values', 'SYSTEM', FALSE, TRUE, TRUE, TRUE, TRUE),
  ('PRIORITY_LEVELS', 'Priority Levels', 'مستويات الأولوية', 'Priority classifications', 'SYSTEM', FALSE, TRUE, TRUE, TRUE, TRUE)
  -- ...
ON CONFLICT (category_code) DO NOTHING;

-- Insert values
INSERT INTO public.global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, color_hex, badge_variant, sort_order, is_default, is_system, is_locked, is_active
) VALUES
  ((SELECT id FROM public.global_lookup_categories WHERE category_code = 'STATUS_TYPES'), 'ACTIVE', 'Active', 'نشط', '#10B981', 'success', 1, TRUE, TRUE, TRUE, TRUE),
  ((SELECT id FROM public.global_lookup_categories WHERE category_code = 'STATUS_TYPES'), 'INACTIVE', 'Inactive', 'غير نشط', '#6B7280', 'default', 2, FALSE, TRUE, TRUE, TRUE)
  -- ...
ON CONFLICT (category_id, value_code) DO NOTHING;
``

---

## 5. PERMISSIONS PLAN

### 5.1 Required Permissions

| permission_code | permission_name | module_code | action_code | description | is_active |
|---|---|---|---|---|---|
| master_data.dashboard.view | View Master Data Dashboard | master_data | view | Access master data dashboard overview | TRUE |
| master_data.lookups.view | View Lookups | master_data | view | View lookup categories and values | TRUE |
| master_data.lookups.manage | Manage Lookups | master_data | manage | Create, update, deactivate lookup categories and values | TRUE |
| master_data.lookups.lock | Lock/Unlock Lookups | master_data | lock | Lock or unlock system lookup categories and values | TRUE |
| master_data.lookups.import | Import Lookups | master_data | import | Import lookup data from files (future) | TRUE |
| master_data.lookups.export | Export Lookups | master_data | export | Export lookup data to files | TRUE |
| master_data.lookups.audit_view | View Lookup Audit | master_data | audit_view | View audit logs for lookup changes | TRUE |

### 5.2 Default Role Assignments

**System Administrator (system_admin):**
- ALL master_data.* permissions (via existing "grant all" pattern)

**Group Administrator (group_admin):**
- `master_data.dashboard.view`
- `master_data.lookups.view`
- `master_data.lookups.manage`
- `master_data.lookups.export`
- `master_data.lookups.audit_view`

**Company Administrator (company_admin):**
- `master_data.dashboard.view`
- `master_data.lookups.view`
- `master_data.lookups.export`
- (NO manage permission — view only for company admins by default)

**Branch Administrator (branch_admin):**
- `master_data.lookups.view` (read-only)

**All Other Roles:**
- No access by default (must be explicitly assigned)

### 5.3 Permission Seed SQL

``sql
-- Insert master data permissions
INSERT INTO public.permissions (
  permission_code,
  permission_name,
  description,
  module_code,
  action_code,
  is_active
) VALUES
  ('master_data.dashboard.view', 'View Master Data Dashboard', 'Access master data dashboard overview', 'master_data', 'view', TRUE),
  ('master_data.lookups.view', 'View Lookups', 'View lookup categories and values', 'master_data', 'view', TRUE),
  ('master_data.lookups.manage', 'Manage Lookups', 'Create, update, deactivate lookup categories and values', 'master_data', 'manage', TRUE),
  ('master_data.lookups.lock', 'Lock/Unlock Lookups', 'Lock or unlock system lookup categories and values', 'master_data', 'lock', TRUE),
  ('master_data.lookups.import', 'Import Lookups', 'Import lookup data from files (future enhancement)', 'master_data', 'import', TRUE),
  ('master_data.lookups.export', 'Export Lookups', 'Export lookup data to files', 'master_data', 'export', TRUE),
  ('master_data.lookups.audit_view', 'View Lookup Audit', 'View audit logs for lookup changes', 'master_data', 'audit_view', TRUE)
ON CONFLICT (permission_code) DO NOTHING;

-- Grant all master_data.* permissions to system_admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'system_admin'
  AND p.permission_code LIKE 'master_data.%'
ON CONFLICT DO NOTHING;

-- Grant selected permissions to group_admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'group_admin'
  AND p.permission_code IN (
    'master_data.dashboard.view',
    'master_data.lookups.view',
    'master_data.lookups.manage',
    'master_data.lookups.export',
    'master_data.lookups.audit_view'
  )
ON CONFLICT DO NOTHING;

-- Grant read-only permissions to company_admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'company_admin'
  AND p.permission_code IN (
    'master_data.dashboard.view',
    'master_data.lookups.view',
    'master_data.lookups.export'
  )
ON CONFLICT DO NOTHING;

-- Grant view permission to branch_admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'branch_admin'
  AND p.permission_code = 'master_data.lookups.view'
ON CONFLICT DO NOTHING;
``

### 5.4 Sidebar Visibility Logic

**Master Data Group Visibility:** User must have `master_data.dashboard.view` OR any `master_data.lookups.*` permission

**Lookup Categories Link:** Requires `master_data.lookups.view`

**Lookup Values Link:** Requires `master_data.lookups.view`

**Locked System Values Link:** Requires `master_data.lookups.view`

---

## 6. RLS POLICY PLAN

### 6.1 RLS Strategy Overview

**Philosophy:** Lookup data is **globally scoped** reference data, not tenant-scoped transactional data. Therefore:
- **Read (SELECT):** Any authenticated user with `master_data.lookups.view` permission can read all lookups
- **Write (INSERT/UPDATE):** Requires `master_data.lookups.manage` permission
- **Lock/Unlock:** Requires `master_data.lookups.lock` permission
- **System Protection:** Locked categories/values cannot be modified unless user has lock permission
- **No Tenant Filtering:** Lookups are shared across all companies/branches

### 6.2 Complete RLS Policies

**Enable RLS:**
``sql
ALTER TABLE public.global_lookup_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_lookup_values ENABLE ROW LEVEL SECURITY;
``

**Policy 1: Lookup Categories SELECT**
``sql
CREATE POLICY lookup_categories_select
  ON public.global_lookup_categories
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_has_permission_any_scope('master_data.lookups.view')
  );
``

**Policy 2: Lookup Categories INSERT**
``sql
CREATE POLICY lookup_categories_insert
  ON public.global_lookup_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_has_permission_any_scope('master_data.lookups.manage')
  );
``

**Policy 3: Lookup Categories UPDATE**
``sql
CREATE POLICY lookup_categories_update
  ON public.global_lookup_categories
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_has_permission_any_scope('master_data.lookups.manage')
    AND (
      -- If category is locked, user must have lock permission
      is_locked = FALSE
      OR public.current_user_has_permission_any_scope('master_data.lookups.lock')
    )
  )
  WITH CHECK (
    public.current_user_has_permission_any_scope('master_data.lookups.manage')
    AND (
      -- If category is locked, user must have lock permission
      is_locked = FALSE
      OR public.current_user_has_permission_any_scope('master_data.lookups.lock')
    )
  );
``

**Policy 4: Lookup Categories DELETE (Disabled)**
``sql
CREATE POLICY lookup_categories_delete
  ON public.global_lookup_categories
  FOR DELETE
  TO authenticated
  USING (FALSE);
  -- Direct deletion disabled; use deactivation via UPDATE
``

**Policy 5: Lookup Values SELECT**
``sql
CREATE POLICY lookup_values_select
  ON public.global_lookup_values
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_has_permission_any_scope('master_data.lookups.view')
  );
``

**Policy 6: Lookup Values INSERT**
``sql
CREATE POLICY lookup_values_insert
  ON public.global_lookup_values
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_has_permission_any_scope('master_data.lookups.manage')
    AND EXISTS (
      -- Ensure parent category exists and is not locked (or user has lock permission)
      SELECT 1 FROM public.global_lookup_categories
      WHERE id = category_id
        AND (
          is_locked = FALSE
          OR public.current_user_has_permission_any_scope('master_data.lookups.lock')
        )
    )
  );
``

**Policy 7: Lookup Values UPDATE**
``sql
CREATE POLICY lookup_values_update
  ON public.global_lookup_values
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_has_permission_any_scope('master_data.lookups.manage')
    AND (
      -- If value is locked, user must have lock permission
      is_locked = FALSE
      OR public.current_user_has_permission_any_scope('master_data.lookups.lock')
    )
  )
  WITH CHECK (
    public.current_user_has_permission_any_scope('master_data.lookups.manage')
    AND (
      -- If value is locked, user must have lock permission
      is_locked = FALSE
      OR public.current_user_has_permission_any_scope('master_data.lookups.lock')
    )
  );
``

**Policy 8: Lookup Values DELETE (Disabled)**
``sql
CREATE POLICY lookup_values_delete
  ON public.global_lookup_values
  FOR DELETE
  TO authenticated
  USING (FALSE);
  -- Direct deletion disabled; use deactivation via UPDATE
``

### 6.3 RLS Testing Checklist

**Test 1:** User without `master_data.lookups.view` → Cannot SELECT categories or values  
**Test 2:** User with view permission → Can SELECT all categories and values  
**Test 3:** User without manage permission → Cannot INSERT/UPDATE categories or values  
**Test 4:** User with manage permission → Can INSERT/UPDATE unlocked categories and values  
**Test 5:** User with manage but without lock permission → Cannot UPDATE locked categories or values  
**Test 6:** User with lock permission → Can UPDATE locked categories and values  
**Test 7:** Any user → Cannot DELETE categories or values directly (RLS blocks)  
**Test 8:** Direct SQL via psql (bypassing RLS) → Blocked by RLS policies  

---

## 7. AUDIT LOGGING PLAN

### 7.1 Audit Requirements

**All lookup changes MUST be audited:**
- Category created, updated, activated, deactivated, locked, unlocked
- Value created, updated, activated, deactivated, locked, unlocked, default changed, sort order changed
- Import performed (when implemented)
- Export performed (if audit tracks exports)

**Audit Table:** `public.audit_logs`  
**Module Code:** `'master_data'`  
**Entity Names:** `'global_lookup_categories'`, `'global_lookup_values'`

### 7.2 Audit Actions to Log

**Lookup Categories:**
- `'create_category'` — New category created
- `'update_category'` — Category metadata updated
- `'activate_category'` — Category activated (`is_active` → TRUE)
- `'deactivate_category'` — Category deactivated (`is_active` → FALSE)
- `'lock_category'` — Category locked (`is_locked` → TRUE)
- `'unlock_category'` — Category unlocked (`is_locked` → FALSE)

**Lookup Values:**
- `'create_value'` — New value created
- `'update_value'` — Value metadata updated
- `'activate_value'` — Value activated
- `'deactivate_value'` — Value deactivated
- `'lock_value'` — Value locked
- `'unlock_value'` — Value unlocked
- `'set_default_value'` — Value marked as default
- `'reorder_values'` — Sort order changed

**Import/Export:**
- `'import_lookups'` — Bulk import performed (future)
- `'export_lookups'` — Export generated (optional)

### 7.3 Audit Log Call Pattern

**Example from Server Action:**
``typescript
await logAudit({
  module_code: "master_data",
  entity_name: "global_lookup_categories",
  entity_id: categoryId,
  entity_reference: categoryCode,
  action: "create_category",
  new_values: { ...newCategoryData },
});
``

**Example with Old/New Values:**
``typescript
await logAudit({
  module_code: "master_data",
  entity_name: "global_lookup_values",
  entity_id: valueId,
  entity_reference: ${categoryCode}.,
  action: "update_value",
  old_values: existingValueData,
  new_values: updatedValueData,
});
``

### 7.4 Audit Log Viewing

**Permission Required:** `master_data.lookups.audit_view`

**Filter Options:**
- Entity name (categories vs values)
- Action type
- Date range
- User (actor_user_profile_id)
- Category code
- Value code

**Integration:** Master Data Dashboard can show "Recent Lookup Changes" widget with last 10 audit entries

---

## 8. SERVER ACTIONS / SERVICES PLAN

### 8.1 File Structure

**Following numbering module pattern:**

``
src/
  server/
    actions/
      master-data/
        lookups.ts  ← All server actions (exported "use server" functions)
  features/
    master-data/
      lookups/
        types.ts       ← TypeScript types and Zod schemas
        validation.ts  ← Additional validation logic
        lib.ts         ← Helper functions
        hooks/
          use-lookup-values.ts       ← React hook for data loading
          use-lookup-categories.ts   ← React hook for category data
        components/
          lookup-categories-table.tsx
          lookup-values-table.tsx
          lookup-category-drawer-form.tsx
          lookup-value-drawer-form.tsx
          lookup-dashboard-cards.tsx
``

### 8.2 Required Server Actions

**File:** `src/server/actions/master-data/lookups.ts`

#### 8.2.1 Lookup Categories Actions

**listLookupCategories()**
- Input: Optional filters (active/inactive, module_code, system/locked)
- Output: `ActionResult<LookupCategory[]>`
- Permission: `master_data.lookups.view`
- RLS: Automatic via policy
- Audit: No (read-only)

**getLookupCategoryById(id: number)**
- Input: Category ID
- Output: `ActionResult<LookupCategory>`
- Permission: `master_data.lookups.view`
- RLS: Automatic
- Audit: No

**createLookupCategory(input: CreateLookupCategoryInput)**
- Input: Zod-validated category data
- Output: `ActionResult<{ id: number }>`
- Permission: `master_data.lookups.manage`
- Validation: category_code uppercase, unique, format check
- RLS: Automatic
- Audit: YES (`'create_category'`)
- Revalidate: `/admin/master-data/lookups/categories`

**updateLookupCategory(input: UpdateLookupCategoryInput)**
- Input: Zod-validated category data (with id)
- Output: `ActionResult<{ id: number }>`
- Permission: `master_data.lookups.manage` (+ `master_data.lookups.lock` if locked)
- Validation: Check if locked, check if category_code immutable
- RLS: Automatic (locked check in policy)
- Audit: YES (`'update_category'`)
- Revalidate: `/admin/master-data/lookups/categories`

**deactivateLookupCategory(id: number, reason: string)**
- Input: Category ID, deactivation reason
- Output: `ActionResult<{ id: number }>`
- Permission: `master_data.lookups.manage`
- Logic: Set `is_active=FALSE`, `deactivated_at=NOW()`, `deactivated_by=current_user`, `deactivation_reason`
- RLS: Automatic
- Audit: YES (`'deactivate_category'`)

**reactivateLookupCategory(id: number)**
- Input: Category ID
- Output: `ActionResult<{ id: number }>`
- Permission: `master_data.lookups.manage`
- Logic: Set `is_active=TRUE`, `deactivated_at=NULL`, `deactivated_by=NULL`, `deactivation_reason=NULL`
- Audit: YES (`'activate_category'`)

**lockLookupCategory(id: number)**
- Input: Category ID
- Output: `ActionResult<{ id: number }>`
- Permission: `master_data.lookups.lock`
- Logic: Set `is_locked=TRUE`
- Audit: YES (`'lock_category'`)

**unlockLookupCategory(id: number)**
- Input: Category ID
- Output: `ActionResult<{ id: number }>`
- Permission: `master_data.lookups.lock`
- Logic: Set `is_locked=FALSE`
- Audit: YES (`'unlock_category'`)

#### 8.2.2 Lookup Values Actions

**listLookupValues(categoryId?: number, includeInactive?: boolean)**
- Input: Optional category filter, include inactive flag
- Output: `ActionResult<LookupValue[]>`
- Permission: `master_data.lookups.view`
- Logic: Filter by category if provided, exclude inactive unless includeInactive=true AND user has manage permission
- RLS: Automatic
- Audit: No

**getLookupValueById(id: number)**
- Input: Value ID
- Output: `ActionResult<LookupValue>`
- Permission: `master_data.lookups.view`
- RLS: Automatic
- Audit: No

**getLookupValuesByCategoryCode(categoryCode: string, includeInactive?: boolean)**
- Input: Category code, include inactive flag
- Output: `ActionResult<LookupValue[]>`
- Permission: `master_data.lookups.view`
- Logic: Join to category, filter by category_code, order by sort_order
- RLS: Automatic
- Audit: No
- **CRITICAL:** This is the main function used by LookupSelect component

**createLookupValue(input: CreateLookupValueInput)**
- Input: Zod-validated value data
- Output: `ActionResult<{ id: number }>`
- Permission: `master_data.lookups.manage`
- Validation: value_code uppercase, unique within category, parent same category, color format, effective dates
- RLS: Automatic (checks parent category lock status)
- Audit: YES (`'create_value'`)
- Revalidate: `/admin/master-data/lookups/values`

**updateLookupValue(input: UpdateLookupValueInput)**
- Input: Zod-validated value data (with id)
- Output: `ActionResult<{ id: number }>`
- Permission: `master_data.lookups.manage` (+ `master_data.lookups.lock` if locked)
- Validation: Same as create, plus check locked status
- RLS: Automatic
- Audit: YES (`'update_value'`)
- Revalidate: `/admin/master-data/lookups/values`

**deactivateLookupValue(id: number, reason: string)**
- Input: Value ID, reason
- Output: `ActionResult<{ id: number }>`
- Permission: `master_data.lookups.manage`
- Logic: Set inactive, capture audit fields
- Audit: YES (`'deactivate_value'`)

**reactivateLookupValue(id: number)**
- Input: Value ID
- Output: `ActionResult<{ id: number }>`
- Permission: `master_data.lookups.manage`
- Audit: YES (`'activate_value'`)

**lockLookupValue(id: number)**
- Permission: `master_data.lookups.lock`
- Audit: YES (`'lock_value'`)

**unlockLookupValue(id: number)**
- Permission: `master_data.lookups.lock`
- Audit: YES (`'unlock_value'`)

**setDefaultLookupValue(id: number)**
- Input: Value ID
- Output: `ActionResult<{ id: number }>`
- Permission: `master_data.lookups.manage`
- Logic: Set `is_default=TRUE` for this value, set `is_default=FALSE` for all other values in same category (transaction)
- Audit: YES (`'set_default_value'`)

**reorderLookupValues(categoryId: number, valueIds: number[])**
- Input: Category ID, ordered array of value IDs
- Output: `ActionResult<void>`
- Permission: `master_data.lookups.manage`
- Logic: Update `sort_order` for each value in transaction
- Audit: YES (`'reorder_values'`)

### 8.3 TypeScript Types

**File:** `src/features/master-data/lookups/types.ts`

``typescript
import { z } from "zod";

// Database types
export type LookupCategory = {
  id: number;
  category_code: string;
  category_name_en: string;
  category_name_ar: string | null;
  description: string | null;
  module_code: string | null;
  category_scope: string;
  supports_hierarchy: boolean;
  supports_color: boolean;
  supports_icon: boolean;
  supports_effective_dates: boolean;
  supports_metadata: boolean;
  is_system: boolean;
  is_locked: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
  deactivated_at: string | null;
  deactivated_by: number | null;
  deactivation_reason: string | null;
};

export type LookupValue = {
  id: number;
  category_id: number;
  value_code: string;
  value_label_en: string;
  value_label_ar: string | null;
  description: string | null;
  parent_value_id: number | null;
  color_hex: string | null;
  icon_name: string | null;
  badge_variant: string | null;
  sort_order: number;
  is_default: boolean;
  is_system: boolean;
  is_locked: boolean;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  metadata_json: Record<string, any>;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
  deactivated_at: string | null;
  deactivated_by: number | null;
  deactivation_reason: string | null;
};

// Zod schemas
export const createLookupCategorySchema = z.object({
  category_code: z.string()
    .min(2, "Category code must be at least 2 characters")
    .max(100, "Category code too long")
    .regex(/^[A-Z0-9_]+$/, "Category code must be uppercase letters, numbers, and underscores only")
    .transform(val => val.toUpperCase()),
  category_name_en: z.string().min(1, "English name required"),
  category_name_ar: z.string().optional(),
  description: z.string().optional(),
  module_code: z.string().optional(),
  category_scope: z.enum(["GLOBAL", "COMPANY", "BRANCH", "MODULE"]).default("GLOBAL"),
  supports_hierarchy: z.boolean().default(false),
  supports_color: z.boolean().default(false),
  supports_icon: z.boolean().default(false),
  supports_effective_dates: z.boolean().default(false),
  supports_metadata: z.boolean().default(true),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const updateLookupCategorySchema = createLookupCategorySchema.partial().extend({
  id: z.number(),
});

export const createLookupValueSchema = z.object({
  category_id: z.number(),
  value_code: z.string()
    .min(1, "Value code required")
    .max(100, "Value code too long")
    .regex(/^[A-Z0-9_]+$/, "Value code must be uppercase letters, numbers, and underscores only")
    .transform(val => val.toUpperCase()),
  value_label_en: z.string().min(1, "English label required"),
  value_label_ar: z.string().optional(),
  description: z.string().optional(),
  parent_value_id: z.number().nullable().optional(),
  color_hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color").optional(),
  icon_name: z.string().optional(),
  badge_variant: z.enum(["default", "secondary", "destructive", "outline", "success", "warning"]).optional(),
  sort_order: z.number().int().default(0),
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
  effective_from: z.string().optional(), // ISO date string
  effective_to: z.string().optional(),
  metadata_json: z.record(z.any()).optional(),
});

export const updateLookupValueSchema = createLookupValueSchema.partial().extend({
  id: z.number(),
});

export type CreateLookupCategoryInput = z.infer<typeof createLookupCategorySchema>;
export type UpdateLookupCategoryInput = z.infer<typeof updateLookupCategorySchema>;
export type CreateLookupValueInput = z.infer<typeof createLookupValueSchema>;
export type UpdateLookupValueInput = z.infer<typeof updateLookupValueSchema>;
``

---

## 9. VALIDATION PLAN

### 9.1 Category Validation

**Database Level (CHECK constraints):**
- `category_code` format: `^[A-Z0-9_]+$` (uppercase alphanumeric + underscore)
- `category_code` uppercase: `category_code = UPPER(category_code)`
- `category_scope` enum: IN ('GLOBAL', 'COMPANY', 'BRANCH', 'MODULE')
- Deactivation logic: active XOR deactivated_at set

**Application Level (Zod):**
- `category_code`: min 2 chars, max 100, pattern, auto-uppercase transform
- `category_name_en`: required, min 1 char
- `category_scope`: enum with default 'GLOBAL'
- `sort_order`: integer, default 0

**Business Logic:**
- `category_code` is IMMUTABLE after creation (prevent updates to this field)
- Locked categories require `master_data.lookups.lock` permission to update
- Cannot deactivate category if it has active values (optional future enhancement)

### 9.2 Value Validation

**Database Level:**
- `value_code` format: `^[A-Z0-9_]+$`
- `value_code` uppercase: `value_code = UPPER(value_code)`
- Unique (category_id, value_code)
- `parent_value_id` != id (no self-reference)
- `color_hex` format: `^#[0-9A-Fa-f]{6}$`
- `effective_to >= effective_from`
- Deactivation logic: active XOR deactivated_at set

**Application Level (Zod):**
- `category_id`: required number
- `value_code`: min 1 char, max 100, pattern, auto-uppercase
- `value_label_en`: required, min 1 char
- `color_hex`: regex validation `/^#[0-9A-Fa-f]{6}$/`
- `badge_variant`: enum
- `effective_from/to`: ISO date strings

**Business Logic (via trigger):**
- `parent_value_id` must belong to same category (`validate_lookup_value_parent_category()` trigger)
- Only one active default value per category (optional, can be application-enforced)
- Locked values require `master_data.lookups.lock` permission to update

### 9.3 Client-Side Validation

**Form Validation (React Hook Form + Zod):**
- Real-time validation on field blur
- Submit-time validation with error display
- Required field indicators
- Pattern format helpers (e.g., color picker for `color_hex`)

**Validation Error Display:**
- Inline field errors (red text below input)
- `ERPValidationSummary` in footer (error count badge)
- Prevent submit if validation fails

---

## 10. UI / SCREEN PLAN

### 10.1 Sidebar Integration

**Modify:** `src/components/layout/app-sidebar.tsx`

**Add New Group:**
``typescript
{
  label: "Master Data",
  items: [
    { label: "Master Data Dashboard", icon: Database, path: "/admin/master-data" },
    { label: "Global Lookups", icon: ChevronDown, path: "#", subItems: [
      { label: "Lookup Categories", icon: FolderOpen, path: "/admin/master-data/lookups/categories" },
      { label: "Lookup Values", icon: List, path: "/admin/master-data/lookups/values" },
      { label: "Locked System Values", icon: Lock, path: "/admin/master-data/lookups/system" },
    ]},
  ],
},
``

**Permission Logic:**
- "Master Data" group visible if user has `master_data.dashboard.view` OR any `master_data.lookups.*` permission
- "Global Lookups" submenu visible if user has `master_data.lookups.view`
- Individual links active based on current path

**Icon Imports Needed:**
``typescript
import { Database, FolderOpen, List, Lock } from "lucide-react";
``

**Submenu Implementation:**
- Collapsible nested group
- Active highlighting for current route
- Indentation for hierarchy

---

### 10.2 Master Data Dashboard

**Route:** `/admin/master-data`  
**File:** `src/app/(protected)/admin/master-data/page.tsx`

**Permission Gate:** `master_data.dashboard.view`

**Layout:**
``tsx
<div className="flex flex-col gap-6">
  <ERPPageHeader
    title="Master Data Management"
    description="Centralized management of all master data and reference tables"
    breadcrumbs={[
      { label: "Dashboard", href: "/dashboard" },
      { label: "Administration" },
      { label: "Master Data" },
    ]}
  />

  {/* Summary Cards */}
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    <ERPStatCard
      title="Lookup Categories"
      value={stats.totalCategories.toString()}
      description={\\ active\}
      icon={FolderOpen}
      iconColor="text-blue-600"
    />
    <ERPStatCard
      title="Lookup Values"
      value={stats.totalValues.toString()}
      description={\\ active\}
      icon={List}
      iconColor="text-teal-600"
    />
    <ERPStatCard
      title="System Locked"
      value={stats.lockedValues.toString()}
      description="Protected values"
      icon={Lock}
      iconColor="text-amber-600"
    />
    <ERPStatCard
      title="Recently Updated"
      value={stats.recentChanges.toString()}
      description="Last 7 days"
      icon={Clock}
      iconColor="text-purple-600"
    />
  </div>

  {/* Recent Changes Widget */}
  <ERPSectionCard
    title="Recent Lookup Changes"
    description="Latest updates to lookup categories and values"
  >
    {/* Mini audit log table - last 10 entries */}
  </ERPSectionCard>

  {/* Quick Links */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    <LinkCard href="/admin/master-data/lookups/categories" icon={FolderOpen} title="Manage Categories" />
    <LinkCard href="/admin/master-data/lookups/values" icon={List} title="Manage Values" />
    <LinkCard href="/admin/master-data/lookups/system" icon={Lock} title="System Locked Values" />
  </div>
</div>
``

**Stats Calculation:**
- Query counts from `global_lookup_categories` and `global_lookup_values`
- Filter by `is_active`, `is_locked`
- Count recent audit log entries (`updated_at >= NOW() - INTERVAL '7 days'`)

---

### 10.3 Lookup Categories Page

**Route:** `/admin/master-data/lookups/categories`  
**File:** `src/app/(protected)/admin/master-data/lookups/categories/page.tsx`

**Permission Gate:** `master_data.lookups.view`

**Features:**
- **ERPDataTable** with columns: category_code, category_name_en, category_name_ar, module_code, supports_hierarchy, supports_color, is_system, is_locked, is_active, updated_at
- **Search** by category_code or name
- **Filters:** Active/Inactive, System/Custom, Locked/Unlocked, Module Code
- **Actions per row:** View (eye icon), Edit (if has manage permission), Lock/Unlock (if has lock permission), Activate/Deactivate (if has manage permission)
- **Bulk Actions:** None initially (future: bulk activate/deactivate)
- **Add Category Button** (if has manage permission)
- **Export Button** (if has export permission)

**Add/Edit Drawer:**
- Uses `ERPDrawerForm`
- Sections: Basic Information, Scope and Behavior, Status and Governance, Audit Information
- Form fields: category_code (immutable if edit), category_name_en, category_name_ar, description, module_code (select), category_scope (select), support flags (checkboxes), is_active (toggle), sort_order
- Locked categories show warning badge
- System categories show info badge

**Table Component:**
``tsx
<ERPDataTable
  columns={categoryColumns}
  data={categories}
  searchPlaceholder="Search categories..."
  onRowClick={(row) => openViewDrawer(row)}
/>
``

---

### 10.4 Lookup Values Page

**Route:** `/admin/master-data/lookups/values`  
**File:** `src/app/(protected)/admin/master-data/lookups/values/page.tsx`

**Permission Gate:** `master_data.lookups.view`

**Features:**
- **Category Selector** at top (dropdown or tabs)
- **ERPDataTable** with columns: category_code, value_code, value_label_en, value_label_ar, parent_value (if hierarchy), color/badge preview, sort_order, is_default (star icon), is_system, is_locked, is_active, updated_at
- **Search** by value_code or label
- **Filters:** Active/Inactive, System/Custom, Locked/Unlocked, Has Parent (for hierarchical), Is Default
- **Actions per row:** View, Edit, Lock/Unlock, Activate/Deactivate, Set as Default, Reorder (drag handle)
- **Add Value Button** (requires category selection)
- **Reorder Mode Toggle** (drag-drop sort order)
- **Export Button**

**Add/Edit Drawer:**
- Uses `ERPDrawerForm`
- Sections: Basic Information, Hierarchy and Display, Effective Dates and Metadata, Status and Governance, Audit Information
- Form fields: category_id (select, disabled if edit), value_code (immutable if edit), value_label_en, value_label_ar, description, parent_value_id (select from same category, only if category supports hierarchy), color_hex (color picker), icon_name (icon selector), badge_variant (select), sort_order, is_default (toggle), is_active (toggle), effective_from/to (date pickers), metadata_json (JSON editor or key-value pairs)

**Color Badge Preview:**
``tsx
{row.color_hex && (
  <Badge variant={row.badge_variant as any} style={{ backgroundColor: row.color_hex }}>
    {row.value_label_en}
  </Badge>
)}
``

---

### 10.5 Locked System Values Page

**Route:** `/admin/master-data/lookups/system`  
**File:** `src/app/(protected)/admin/master-data/lookups/system/page.tsx`

**Permission Gate:** `master_data.lookups.view`

**Option A: Separate Filtered Page**
- Same UI as Lookup Values page
- Pre-filtered to `is_locked = TRUE` or `is_system = TRUE`
- Read-only emphasis (show warning banner)
- Edit button disabled unless user has `master_data.lookups.lock` permission

**Option B: Redirect to Values Page with Filter**
- Redirect to `/admin/master-data/lookups/values?filter=locked`
- Apply locked filter automatically

**Recommendation:** Option A (dedicated page) for clarity and security emphasis

**Layout:**
``tsx
<div className="flex flex-col gap-4">
  <ERPPageHeader
    title="Locked System Values"
    description="System-protected lookup values that require special permission to modify"
  />

  <div className="bg-amber-50 border-l-4 border-amber-500 p-4 text-sm text-amber-800">
    <p><strong>Warning:</strong> These values are locked for system integrity. Only users with master_data.lookups.lock permission can modify them.</p>
  </div>

  <ERPSectionCard title="Locked Categories">
    {/* Table of locked categories */}
  </ERPSectionCard>

  <ERPSectionCard title="Locked Values">
    {/* Table of locked values */}
  </ERPSectionCard>
</div>
``

---

### 10.6 Drawer Form Sections

**Lookup Category Drawer:**

**Section 1: Basic Information**
- category_code (text input, uppercase, immutable after creation)
- category_name_en (text input, required)
- category_name_ar (text input, optional, RTL support)
- description (textarea)

**Section 2: Scope and Behavior**
- module_code (select: SYSTEM, HR, FLEET, WORKSHOP, HSE, CRM, etc.)
- category_scope (select: GLOBAL, COMPANY, BRANCH, MODULE)
- supports_hierarchy (checkbox)
- supports_color (checkbox)
- supports_icon (checkbox)
- supports_effective_dates (checkbox)
- supports_metadata (checkbox)

**Section 3: Status and Governance**
- is_system (badge, read-only)
- is_locked (toggle, requires lock permission)
- is_active (toggle)
- sort_order (number input)

**Section 4: Audit Information**
- created_at, created_by (read-only, formatted)
- updated_at, updated_by (read-only, formatted)
- deactivated_at, deactivated_by, deactivation_reason (read-only if deactivated)

---

**Lookup Value Drawer:**

**Section 1: Basic Information**
- category_id (select, required, disabled if edit)
- value_code (text input, uppercase, immutable after creation)
- value_label_en (text input, required)
- value_label_ar (text input, optional, RTL support)
- description (textarea)

**Section 2: Hierarchy and Display**
- parent_value_id (select from same category values, only if category.supports_hierarchy)
- color_hex (color picker, only if category.supports_color)
- icon_name (icon selector, only if category.supports_icon)
- badge_variant (select: default, secondary, destructive, outline, success, warning)
- sort_order (number input)
- is_default (toggle with warning: "Only one default value per category")

**Section 3: Effective Dates and Metadata**
- effective_from (date picker, only if category.supports_effective_dates)
- effective_to (date picker, only if category.supports_effective_dates)
- metadata_json (JSON editor or dynamic key-value form, only if category.supports_metadata)

**Section 4: Status and Governance**
- is_system (badge, read-only)
- is_locked (toggle, requires lock permission)
- is_active (toggle)

**Section 5: Audit Information**
- Same as category drawer

---

## 11. REUSABLE LOOKUPSELECT COMPONENT PLAN

### 11.1 Component Purpose

A reusable, production-ready Select component that loads lookup values dynamically from the database and integrates seamlessly with React Hook Form and existing ERP forms.

### 11.2 File Structure

``
src/
  components/
    erp/
      lookup-select.tsx  ← Main component
  features/
    master-data/
      lookups/
        hooks/
          use-lookup-values.ts  ← Data fetching hook
``

### 11.3 LookupSelect Component Specification

**File:** `src/components/erp/lookup-select.tsx`

**Component Interface:**
``typescript
export interface LookupSelectProps {
  // Required
  categoryCode: string; // e.g., 'STATUS_TYPES', 'PRIORITY_LEVELS'
  value?: string; // Selected value_code
  onValueChange?: (value: string) => void;

  // Optional Filtering
  includeInactive?: boolean; // Default: false
  parentValueCode?: string; // Filter to children of this parent (hierarchical lookups)
  moduleCode?: string; // Future: filter by module

  // Display Options
  language?: "en" | "ar"; // Default: 'en'
  showCode?: boolean; // Show value_code alongside label, default: false
  showColor?: boolean; // Show color badge if available, default: true
  placeholder?: string; // Default: "Select..."

  // Behavior
  disabled?: boolean;
  required?: boolean;
  allowClear?: boolean; // Show clear/reset button, default: true

  // Styling
  className?: string;

  // React Hook Form Integration
  name?: string;
  error?: string; // Validation error message
}
``

**Component Implementation:**
``tsx
"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useLookupValues } from "@/features/master-data/lookups/hooks/use-lookup-values";
import { Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function LookupSelect({
  categoryCode,
  value,
  onValueChange,
  includeInactive = false,
  parentValueCode,
  language = "en",
  showCode = false,
  showColor = true,
  placeholder = "Select...",
  disabled = false,
  required = false,
  allowClear = true,
  className,
  name,
  error,
}: LookupSelectProps) {
  const { values, isLoading, error: loadError } = useLookupValues({
    categoryCode,
    includeInactive,
    parentValueCode,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading options...</span>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive">
        <AlertCircle className="h-4 w-4" />
        <span>Failed to load options</span>
      </div>
    );
  }

  const displayLabel = (val: LookupValue) => {
    const label = language === "ar" && val.value_label_ar
      ? val.value_label_ar
      : val.value_label_en;
    return showCode ? \\ - \\ : label;
  };

  return (
    <div className="space-y-1">
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger
          className={cn(
            "w-full",
            error && "border-destructive",
            className
          )}
          name={name}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowClear && value && (
            <SelectItem value="">
              <span className="text-muted-foreground italic">Clear selection</span>
            </SelectItem>
          )}
          {values.map((val) => (
            <SelectItem key={val.id} value={val.value_code}>
              <div className="flex items-center gap-2">
                {showColor && val.color_hex && (
                  <div
                    className="h-3 w-3 rounded-full border border-border"
                    style={{ backgroundColor: val.color_hex }}
                  />
                )}
                <span>{displayLabel(val)}</span>
                {val.is_default && (
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    Default
                  </Badge>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
``

---

### 11.4 useLookupValues Hook

**File:** `src/features/master-data/lookups/hooks/use-lookup-values.ts`

``tsx
"use client";

import { useEffect, useState } from "react";
import { getLookupValuesByCategoryCode } from "@/server/actions/master-data/lookups";
import type { LookupValue } from "@/features/master-data/lookups/types";

interface UseLookupValuesOptions {
  categoryCode: string;
  includeInactive?: boolean;
  parentValueCode?: string;
}

interface UseLookupValuesResult {
  values: LookupValue[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useLookupValues({
  categoryCode,
  includeInactive = false,
  parentValueCode,
}: UseLookupValuesOptions): UseLookupValuesResult {
  const [values, setValues] = useState<LookupValue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchValues = async () => {
    setIsLoading(true);
    setError(null);

    const result = await getLookupValuesByCategoryCode(
      categoryCode,
      includeInactive
    );

    if (result.success && result.data) {
      let filtered = result.data;

      // Filter by parent if specified
      if (parentValueCode) {
        const parentValue = filtered.find(v => v.value_code === parentValueCode);
        if (parentValue) {
          filtered = filtered.filter(v => v.parent_value_id === parentValue.id);
        }
      }

      setValues(filtered);
    } else {
      setError(result.error || "Failed to load lookup values");
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchValues();
  }, [categoryCode, includeInactive, parentValueCode]);

  return {
    values,
    isLoading,
    error,
    refetch: fetchValues,
  };
}
``

---

### 11.5 Usage Examples

**Example 1: Simple Status Select**
``tsx
<LookupSelect
  categoryCode="STATUS_TYPES"
  value={formData.status}
  onValueChange={(val) => setFormData({ ...formData, status: val })}
  required
/>
``

**Example 2: Priority Select with Color Badges**
``tsx
<LookupSelect
  categoryCode="PRIORITY_LEVELS"
  value={formData.priority}
  onValueChange={(val) => setFormData({ ...formData, priority: val })}
  showColor={true}
  placeholder="Select priority..."
/>
``

**Example 3: Hierarchical Address Type (Parent/Child)**
``tsx
{/* Parent */}
<LookupSelect
  categoryCode="ADDRESS_TYPES"
  value={formData.addressType}
  onValueChange={(val) => {
    setFormData({ ...formData, addressType: val, addressSubType: "" });
  }}
  placeholder="Select address type..."
/>

{/* Child (if parent has children) */}
{formData.addressType && (
  <LookupSelect
    categoryCode="ADDRESS_TYPES"
    parentValueCode={formData.addressType}
    value={formData.addressSubType}
    onValueChange={(val) => setFormData({ ...formData, addressSubType: val })}
    placeholder="Select sub-type..."
  />
)}
``

**Example 4: React Hook Form Integration**
``tsx
<Controller
  name="status"
  control={control}
  rules={{ required: "Status is required" }}
  render={({ field, fieldState }) => (
    <LookupSelect
      categoryCode="STATUS_TYPES"
      value={field.value}
      onValueChange={field.onChange}
      error={fieldState.error?.message}
      required
    />
  )}
/>
``

**Example 5: Arabic Language**
``tsx
<LookupSelect
  categoryCode="GENDER_TYPES"
  value={formData.gender}
  onValueChange={(val) => setFormData({ ...formData, gender: val })}
  language="ar"
/>
``

---

### 11.6 Caching Strategy

**Recommendation:** Client-side caching via `useLookupValues` hook

**Future Enhancement:** Server-side caching with `revalidatePath()` or SWR/React Query

**Revalidation Triggers:**
- When lookup values are created/updated/deactivated
- When category configuration changes
- Manual refetch via `refetch()` function

---

## 12. EXPORT / IMPORT PLAN

### 12.1 Export Functionality

**Status:** IMPLEMENT NOW (if existing export engine is stable)

**Permission Required:** `master_data.lookups.export`

**Integration Point:** `ERPExportMenu` component (if exists) or standalone export button

**Export Formats:**
- CSV (primary)
- Excel (if existing engine supports)
- PDF (if existing engine supports)

**Export Options:**

**Option 1: Export Categories**
- Exports all columns from `global_lookup_categories`
- File name: `lookup_categories_YYYYMMDD_HHMMSS.csv`

**Option 2: Export Values (Selected Category)**
- User selects category from dropdown
- Exports all values for that category
- Includes category context (category_code, category_name)
- File name: `lookup_values_{CATEGORY_CODE}_YYYYMMDD_HHMMSS.csv`

**Option 3: Export All Values**
- Exports all values from all categories
- Includes category information in each row
- File name: `lookup_values_all_YYYYMMDD_HHMMSS.csv`

**CSV Structure Example (Values):**
``csv
category_code,category_name_en,value_code,value_label_en,value_label_ar,color_hex,sort_order,is_default,is_active
STATUS_TYPES,Status Types,ACTIVE,Active,نشط,#10B981,1,TRUE,TRUE
STATUS_TYPES,Status Types,INACTIVE,Inactive,غير نشط,#6B7280,2,FALSE,TRUE
PRIORITY_LEVELS,Priority Levels,CRITICAL,Critical,حرج,#DC2626,1,FALSE,TRUE
...
``

**Export Implementation:**
- Reuse existing export infrastructure from organizations or numbering module
- Server action: `exportLookupCategories()` and `exportLookupValues(categoryCode?)`
- Client button: `<ERPExportMenu>` or custom `<ExportButton>`
- Include export metadata: generated by, generated at, filters applied

**Audit Export:**
- Optional: Log export action to audit_logs (`action: 'export_lookups'`)

---

### 12.2 Import Functionality

**Status:** DEFER TO FUTURE PHASE (Permission exists, UI shows placeholder)

**Rationale:**
- Import requires complex validation, error handling, rollback logic
- Risk of data corruption if implemented hastily
- Can be added in Phase 002F.3K without breaking existing functionality
- Permission exists now for RBAC completeness

**Current Implementation:**
- Add `master_data.lookups.import` permission to database (DONE in permissions seed)
- Show disabled "Import" button in UI with tooltip: "Bulk import will be available in a future release"

**Future Design (for reference):**

**Import Types:**
- Import Categories (CSV/Excel with category metadata)
- Import Values (CSV/Excel with values for one or all categories)

**Validation Requirements:**
- Schema validation (required fields, data types, format)
- Business logic validation (unique codes, valid references, parent/child consistency)
- Duplicate detection (skip, update, or error)
- Error reporting (row-level errors, summary)

**Import Process:**
1. Upload file
2. Parse and validate (show preview with errors)
3. User confirms
4. Transaction-based insert (all or nothing)
5. Log import batch to `global_lookup_import_batches` (future table)
6. Audit log

**Import UI Mockup (Future):**
``tsx
<Button variant="outline" disabled>
  <Upload className="h-4 w-4 mr-2" />
  Import Lookups
  <Badge variant="secondary" className="ml-2 text-[10px]">Future</Badge>
</Button>
``

**Tooltip Text:** "Bulk import functionality will be available in Phase 002F.3K. For now, please add lookup values manually using the Add Value button."

---

## 13. SIDEBAR / MENU MODIFICATION PLAN

### 13.1 Files to Modify

**Primary File:** `src/components/layout/app-sidebar.tsx`

### 13.2 Exact Modifications

**Import Additional Icons:**
``typescript
// Add to existing icon imports at top of file
import { Database, FolderOpen, List, Lock } from "lucide-react";
``

**Add Master Data Group to `navGroups` Array:**

Insert AFTER "Administration" group, BEFORE "Operations" group:

``typescript
{
  label: "Master Data",
  items: [
    { label: "Master Data Dashboard", icon: Database, path: "/admin/master-data" },
    {
      label: "Global Lookups",
      icon: FolderOpen,
      path: "/admin/master-data/lookups",
      subItems: [
        { label: "Lookup Categories", icon: FolderOpen, path: "/admin/master-data/lookups/categories" },
        { label: "Lookup Values", icon: List, path: "/admin/master-data/lookups/values" },
        { label: "Locked System Values", icon: Lock, path: "/admin/master-data/lookups/system" },
      ],
    },
  ],
},
``

**Note:** If `app-sidebar.tsx` does not support nested `subItems`, implement **Option B: Flat Structure**

**Option B: Flat Master Data Group (if no subItems support):**
``typescript
{
  label: "Master Data",
  items: [
    { label: "Master Data Dashboard", icon: Database, path: "/admin/master-data" },
    { label: "Lookup Categories", icon: FolderOpen, path: "/admin/master-data/lookups/categories" },
    { label: "Lookup Values", icon: List, path: "/admin/master-data/lookups/values" },
    { label: "Locked System Values", icon: Lock, path: "/admin/master-data/lookups/system" },
  ],
},
``

### 13.3 Permission-Based Visibility (Future Enhancement)

**Current Implementation:** All menu items visible to all authenticated users

**Future Enhancement (Phase 002F.3K):**
- Fetch user permissions in `ErpShell` layout
- Pass permissions to `AppSidebar`
- Filter menu items based on required permissions
- Hide "Master Data" group if no `master_data.*` permissions

**Permission Checks:**
``typescript
// Pseudo-code for future implementation
const canViewMasterData = ctx.permissions.some(p => p.startsWith('master_data.'));
const canViewLookups = ctx.permissions.includes('master_data.lookups.view');

if (!canViewMasterData) {
  // Hide entire Master Data group
}

if (!canViewLookups) {
  // Hide lookup-related items
}
``

---

## 14. FILE MODIFICATION PLAN

### 14.1 Files to CREATE

**Database:**
- `supabase/migrations/YYYYMMDDHHMMSS_erp_base_002f3b_global_lookup_engine.sql` (complete schema + seed data)

**Server Actions:**
- `src/server/actions/master-data/lookups.ts` (all CRUD actions)

**Types & Validation:**
- `src/features/master-data/lookups/types.ts` (types + Zod schemas)
- `src/features/master-data/lookups/validation.ts` (additional validation helpers)
- `src/features/master-data/lookups/lib.ts` (utility functions)

**Hooks:**
- `src/features/master-data/lookups/hooks/use-lookup-values.ts`
- `src/features/master-data/lookups/hooks/use-lookup-categories.ts`

**Components:**
- `src/features/master-data/lookups/components/lookup-categories-table.tsx`
- `src/features/master-data/lookups/components/lookup-values-table.tsx`
- `src/features/master-data/lookups/components/lookup-category-drawer-form.tsx`
- `src/features/master-data/lookups/components/lookup-value-drawer-form.tsx`
- `src/features/master-data/lookups/components/lookup-dashboard-cards.tsx`
- `src/components/erp/lookup-select.tsx` (global component)

**Pages:**
- `src/app/(protected)/admin/master-data/page.tsx` (dashboard)
- `src/app/(protected)/admin/master-data/lookups/categories/page.tsx`
- `src/app/(protected)/admin/master-data/lookups/values/page.tsx`
- `src/app/(protected)/admin/master-data/lookups/system/page.tsx`

**Documentation (Create at END of implementation):**
- `ERP_BASE_002F_3B_GLOBAL_LOOKUP_DROPDOWN_ENGINE_IMPLEMENTATION_REPORT.md` (post-implementation)

### 14.2 Files to MODIFY

**Sidebar:**
- `src/components/layout/app-sidebar.tsx` (add Master Data group)

**Existing Permissions (If Needed):**
- No changes required (permissions are additive)

### 14.3 Files to NOT MODIFY (Document for Future)

**Hardcoded Status CHECK Constraints:**
- `supabase/migrations/20260527120000_erp_base_foundation.sql` lines 36, 60, 79
- Document in Phase 002F.3K migration plan
- DO NOT migrate these now

**Existing Components with Hardcoded Dropdowns:**
- Search for hardcoded select options in `src/features/` and `src/components/`
- Document locations for Phase 002F.3K migration
- DO NOT modify these now

---

## 15. IMPLEMENTATION SEQUENCE PLAN

### 15.1 Recommended Implementation Order

This sequence minimizes dependencies and enables incremental testing:

**STEP 1: Database Foundation (High Priority)**
- Create migration file `YYYYMMDDHHMMSS_erp_base_002f3b_global_lookup_engine.sql`
- Define `global_lookup_categories` table with all constraints, indexes, triggers
- Define `global_lookup_values` table with all constraints, indexes, triggers, validation function
- Enable RLS on both tables
- Create all 8 RLS policies
- Insert 7 permissions (master_data.*)
- Assign permissions to roles (system_admin, group_admin, company_admin, branch_admin)
- Insert 13 seed categories
- Insert 3-7 seed values per category (total ~60-80 values)
- Test migration: `supabase db reset` or `supabase migration up`
- **Dependencies:** None
- **Failure Risk:** Medium (complex schema, must be perfect)
- **Mitigation:** Test migration in dev environment first, validate all constraints

---

**STEP 2: TypeScript Types & Validation (High Priority)**
- Create `src/features/master-data/lookups/types.ts`
- Define `LookupCategory` and `LookupValue` types matching database schema
- Define Zod schemas: `createLookupCategorySchema`, `updateLookupCategorySchema`, `createLookupValueSchema`, `updateLookupValueSchema`
- Export type inference types
- **Dependencies:** Step 1 (database schema knowledge)
- **Failure Risk:** Low
- **Mitigation:** Match database types exactly, test Zod validation

---

**STEP 3: Server Actions (High Priority)**
- Create `src/server/actions/master-data/lookups.ts`
- Implement all category actions (list, get, create, update, deactivate, reactivate, lock, unlock)
- Implement all value actions (list, get, getByCategoryCode, create, update, deactivate, reactivate, lock, unlock, setDefault, reorder)
- Add permission checks using `getAuthContext()` and `hasPermission()`
- Add audit logging for all mutations
- Add `revalidatePath()` calls
- Test each action via temporary test page or API route
- **Dependencies:** Step 1 (database), Step 2 (types)
- **Failure Risk:** Medium (complex business logic, RLS interaction)
- **Mitigation:** Test incrementally, verify RLS policies work as expected

---

**STEP 4: React Hooks (Medium Priority)**
- Create `src/features/master-data/lookups/hooks/use-lookup-values.ts`
- Create `src/features/master-data/lookups/hooks/use-lookup-categories.ts`
- Implement data fetching, loading states, error handling
- Add parent/child filtering logic
- **Dependencies:** Step 3 (server actions)
- **Failure Risk:** Low
- **Mitigation:** Test with various categoryCode values

---

**STEP 5: LookupSelect Component (High Priority)**
- Create `src/components/erp/lookup-select.tsx`
- Implement all props (categoryCode, value, onValueChange, includeInactive, parentValueCode, language, showCode, showColor, etc.)
- Integrate `useLookupValues` hook
- Add loading/error states
- Add color badge rendering
- Test with multiple lookup categories
- **Dependencies:** Step 4 (hooks)
- **Failure Risk:** Medium (complex component, must work in forms)
- **Mitigation:** Create test page with multiple LookupSelect instances

---

**STEP 6: Data Tables (Medium Priority)**
- Create `src/features/master-data/lookups/components/lookup-categories-table.tsx`
- Create `src/features/master-data/lookups/components/lookup-values-table.tsx`
- Define column schemas matching ERPDataTable pattern
- Add search, filters, actions (view/edit/delete icons)
- Add row click handlers
- **Dependencies:** Step 3 (server actions for data loading)
- **Failure Risk:** Low
- **Mitigation:** Follow existing table patterns from organizations/numbering

---

**STEP 7: Drawer Forms (Medium Priority)**
- Create `src/features/master-data/lookups/components/lookup-category-drawer-form.tsx`
- Create `src/features/master-data/lookups/components/lookup-value-drawer-form.tsx`
- Implement multi-section layout with `ERPDrawerForm`, `ERPDrawerSectionNav`, `ERPDrawerBody`, `ERPDrawerFooter`
- Integrate React Hook Form + Zod validation
- Wire up server actions (create/update)
- Add permission-based disable logic for locked items
- **Dependencies:** Step 3 (server actions), Step 5 (LookupSelect for category selector)
- **Failure Risk:** Medium (complex forms with validation)
- **Mitigation:** Test each section independently

---

**STEP 8: Dashboard Page (Low Priority)**
- Create `src/app/(protected)/admin/master-data/page.tsx`
- Add permission gate (`master_data.dashboard.view`)
- Query stats (total categories, total values, locked values, recent changes)
- Create stat cards using `ERPStatCard`
- Add "Recent Lookup Changes" section (mini audit log)
- Add quick links to categories/values/system pages
- **Dependencies:** Step 3 (server actions for stats)
- **Failure Risk:** Low
- **Mitigation:** Mock stats initially if needed

---

**STEP 9: Categories Page (High Priority)**
- Create `src/app/(protected)/admin/master-data/lookups/categories/page.tsx`
- Add permission gate (`master_data.lookups.view`)
- Integrate `LookupCategoriesTable` from Step 6
- Integrate `LookupCategoryDrawerForm` from Step 7
- Add "Add Category" button (if has manage permission)
- Add export button (if has export permission)
- Test full CRUD flow
- **Dependencies:** Step 6 (table), Step 7 (drawer form)
- **Failure Risk:** Low (following established patterns)
- **Mitigation:** Test with system_admin and company_admin roles

---

**STEP 10: Values Page (High Priority)**
- Create `src/app/(protected)/admin/master-data/lookups/values/page.tsx`
- Add permission gate (`master_data.lookups.view`)
- Add category selector dropdown at top
- Integrate `LookupValuesTable` from Step 6
- Integrate `LookupValueDrawerForm` from Step 7
- Add "Add Value" button
- Add reorder mode toggle (optional drag-drop)
- Add export button
- Test full CRUD flow with multiple categories
- **Dependencies:** Step 6 (table), Step 7 (drawer form), Step 5 (LookupSelect for category selector)
- **Failure Risk:** Medium (complex page with category filtering)
- **Mitigation:** Test category switching, parent/child values

---

**STEP 11: Locked System Values Page (Low Priority)**
- Create `src/app/(protected)/admin/master-data/lookups/system/page.tsx`
- Add permission gate (`master_data.lookups.view`)
- Add warning banner about system protection
- Filter categories/values to `is_locked=TRUE` or `is_system=TRUE`
- Reuse tables from Step 6 with pre-applied filters
- Disable edit actions unless user has `master_data.lookups.lock` permission
- **Dependencies:** Step 6 (tables)
- **Failure Risk:** Low
- **Mitigation:** Test with users without lock permission

---

**STEP 12: Sidebar Integration (Medium Priority)**
- Modify `src/components/layout/app-sidebar.tsx`
- Add `Database`, `FolderOpen`, `List`, `Lock` icon imports
- Add "Master Data" group to `navGroups` array
- Add 4 menu items (Dashboard, Categories, Values, System)
- Test collapsible group, active highlighting, navigation
- **Dependencies:** Steps 8-11 (pages must exist)
- **Failure Risk:** Low
- **Mitigation:** Test sidebar navigation, active states

---

**STEP 13: Export Integration (Optional)**
- Add export functionality to categories page
- Add export functionality to values page
- Integrate with existing `ERPExportMenu` or create custom export button
- Implement server actions for export (`exportLookupCategories`, `exportLookupValues`)
- Test CSV/Excel generation
- **Dependencies:** Step 3 (server actions), Steps 9-10 (pages)
- **Failure Risk:** Low (if existing export engine stable)
- **Mitigation:** Test with various filters, large datasets

---

**STEP 14: Testing & QA (High Priority)**
- Run all tests from Section 16 (Testing Plan)
- Fix any bugs/issues discovered
- Test with different roles (system_admin, group_admin, company_admin, branch_admin, no permissions)
- Test RLS policies directly via psql
- Test locked/unlocked category/value behavior
- Test parent/child lookup values
- Test Arabic labels
- Test export functionality
- Run `npm run typecheck`, `npm run lint`, `npm run build`
- **Dependencies:** All previous steps
- **Failure Risk:** Medium (bugs may be discovered)
- **Mitigation:** Systematic testing checklist

---

**STEP 15: Documentation (High Priority)**
- Create `ERP_BASE_002F_3B_GLOBAL_LOOKUP_DROPDOWN_ENGINE_IMPLEMENTATION_REPORT.md`
- Document what was implemented
- List all created files
- List all modified files
- Document any deviations from plan
- List known issues / future enhancements
- Mark implementation as COMPLETE
- **Dependencies:** Step 14 (testing complete)
- **Failure Risk:** Low
- **Mitigation:** Follow implementation report template

---

### 15.2 Critical Path

**Critical Path (Must Complete in Order):**  
Step 1 → Step 2 → Step 3 → Step 4 → Step 5 → Step 6 → Step 7 → Step 9 → Step 10 → Step 12 → Step 14 → Step 15

**Can Be Done in Parallel:**  
- Steps 6 & 7 (tables and forms are independent initially)
- Steps 8, 9, 10, 11 (pages can be developed in parallel after dependencies met)
- Step 13 (export is optional and independent)

**Total Estimated Steps:** 15  
**Critical Path Steps:** 12  
**Optional Steps:** 3 (Step 8 dashboard, Step 11 system page, Step 13 export)

---

## 16. TESTING PLAN

### 16.1 Database Tests

**Migration Tests:**
- [ ] Migration applies cleanly on fresh database
- [ ] Migration is idempotent (can run twice without errors)
- [ ] All tables created with correct schema
- [ ] All indexes created
- [ ] All triggers created and working (`set_updated_at`, `validate_lookup_value_parent_category`)
- [ ] RLS enabled on both tables
- [ ] All 8 RLS policies created

**Constraint Tests:**
- [ ] `global_lookup_categories.category_code` unique constraint works
- [ ] `global_lookup_categories.category_code` uppercase CHECK works
- [ ] `global_lookup_categories.category_code` format CHECK works (`^[A-Z0-9_]+$`)
- [ ] `global_lookup_categories.deactivation_logic` CHECK works
- [ ] `global_lookup_values.uq_lookup_value_category_code` unique constraint works
- [ ] `global_lookup_values.value_code` uppercase CHECK works
- [ ] `global_lookup_values.value_code` format CHECK works
- [ ] `global_lookup_values.chk_no_self_parent` CHECK works (cannot reference self as parent)
- [ ] `global_lookup_values.color_hex` format CHECK works (`^#[0-9A-Fa-f]{6}$`)
- [ ] `global_lookup_values.effective_dates` CHECK works (to >= from)
- [ ] Parent value same category validation trigger works

**Seed Data Tests:**
- [ ] 13 categories seeded
- [ ] All seed categories have correct `is_system=TRUE`, `is_locked=TRUE`
- [ ] 60-80 values seeded across all categories
- [ ] All seed values have correct category linkage
- [ ] All seed values have correct `is_system=TRUE`, `is_locked=TRUE`
- [ ] Arabic labels present for all seed values
- [ ] Color codes valid for categories with `supports_color=TRUE`

---

### 16.2 Permission & RLS Tests

**Permission Creation:**
- [ ] 7 master_data.* permissions exist in database
- [ ] system_admin has all master_data.* permissions
- [ ] group_admin has correct subset (view, manage, export, audit_view)
- [ ] company_admin has correct subset (view, export)
- [ ] branch_admin has view permission only
- [ ] Other roles have no master_data.* permissions by default

**RLS Policy Tests (Test via psql or Supabase SQL Editor):**

Test User Setup:
- Create test user A with `master_data.lookups.view` permission only
- Create test user B with `master_data.lookups.view` + `master_data.lookups.manage` permissions
- Create test user C with `master_data.lookups.view` + `master_data.lookups.manage` + `master_data.lookups.lock` permissions
- Create test user D with NO permissions

**Test User A (view only):**
- [ ] Can SELECT categories (returns rows)
- [ ] Can SELECT values (returns rows)
- [ ] Cannot INSERT categories (blocked by RLS)
- [ ] Cannot UPDATE categories (blocked by RLS)
- [ ] Cannot DELETE categories (blocked by RLS)
- [ ] Cannot INSERT values (blocked by RLS)
- [ ] Cannot UPDATE values (blocked by RLS)
- [ ] Cannot DELETE values (blocked by RLS)

**Test User B (view + manage, no lock):**
- [ ] Can SELECT categories and values
- [ ] Can INSERT unlocked categories
- [ ] Can UPDATE unlocked categories
- [ ] Cannot UPDATE locked categories (blocked by RLS)
- [ ] Cannot INSERT values into locked categories (blocked by RLS)
- [ ] Can INSERT unlocked values
- [ ] Can UPDATE unlocked values
- [ ] Cannot UPDATE locked values (blocked by RLS)
- [ ] Cannot DELETE categories or values (policy blocks all DELETE)

**Test User C (view + manage + lock):**
- [ ] Can SELECT, INSERT, UPDATE all categories and values
- [ ] Can UPDATE locked categories
- [ ] Can UPDATE locked values
- [ ] Cannot DELETE (policy blocks all DELETE)

**Test User D (no permissions):**
- [ ] Cannot SELECT categories (RLS returns empty)
- [ ] Cannot SELECT values (RLS returns empty)
- [ ] Cannot INSERT/UPDATE/DELETE anything

---

### 16.3 Server Action Tests

**Test Each Action:**
- [ ] `listLookupCategories()` returns data for user with view permission
- [ ] `listLookupCategories()` returns error for user without view permission
- [ ] `getLookupCategoryById()` works
- [ ] `createLookupCategory()` creates category and logs audit
- [ ] `createLookupCategory()` validates category_code format (Zod)
- [ ] `createLookupCategory()` rejects duplicate category_code
- [ ] `updateLookupCategory()` updates category and logs audit
- [ ] `updateLookupCategory()` prevents updating locked category without lock permission
- [ ] `deactivateLookupCategory()` sets inactive and logs audit
- [ ] `reactivateLookupCategory()` sets active and logs audit
- [ ] `lockLookupCategory()` requires lock permission
- [ ] `unlockLookupCategory()` requires lock permission
- [ ] `listLookupValues()` returns values for category
- [ ] `getLookupValuesByCategoryCode()` works (used by LookupSelect)
- [ ] `createLookupValue()` creates value and logs audit
- [ ] `createLookupValue()` validates value_code format
- [ ] `createLookupValue()` validates color_hex format
- [ ] `createLookupValue()` validates parent_value_id same category
- [ ] `updateLookupValue()` updates value and logs audit
- [ ] `updateLookupValue()` prevents updating locked value without lock permission
- [ ] `setDefaultLookupValue()` clears other defaults in category
- [ ] `reorderLookupValues()` updates sort_order

---

### 16.4 UI Tests

**Dashboard Page:**
- [ ] Page loads for user with `master_data.dashboard.view` permission
- [ ] Stats display correct counts
- [ ] "Recent Lookup Changes" section shows audit entries
- [ ] Quick links navigate correctly
- [ ] Page blocked for user without permission

**Categories Page:**
- [ ] Page loads, table displays categories
- [ ] Search works (by category_code or name)
- [ ] Filters work (active/inactive, system/custom, locked/unlocked)
- [ ] "Add Category" button visible if has manage permission
- [ ] "Add Category" button hidden if no manage permission
- [ ] Click row opens view drawer
- [ ] Edit icon opens edit drawer (if has manage permission)
- [ ] Edit drawer shows validation errors
- [ ] Edit drawer disables locked categories unless user has lock permission
- [ ] Create category works, revalidates page
- [ ] Update category works, revalidates page
- [ ] Activate/deactivate toggle works
- [ ] Lock/unlock toggle requires lock permission
- [ ] Export button works (if has export permission)

**Values Page:**
- [ ] Page loads, table displays values
- [ ] Category selector works, filters values
- [ ] Search works (by value_code or label)
- [ ] Filters work (active/inactive, system/custom, locked/unlocked, default)
- [ ] Color badges display correctly
- [ ] "Add Value" button requires category selection
- [ ] Add value drawer validates fields
- [ ] Parent value dropdown only shows values from same category
- [ ] Parent value dropdown only visible if category `supports_hierarchy=TRUE`
- [ ] Color picker only visible if category `supports_color=TRUE`
- [ ] Icon selector only visible if category `supports_icon=TRUE`
- [ ] Effective dates only visible if category `supports_effective_dates=TRUE`
- [ ] Create value works, revalidates page
- [ ] Update value works, revalidates page
- [ ] Set as default works, clears other defaults
- [ ] Reorder mode works (drag-drop or manual sort_order)

**Locked System Values Page:**
- [ ] Page loads, displays only locked/system items
- [ ] Warning banner visible
- [ ] Edit disabled unless user has lock permission

**LookupSelect Component:**
- [ ] Loads values for given categoryCode
- [ ] Displays loading state
- [ ] Displays error state if load fails
- [ ] Filters inactive values by default
- [ ] Includes inactive if `includeInactive=TRUE` (requires permission)
- [ ] Filters by parent if `parentValueCode` provided
- [ ] Shows color badges if `showColor=TRUE`
- [ ] Shows value_code if `showCode=TRUE`
- [ ] Shows Arabic labels if `language='ar'`
- [ ] Shows "Default" badge for default values
- [ ] Allows clear if `allowClear=TRUE`
- [ ] Integrates with React Hook Form (Controller)
- [ ] Displays validation errors

---

### 16.5 Build & Lint Tests

- [ ] `npm run typecheck` passes (no TypeScript errors)
- [ ] `npm run lint` passes (no ESLint errors)
- [ ] `npm run build` succeeds (Next.js build compiles)
- [ ] No console errors in browser
- [ ] No React warnings in dev tools

---

### 16.6 Integration Tests (Optional)

**Playwright E2E Tests (if Playwright is set up):**
- [ ] Login as system_admin
- [ ] Navigate to Master Data Dashboard
- [ ] Navigate to Lookup Categories
- [ ] Create new category
- [ ] Navigate to Lookup Values
- [ ] Select category
- [ ] Create new value
- [ ] Verify value appears in LookupSelect on test form

---

## 17. RISK ANALYSIS

### 17.1 Technical Risks

| Risk | Severity | Probability | Mitigation |
|---|---|---|---|
| **Migration fails on production** | HIGH | LOW | Test migration on dev/staging first, use transactions, backup database |
| **RLS policies too restrictive** | MEDIUM | MEDIUM | Test with multiple user roles, verify `current_user_has_permission_any_scope()` works |
| **RLS policies too permissive** | HIGH | LOW | Code review policies, test with users without permissions, security audit |
| **Locked value bypass** | HIGH | LOW | RLS enforces lock check, test with users without lock permission |
| **Performance degradation with many values** | MEDIUM | LOW | Indexes on category_id, is_active, sort_order. Future: cache lookup values client-side |
| **LookupSelect component doesn't load** | MEDIUM | MEDIUM | Add loading/error states, test with network throttling, add retry logic |
| **TypeScript type mismatch** | LOW | MEDIUM | Match database schema exactly, use inferred types from Zod |
| **Audit log overflow** | LOW | LOW | Audit table has indexes, can be archived/partitioned later |
| **Duplicate category/value codes** | MEDIUM | LOW | Unique constraints enforced, Zod validation checks format |
| **Parent/child infinite loop** | MEDIUM | LOW | `chk_no_self_parent` CHECK constraint prevents self-reference, no circular detection yet (future) |
| **Arabic label encoding issues** | LOW | LOW | Use UTF-8 throughout, test Arabic characters in forms |
| **Export fails with large datasets** | LOW | MEDIUM | Paginate exports, stream CSV generation, limit to 10K rows initially |

---

### 17.2 Business Risks

| Risk | Severity | Probability | Mitigation |
|---|---|---|---|
| **Users add too many unnecessary lookup values** | MEDIUM | MEDIUM | Governance training, regular audits, mark as inactive instead of delete |
| **System locked values accidentally unlocked** | HIGH | LOW | `master_data.lookups.lock` permission only for system_admin, audit all lock changes |
| **Hardcoded dropdowns not migrated** | MEDIUM | HIGH | Document all hardcoded dropdowns NOW, plan migration in Phase 002F.3K |
| **Lookup values misused for complex master data** | MEDIUM | MEDIUM | Training: lookups for simple picklists only, complex data gets dedicated tables |
| **Performance issues with LookupSelect in forms** | LOW | MEDIUM | Cache lookup values, debounce API calls, consider SWR/React Query |
| **Import functionality delayed** | LOW | HIGH | Expected—deferred to Phase 002F.3K, permission exists for future |
| **Export permission not assigned to right roles** | LOW | MEDIUM | Review role assignments after implementation, adjust if needed |

---

### 17.3 Dependency Risks

| Risk | Severity | Probability | Mitigation |
|---|---|---|---|
| **Existing RLS helper functions change** | HIGH | LOW | Monitor foundation migrations, update if breaking changes occur |
| **`ERPDrawerForm` component changes** | MEDIUM | LOW | Lock component version, test after updates |
| **Supabase auth changes** | HIGH | LOW | Monitor Supabase releases, test auth flows after updates |
| **Next.js breaking changes** | MEDIUM | LOW | Pin Next.js version, test major upgrades |

---

## 18. ACCEPTANCE CRITERIA

### 18.1 Definition of DONE

Phase 002F.3B is considered **COMPLETE** when ALL of the following criteria are met:

#### Database & Infrastructure
- [ ] Migration file created and tested
- [ ] `global_lookup_categories` table created with all fields, constraints, indexes, triggers
- [ ] `global_lookup_values` table created with all fields, constraints, indexes, triggers, validation function
- [ ] RLS enabled on both tables
- [ ] All 8 RLS policies created and tested
- [ ] 7 master_data.* permissions seeded
- [ ] Permissions assigned to roles (system_admin, group_admin, company_admin, branch_admin)
- [ ] 13 lookup categories seeded
- [ ] 60-80 lookup values seeded with English and Arabic labels
- [ ] All seed data marked as `is_system=TRUE`, `is_locked=TRUE`

#### Server-Side Code
- [ ] `src/server/actions/master-data/lookups.ts` created with 20+ server actions
- [ ] All actions have permission checks
- [ ] All mutation actions have audit logging
- [ ] All actions return `ActionResult<T>` type
- [ ] Zod validation applied to all create/update actions
- [ ] `revalidatePath()` called after mutations

#### Types & Validation
- [ ] `src/features/master-data/lookups/types.ts` created
- [ ] `LookupCategory` and `LookupValue` types match database schema
- [ ] Zod schemas for create/update operations
- [ ] Type inference types exported

#### React Hooks
- [ ] `useLookupValues` hook created and working
- [ ] `useLookupCategories` hook created (optional)
- [ ] Hooks handle loading, error, and data states
- [ ] Hooks support parent/child filtering

#### Components
- [ ] `LookupSelect` component created with all required props
- [ ] `LookupSelect` integrates with React Hook Form
- [ ] `LookupSelect` displays color badges, loading states, error states
- [ ] `LookupCategoriesTable` component created
- [ ] `LookupValuesTable` component created
- [ ] `LookupCategoryDrawerForm` component created with all sections
- [ ] `LookupValueDrawerForm` component created with all sections
- [ ] Drawer forms use `ERPDrawerForm`, `ERPDrawerSectionNav`, `ERPDrawerBody`, `ERPDrawerFooter` pattern

#### Pages
- [ ] `/admin/master-data` dashboard page created with permission gate
- [ ] Dashboard displays correct stats and recent changes
- [ ] `/admin/master-data/lookups/categories` page created with permission gate
- [ ] Categories page has search, filters, actions, drawer forms
- [ ] `/admin/master-data/lookups/values` page created with permission gate
- [ ] Values page has category selector, search, filters, actions, drawer forms
- [ ] `/admin/master-data/lookups/system` page created with permission gate
- [ ] System page shows locked values with warnings

#### Sidebar & Navigation
- [ ] `app-sidebar.tsx` modified to add "Master Data" group
- [ ] 4 menu items added (Dashboard, Categories, Values, System)
- [ ] Menu navigation works
- [ ] Active route highlighting works

#### Functionality Tests
- [ ] Categories CRUD works (create, read, update, deactivate, reactivate)
- [ ] Values CRUD works (create, read, update, deactivate, reactivate)
- [ ] Lock/unlock works for users with lock permission
- [ ] Lock/unlock blocked for users without lock permission
- [ ] Parent/child lookup values work
- [ ] Set default value works
- [ ] Reorder values works
- [ ] LookupSelect loads correct values for categoryCode
- [ ] LookupSelect filters by parent (hierarchical lookups)
- [ ] LookupSelect shows Arabic labels when `language='ar'`
- [ ] Export works (if implemented)

#### Security Tests
- [ ] RLS policies tested with users without permissions (blocked correctly)
- [ ] RLS policies tested with view-only users (read works, write blocked)
- [ ] RLS policies tested with manage users (write works for unlocked items)
- [ ] RLS policies tested with lock permission users (can edit locked items)
- [ ] Locked categories/values cannot be edited without lock permission
- [ ] Direct database manipulation blocked by RLS
- [ ] Audit logs capture all mutations

#### Build & Quality
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] No console errors or React warnings
- [ ] No regression in existing pages

#### Documentation
- [ ] Implementation report created (`ERP_BASE_002F_3B_GLOBAL_LOOKUP_DROPDOWN_ENGINE_IMPLEMENTATION_REPORT.md`)
- [ ] All created files listed
- [ ] All modified files listed
- [ ] Known issues documented
- [ ] Future enhancements documented
- [ ] Hardcoded dropdowns documented for Phase 002F.3K migration

#### Stakeholder Sign-Off
- [ ] Sameer reviews implementation
- [ ] Sameer tests categories/values CRUD
- [ ] Sameer tests LookupSelect in a form
- [ ] Sameer tests with different user roles
- [ ] Sameer approves implementation as COMPLETE

---

### 18.2 Success Metrics

**Technical Metrics:**
- Database migration applies in < 10 seconds
- LookupSelect component loads values in < 500ms
- No TypeScript errors
- No ESLint warnings
- Build time < 2 minutes
- All RLS tests pass

**Functional Metrics:**
- All 13 seed categories present
- 60-80 seed values present
- User with manage permission can create/edit categories and values
- User without manage permission cannot create/edit
- Locked values protected
- Audit logs capture all changes

**User Experience Metrics:**
- Forms with LookupSelect are responsive
- Drawer forms open and close smoothly
- Search and filters work instantly
- Color badges display correctly
- Arabic labels display correctly (RTL)

---

## 19. FUTURE INTEGRATION NOTES

### 19.1 How Future Phases Will Use This Engine

**Phase 002F.3C: Core UAE Shared Master Data**
- **Countries table:** Will NOT use lookup engine (dedicated table with ISO codes, metadata)
- **Emirates table:** Will NOT use lookup engine (dedicated table with official codes)
- **Cities table:** Will NOT use lookup engine (dedicated table with geolocation data)
- **Currencies table:** Will use lookups for `currency_type` (e.g., FIAT, CRYPTO, COMMODITY)
- **Ports table:** Will use lookups for `port_type` (e.g., SEA_PORT, AIR_PORT, DRY_PORT, BORDER_CROSSING)
- **Banks table:** Will use lookups for `bank_type` (e.g., COMMERCIAL, ISLAMIC, INVESTMENT, EXCHANGE_HOUSE)

**Phase 002F.3E: CRM Foundation**
- Person/Contact tables will use lookups for:
  - `contact_type` (CUSTOMER, SUPPLIER, PARTNER, LEAD, PROSPECT)
  - `lead_source` (WEBSITE, REFERRAL, COLD_CALL, TRADE_SHOW, PARTNER)
  - `opportunity_stage` (QUALIFICATION, NEEDS_ANALYSIS, PROPOSAL, NEGOTIATION, CLOSED_WON, CLOSED_LOST)
  - `contact_salutation` (MR, MRS, MS, DR, ENG, PROF, SHEIKH)

**Phase 002F.3F: HR Master Data**
- HR tables will use lookups for:
  - `employment_type` (FULL_TIME, PART_TIME, CONTRACT, TEMPORARY, INTERN)
  - `employment_status` (ACTIVE, ON_LEAVE, SUSPENDED, TERMINATED, RETIRED)
  - `job_level` (ENTRY, JUNIOR, SENIOR, LEAD, MANAGER, DIRECTOR, EXECUTIVE)
  - `leave_type` (ANNUAL, SICK, MATERNITY, PATERNITY, UNPAID, COMPASSIONATE)
  - `benefit_type` (HEALTH_INSURANCE, DENTAL, VISION, LIFE_INSURANCE, PENSION)
  - `visa_type` (EMPLOYMENT, RESIDENCE, DEPENDENT, INVESTOR, GOLDEN)

**Phase 002F.3G: Fleet Master Data**
- Fleet tables will use lookups for:
  - `vehicle_type` (TRUCK, TRAILER, PICKUP, VAN, BUS, CRANE, FORKLIFT)
  - `vehicle_status` (ACTIVE, MAINTENANCE, OUT_OF_SERVICE, SOLD, WRITTEN_OFF)
  - `fuel_type` (DIESEL, PETROL, CNG, LPG, ELECTRIC, HYBRID)
  - `maintenance_type` (PREVENTIVE, CORRECTIVE, BREAKDOWN, INSPECTION, OVERHAUL)

**Phase 002F.3H: Workshop/Inventory/Procurement Master Data**
- Workshop tables will use lookups for:
  - `work_order_status` (PENDING, IN_PROGRESS, ON_HOLD, COMPLETED, CANCELLED)
  - `work_order_priority` (reuse existing PRIORITY_LEVELS)
  - `part_category` (MECHANICAL, ELECTRICAL, HYDRAULIC, CONSUMABLE, SPARE)
  - `supplier_type` (OEM, DISTRIBUTOR, WHOLESALER, RETAILER, MANUFACTURER)

**Phase 002F.3I: HSE/DMS Master Data**
- HSE tables will use lookups for:
  - `incident_type` (ACCIDENT, NEAR_MISS, HAZARD, ENVIRONMENTAL, PROPERTY_DAMAGE)
  - `ppe_type` (HELMET, GLOVES, BOOTS, GOGGLES, VEST, MASK)
  - `risk_level` (already seeded)
  - `severity_level` (already seeded)
- DMS tables will use lookups for:
  - `document_category` (POLICY, PROCEDURE, WORK_INSTRUCTION, FORM, RECORD, CONTRACT, CERTIFICATE)
  - `document_status` (already seeded)

**Phase 002F.3J: Scrap/Waste/Demolition Master Data**
- Waste tables will use lookups for:
  - `waste_type` (HAZARDOUS, NON_HAZARDOUS, RECYCLABLE, ORGANIC, E_WASTE)
  - `disposal_method` (LANDFILL, INCINERATION, RECYCLING, COMPOSTING, REUSE)

---

### 19.2 Migration of Existing Hardcoded Dropdowns

**Phase 002F.3K Readiness Gate will include:**

**Step 1: Audit All Hardcoded Dropdowns**
- Search entire codebase for:
  - CHECK constraints with IN clauses (`status in ('active', 'inactive', 'suspended')`)
  - Hardcoded arrays in components (`const statuses = ['active', 'inactive']`)
  - Hardcoded Select options
  - TypeScript enums that should be lookups

**Step 2: Create Migration Plan**
- For each hardcoded dropdown, decide:
  - Migrate to lookup engine?
  - Create dedicated table?
  - Keep as CHECK constraint (if truly immutable)?

**Step 3: Migrate to Lookups**
- Add new lookup categories for migrated dropdowns
- Seed initial values from existing hardcoded lists
- Update UI components to use `LookupSelect`
- Remove CHECK constraints (or relax to any TEXT)
- Test thoroughly

**Example: Migrate status CHECK constraint:**
``sql
-- Before (hardcoded CHECK):
status text not null default 'active' check (status in ('active', 'inactive', 'suspended'))

-- After (lookup-based):
status_code text not null default 'ACTIVE' references global_lookup_values(value_code)
-- OR (denormalized for performance):
status_code text not null default 'ACTIVE'
-- with application-level validation using LookupSelect
``

**Recommendation:** Defer migration of existing CHECK constraints to Phase 002F.3K to avoid breaking changes now.

---

### 19.3 LookupSelect Adoption Strategy

**Immediate Use Cases (Phase 002F.3B):**
- Internal testing in lookup value drawer form (parent value selector)
- Internal testing in lookup category drawer form (module_code selector if converted to lookup)

**Phase 002F.3C and Beyond:**
- ALL new forms MUST use `LookupSelect` for dynamic dropdowns
- Existing forms SHOULD be migrated to `LookupSelect` incrementally
- Hardcoded arrays SHOULD be documented and migrated in Phase 002F.3K

**Training Documentation (Future):**
- "How to add a new lookup category"
- "How to use LookupSelect in forms"
- "When to use lookups vs dedicated tables"
- "How to manage locked system values"

---

## 20. FINAL RECOMMENDATION

### 20.1 Readiness Status

**STATUS: ✅ READY FOR SAMEER REVIEW**

This technical implementation plan is **COMPLETE** and **READY FOR IMPLEMENTATION**.

All patterns, constraints, and requirements have been thoroughly analyzed and specified.

---

### 20.2 Summary of Readiness

**✅ Complete Specifications:**
- Database schema fully specified (tables, constraints, indexes, triggers, RLS)
- Seed data fully defined (13 categories, 60-80 values)
- Permissions fully defined (7 permissions, role assignments)
- Server actions fully specified (20+ actions with permission checks, audit logging)
- UI components fully specified (tables, drawer forms, LookupSelect)
- Pages fully specified (dashboard, categories, values, system)
- Testing plan comprehensive (database, RLS, actions, UI, build)
- Risk analysis complete with mitigations
- Implementation sequence optimized for incremental testing

**✅ No Blocking Dependencies:**
- All required patterns exist in codebase (RLS helpers, ERPDrawerForm, ERPDataTable, server actions pattern)
- No external systems required
- No breaking changes to existing code
- Sidebar modification is additive only

**✅ Clear Scope:**
- Only implements Global Lookup Engine
- Does NOT implement dedicated geography/currency/UOM tables (deferred to Phase 002F.3C)
- Does NOT migrate existing hardcoded dropdowns (deferred to Phase 002F.3K)
- Import functionality deferred (permission exists, UI placeholder only)

**✅ Low Risk:**
- Follows existing patterns exactly (numbering module as template)
- RLS policies mirror existing permission patterns
- No changes to existing tables or constraints
- Incremental testing strategy minimizes bugs

---

### 20.3 Decisions Required from Sameer

**No blocking decisions required.** All technical decisions have been made following existing patterns.

**Optional decisions for future:**
1. Should import functionality be prioritized? (Current plan: defer to 002F.3K)
2. Should existing CHECK constraints be migrated now? (Current plan: defer to 002F.3K)
3. Should category_code be editable after creation? (Current plan: immutable)

---

### 20.4 Next Steps

**If Approved:**

1. **Sameer approves this technical plan** → Proceed to implementation
2. **Generate implementation prompt** with reference to this plan
3. **Execute implementation** following Step 1-15 sequence
4. **Complete testing checklist** from Section 16
5. **Generate implementation report** after completion
6. **Sameer final acceptance testing**

**If Changes Needed:**

1. Sameer provides feedback on this plan
2. Update plan based on feedback
3. Re-submit for approval

---

### 20.5 Estimated Implementation Effort

**Complexity:** Medium (well-defined, follows existing patterns)

**Critical Path:** Database → Actions → Hooks → Components → Pages → Testing

**Incremental Testing:** Each step can be tested independently before moving to next step

---

### 20.6 Final Statement

This technical plan provides a **complete, actionable, implementation-ready blueprint** for ERP BASE 002F.3B — Global Lookup/Dropdown Engine.

The plan:
- Is based on **actual source code inspection** (not assumptions)
- Follows **existing project patterns exactly** (RLS, permissions, components, migrations)
- Provides **complete specifications** for all database objects, actions, components, and pages
- Includes **comprehensive testing plan** with specific test cases
- Analyzes **risks and mitigations** thoroughly
- Defines **clear acceptance criteria** for completion

**The next implementation prompt can execute this plan directly without additional design decisions.**

---

**Document Status:** ✅ READY FOR SAMEER REVIEW  
**Created:** 2026-06-05  
**Last Updated:** 2026-06-05  
**Version:** 1.0 - Final  
**Author:** AI Agent (Claude Sonnet 4.5)  
**Reviewed By:** [Awaiting Sameer Review]  

---

**END OF TECHNICAL IMPLEMENTATION PLAN**

