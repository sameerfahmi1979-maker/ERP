# ERP_BASE_002F_3C_1A_GEOGRAPHY_INTEGRATION_IMPACT_PLAN

## Document Information

- **Phase**: ERP BASE 002F.3C.1A — Geography & Locations Integration Impact Plan
- **Plan Date**: 2026-06-06
- **Plan Type**: Technical Planning Only (No Implementation)
- **Prepared By**: Claude (AI Planning Agent)
- **Status**: READY FOR SAMEER REVIEW

---

## 1. Executive Summary

### Why This Integration Plan Is Needed Before 002F.3C.2

The approved Geography & Locations master data (002F.3C.1) provides foundational reference tables for countries, administrative regions (emirates), cities, areas/zones, and ports. However, **existing application modules** (Organizations/Owner Companies and Branches) currently use **free-text fields** for location data:

- `owner_companies.country` (text)
- `owner_companies.emirate` (text)
- `branches.emirate` (text)
- `branches.city` (text)
- `branches.area` (text)

Before proceeding to **ERP BASE 002F.3C.2 (Finance Basics / Commercial Readiness)**, we must integrate the Geography master data into these existing modules to:

1. ✅ Replace hardcoded free-text location fields with structured FK references
2. ✅ Enable cascading select UI components (Country → Region → City → Area)
3. ✅ Establish a clean foundation for future modules (CRM, Procurement, HR) that will depend on standardized geography
4. ✅ Preserve existing data while gradually migrating to the new structure
5. ✅ Avoid technical debt and inconsistent location data across the system

**Without this integration**, future modules will face:
- Duplicate location data entry requirements
- Inconsistent country/city/area references
- Complex data migration requirements later
- Loss of the Geography master data investment

### What Current Geography Master Data Provides

**Approved Tables** (Phase 002F.3C.1):
- ✅ `countries` — Global country master data with ISO codes, GCC flags
- ✅ `emirates` — Administrative regions (conceptually: Emirates, Governorates, States, Provinces)
- ✅ `cities` — Cities with FK to emirates and countries
- ✅ `areas_zones` — Areas/zones with FK to cities
- ✅ `ports` — Ports and terminals with FK to emirates and cities

**Approved Reusable Components**:
- ✅ `CountrySelect` — Country dropdown with GCC filter
- ✅ `EmirateSelect` — Administrative region dropdown filtered by country
- ✅ `CitySelect` — City dropdown filtered by emirate/country
- ✅ `AreaZoneSelect` — Area/zone dropdown filtered by city
- ✅ `PortSelect` — Port dropdown

**Approved Hierarchy**:
```
Country
└── Region / Emirate / Governorate (emirates table)
    └── City
        └── Area / Zone
```

**Technical Compatibility Note**:
- Database table: `emirates`
- FK column: `emirate_id`
- User-facing labels: "Region / Emirate / Governorate"

### High-Level Findings

**Inspection Results**:

1. **Owner Companies (Organizations)**:
   - ✅ Table exists: `owner_companies`
   - ⚠️ Has free-text fields: `country`, `emirate`, `city`, `area`
   - ✅ Migration 002D added: `city`, `area`, `address_line_1`, `address_line_2`, `po_box`, `makani_number`
   - ✅ Form UI implemented with all address fields
   - ❌ No FK references to geography tables yet

2. **Branches**:
   - ✅ Table exists: `branches`
   - ⚠️ Has free-text fields: `emirate`, `city`, `area`
   - ✅ Migration 002D added: `city`, `address_line_1`, `address_line_2`, `po_box`, `makani_number`, `latitude`, `longitude`
   - ✅ Form UI implemented with all location fields
   - ❌ No FK references to geography tables yet

3. **No Separate Address Tables Found**:
   - ❌ `owner_company_addresses` — Does not exist
   - ❌ `branch_addresses` — Does not exist
   - ✅ Address fields embedded directly in `owner_companies` and `branches` tables

4. **Geography Select Components**:
   - ✅ All 5 select components exist and ready for reuse
   - ✅ Components support filtering, inactive records, language selection
   - ✅ Components follow established ERP UI patterns

5. **Existing Data Risk**:
   - ⚠️ Unknown volume of existing organizations and branches
   - ⚠️ Free-text values may not match geography master data exactly
   - ⚠️ Risk of data loss if old text fields dropped immediately

### Recommended Minimum Safe Approach

**Strategy**: ✅ **Additive, Non-Destructive Integration**

1. **Add New FK Columns Beside Old Text Columns**:
   - `owner_companies.country_id` (FK to countries.id) — **NEW**
   - `owner_companies.emirate_id` (FK to emirates.id) — **NEW**
   - `owner_companies.city_id` (FK to cities.id) — **NEW**
   - `owner_companies.area_zone_id` (FK to areas_zones.id) — **NEW**
   - `branches.country_id` (FK to countries.id) — **NEW**
   - `branches.emirate_id` (FK to emirates.id) — **NEW**
   - `branches.city_id` (FK to cities.id) — **NEW**
   - `branches.area_zone_id` (FK to areas_zones.id) — **NEW**

2. **Keep Old Text Columns Temporarily**:
   - `owner_companies.country` (text) — **KEEP** for backward compatibility
   - `owner_companies.emirate` (text) — **KEEP** for backward compatibility
   - `branches.emirate` (text) — **KEEP** for backward compatibility
   - `branches.city` (text) — **KEEP** for backward compatibility
   - `branches.area` (text) — **KEEP** for backward compatibility

3. **Update UI Forms**:
   - Replace text inputs with geography select components
   - Implement cascading select behavior (Country → Region → City → Area)
   - Display old text values as fallback if FK is null (backward compatibility)

4. **Data Migration**:
   - Attempt automatic matching of text values to geography master data
   - Generate migration report for unmatched values
   - Manual review and correction where needed
   - No destructive data loss

5. **Future Cleanup**:
   - After verification (e.g., 1-3 months), deprecate old text columns
   - Mark as "legacy" or eventually drop if all data migrated successfully

### Whether Implementation Can Start After Sameer Approval

✅ **YES — Ready to Start After Approval**

**Prerequisites Met**:
- ✅ Geography master data (002F.3C.1) approved and stable
- ✅ Geography select components exist and functional
- ✅ Organization and branch tables clearly identified
- ✅ Safe additive migration strategy defined
- ✅ No blocking dependencies
- ✅ RLS and permission patterns established

**Next Steps After Approval**:
1. Sameer reviews and approves this plan
2. Sameer confirms acceptable data migration approach
3. Implementation begins with Phase 002F.3C.1B.1 (Organizations Integration)
4. Followed by Phase 002F.3C.1B.2 (Branches Integration)
5. After completion and verification, proceed to 002F.3C.2 (Finance Basics)

---

## 2. Source Inspection Summary

| Area Inspected | Files/Tables Inspected | Findings | Impact | Recommendation |
|----------------|------------------------|----------|--------|----------------|
| **Organizations Table** | `supabase/migrations/20260527120000_erp_base_foundation.sql`<br>`supabase/migrations/20260527160443_erp_base_002d_admin_master_data_hardening.sql` | ✅ Table: `owner_companies`<br>⚠️ Text fields: `country`, `emirate`<br>✅ Migration 002D added: `city`, `area`, address fields<br>❌ No FK to geography tables | **HIGH** — Primary tenant entity needs geography integration | Add FK columns:<br>`country_id`, `emirate_id`, `city_id`, `area_zone_id`<br>Keep old text columns temporarily |
| **Organizations Schema** | `src/features/organizations/organization-schema.ts` | ✅ Zod validation for text fields<br>`country`, `emirate`, `city`, `area` all text/optional | **HIGH** — Validation schema needs FK field support | Update schema to include FK fields<br>Make FKs optional initially |
| **Organizations UI Form** | `src/features/organizations/organization-form-dialog.tsx` | ✅ Multi-section drawer form<br>✅ Address & Contact section exists<br>❌ Uses text Input components for location<br>✅ Form structure: 5 sections (Basic, Address, Legal, Tax, Notes) | **HIGH** — Form needs geography select components | Replace text inputs with:<br>`CountrySelect`, `EmirateSelect`, `CitySelect`, `AreaZoneSelect`<br>Implement cascading behavior |
| **Branches Table** | Same migrations as above | ✅ Table: `branches`<br>⚠️ Text fields: `emirate`, `city`, `area`<br>✅ Migration 002D added: `city`, address fields, lat/long<br>❌ No FK to geography tables | **HIGH** — Branch locations need structured geography | Add FK columns:<br>`country_id`, `emirate_id`, `city_id`, `area_zone_id`<br>Keep old text columns temporarily |
| **Branches Schema** | `src/features/branches/branch-schema.ts` | ✅ Zod validation for text fields<br>`emirate`, `city`, `area` all text/optional | **HIGH** — Validation schema needs FK field support | Update schema to include FK fields<br>Make FKs optional initially |
| **Branches UI Form** | `src/features/branches/branch-form-dialog.tsx` | ✅ Multi-section drawer form<br>✅ Location section exists<br>❌ Uses text Input components for location<br>✅ Form structure: 5 sections (Basic, Location, Contact, Operations, Notes) | **HIGH** — Form needs geography select components | Replace text inputs with geography selects<br>Implement cascading behavior |
| **Address Tables** | Searched entire codebase | ❌ `owner_company_addresses` — Does not exist<br>❌ `branch_addresses` — Does not exist<br>✅ Address fields embedded in main tables | **MEDIUM** — No separate address normalization | No separate address table integration needed<br>Focus on main tables only |
| **Geography Components** | `src/components/erp/geography/*.tsx` | ✅ `CountrySelect` — Fully implemented<br>✅ `EmirateSelect` — Fully implemented with country filtering<br>✅ `CitySelect` — Fully implemented<br>✅ `AreaZoneSelect` — Fully implemented<br>✅ `PortSelect` — Fully implemented | **LOW** — Components ready for reuse | No changes needed<br>Import and use in organization/branch forms |
| **RLS Policies** | Foundation migration | ✅ Organizations RLS: `organizations.view`, `organizations.manage`<br>✅ Branches RLS: `branches.view`, `branches.manage`<br>✅ Geography RLS: `master_data.geography.view`<br>✅ System_admin full access pattern | **LOW** — No RLS changes needed | New FK columns automatically inherit table RLS<br>Geography read access sufficient |
| **Server Actions** | Not inspected in detail (planning only) | ⚠️ Organization create/update actions exist<br>⚠️ Branch create/update actions exist<br>❌ No geography FK field handling yet | **MEDIUM** — Actions need FK field support | Update create/update actions to save FK fields<br>Preserve audit logging pattern |
| **Validation Schemas** | Inspected above | ⚠️ Text-based validation only<br>❌ No FK validation | **MEDIUM** — Schemas need FK support | Add FK fields to Zod schemas<br>FK fields optional initially |
| **Audit Logs** | Foundation migration | ✅ `audit_logs` table exists<br>✅ Captures old_values and new_values (JSONB) | **LOW** — Audit will capture FK changes automatically | No changes needed<br>Audit diff will show FK field changes |

**Summary**:
- ✅ **All required tables and components exist**
- ⚠️ **Organizations and Branches use free-text location fields**
- ❌ **No FK references to geography tables yet**
- ✅ **Safe additive migration path identified**
- ✅ **No blocking issues found**

---

## 3. Current Geography Master Data Availability

### Approved Geography Module (002F.3C.1)

**Tables**:

1. **`countries`**:
   - Columns: `id`, `country_code`, `name_en`, `name_ar`, `nationality_en`, `nationality_ar`, `phone_code`, `currency_code`, `is_gcc`, `is_system`, `is_locked`, `is_active`, `sort_order`, audit columns
   - Seed Data: UAE, Saudi Arabia, Qatar, Oman, Bahrain, Kuwait, USA, UK, India, Pakistan, Egypt, Jordan, etc.
   - RLS: `master_data.geography.view` permission required
   - System Records: UAE is system record and locked

2. **`emirates`** (Conceptual: Administrative Regions):
   - Columns: `id`, `emirate_code`, `name_en`, `name_ar`, `country_id` (FK), `region_type_code`, `is_system`, `is_locked`, `is_active`, `sort_order`, audit columns
   - Seed Data: UAE emirates (Abu Dhabi, Dubai, Sharjah, Ajman, UAQ, RAK, Fujairah), expandable globally
   - RLS: `master_data.geography.view` permission required
   - User-Facing Label: "Region / Emirate / Governorate"
   - Database/Code: `emirate_id` FK column name remains unchanged

3. **`cities`**:
   - Columns: `id`, `city_code`, `name_en`, `name_ar`, `emirate_id` (FK), `country_id` (FK), `is_capital`, `is_system`, `is_locked`, `is_active`, `sort_order`, audit columns
   - Seed Data: UAE cities (Abu Dhabi, Dubai, Sharjah, Al Ain, Ajman, etc.), expandable globally
   - RLS: `master_data.geography.view` permission required

4. **`areas_zones`**:
   - Columns: `id`, `area_code`, `name_en`, `name_ar`, `city_id` (FK), `zone_type_code`, `is_system`, `is_locked`, `is_active`, `sort_order`, audit columns
   - Seed Data: UAE industrial zones (Musaffah, ICAD, Jebel Ali, etc.), residential areas
   - RLS: `master_data.geography.view` permission required

5. **`ports`**:
   - Columns: `id`, `port_code`, `name_en`, `name_ar`, `port_type_code`, `emirate_id` (FK), `city_id` (FK), `country_id` (FK), `is_system`, `is_locked`, `is_active`, `sort_order`, audit columns
   - Seed Data: UAE ports (Jebel Ali, Khalifa Port, etc.)
   - RLS: `master_data.geography.view` permission required
   - **Not Required for Organizations/Branches** — Defer to future modules

### Reusable Components Available

| Component | File | Props | Features |
|-----------|------|-------|----------|
| **CountrySelect** | `src/components/erp/geography/country-select.tsx` | `value`, `onValueChange`, `placeholder`, `disabled`, `required`, `gccOnly`, `includeInactive`, `language`, `showCode`, `allowClear`, `name`, `error` | ✅ GCC filter<br>✅ Multi-language<br>✅ Show country code<br>✅ Clear button<br>✅ Error display |
| **EmirateSelect** | `src/components/erp/geography/emirate-select.tsx` | `value`, `onValueChange`, `countryId`, `placeholder`, `disabled`, `required`, `includeInactive`, `language`, `showCode`, `allowClear`, `name`, `error` | ✅ **Filtered by country**<br>✅ Multi-language<br>✅ Show emirate code<br>✅ Clear button<br>✅ Error display |
| **CitySelect** | `src/components/erp/geography/city-select.tsx` | `value`, `onValueChange`, `emirateId`, `countryId`, `placeholder`, `disabled`, `required`, `includeInactive`, `language`, `showCode`, `allowClear`, `name`, `error` | ✅ **Filtered by emirate/country**<br>✅ Multi-language<br>✅ Show city code<br>✅ Clear button<br>✅ Error display |
| **AreaZoneSelect** | `src/components/erp/geography/area-zone-select.tsx` | `value`, `onValueChange`, `cityId`, `placeholder`, `disabled`, `required`, `includeInactive`, `language`, `showCode`, `allowClear`, `name`, `error` | ✅ **Filtered by city**<br>✅ Multi-language<br>✅ Show area code<br>✅ Clear button<br>✅ Error display |
| **PortSelect** | `src/components/erp/geography/port-select.tsx` | Similar props | ✅ Port dropdown<br>❌ Not needed for Org/Branch |

**Key Features**:
- ✅ All components follow ERP UI patterns
- ✅ All support cascading filters (parent FK filtering)
- ✅ All support inactive record inclusion
- ✅ All support multi-language (EN/AR)
- ✅ All support error display
- ✅ All use Supabase client-side queries
- ✅ All have loading states (Loader2 spinner)
- ✅ All have empty states ("No X available")

### Approved Hierarchy

```
Country (countries.id)
└── Region / Emirate / Governorate (emirates.id, FK: country_id)
    └── City (cities.id, FK: emirate_id, country_id)
        └── Area / Zone (areas_zones.id, FK: city_id)
```

**Cascading UI Behavior**:
1. User selects **Country** → `CountrySelect`
2. **Region/Emirate** dropdown filters by `country_id` → `EmirateSelect(countryId)`
3. User selects **Region/Emirate**
4. **City** dropdown filters by `emirate_id` → `CitySelect(emirateId)`
5. User selects **City**
6. **Area/Zone** dropdown filters by `city_id` → `AreaZoneSelect(cityId)`
7. User selects **Area/Zone** (optional)

**State Management**:
- When **Country** changes → Reset Region/Emirate, City, Area
- When **Region/Emirate** changes → Reset City, Area
- When **City** changes → Reset Area

---

## 4. Existing App Location/Address Field Inventory

| Table / Component / Page | Current Field Name | Current Type | Current Use | Recommended Geography Mapping | Recommended Change | Risk Level | Priority |
|--------------------------|-------------------|--------------|-------------|-------------------------------|-------------------|------------|----------|
| **owner_companies** | `country` | TEXT | Free-text country name (e.g., "United Arab Emirates", "UAE") | `countries.id` | **ADD** `country_id BIGINT FK`<br>**KEEP** `country TEXT` temporarily | **MEDIUM** — Existing data may not match exactly | **HIGH** |
| **owner_companies** | `emirate` | TEXT | Free-text emirate name (e.g., "Abu Dhabi", "Dubai") | `emirates.id` | **ADD** `emirate_id BIGINT FK`<br>**KEEP** `emirate TEXT` temporarily | **MEDIUM** — Existing data may not match exactly | **HIGH** |
| **owner_companies** | `city` | TEXT | Free-text city name (added in 002D) | `cities.id` | **ADD** `city_id BIGINT FK`<br>**KEEP** `city TEXT` temporarily | **LOW** — Recently added, likely less legacy data | **HIGH** |
| **owner_companies** | `area` | TEXT | Free-text area name (added in 002D) | `areas_zones.id` | **ADD** `area_zone_id BIGINT FK`<br>**KEEP** `area TEXT` temporarily | **LOW** — Recently added, likely less legacy data | **MEDIUM** |
| **owner_companies** | `address_line_1` | TEXT | Free-form street address | N/A — Keep as text | **NO CHANGE** | **LOW** — Not geography FK | **LOW** |
| **owner_companies** | `address_line_2` | TEXT | Free-form address line 2 | N/A — Keep as text | **NO CHANGE** | **LOW** — Not geography FK | **LOW** |
| **owner_companies** | `po_box` | TEXT | PO Box number | N/A — Keep as text | **NO CHANGE** | **LOW** — Not geography FK | **LOW** |
| **owner_companies** | `makani_number` | TEXT | UAE Makani address code | N/A — Keep as text | **NO CHANGE** | **LOW** — Not geography FK | **LOW** |
| **branches** | `emirate` | TEXT | Free-text emirate name (e.g., "Abu Dhabi") | `emirates.id` | **ADD** `emirate_id BIGINT FK`<br>**ADD** `country_id BIGINT FK` (new)<br>**KEEP** `emirate TEXT` temporarily | **MEDIUM** — Existing data may not match exactly | **HIGH** |
| **branches** | `city` | TEXT | Free-text city name (added in 002D) | `cities.id` | **ADD** `city_id BIGINT FK`<br>**KEEP** `city TEXT` temporarily | **LOW** — Recently added, likely less legacy data | **HIGH** |
| **branches** | `area` | TEXT | Free-text area name | `areas_zones.id` | **ADD** `area_zone_id BIGINT FK`<br>**KEEP** `area TEXT` temporarily | **MEDIUM** — Existing data may not match exactly | **MEDIUM** |
| **branches** | `address_line_1` | TEXT | Free-form street address | N/A — Keep as text | **NO CHANGE** | **LOW** — Not geography FK | **LOW** |
| **branches** | `address_line_2` | TEXT | Free-form address line 2 | N/A — Keep as text | **NO CHANGE** | **LOW** — Not geography FK | **LOW** |
| **branches** | `po_box` | TEXT | PO Box number | N/A — Keep as text | **NO CHANGE** | **LOW** — Not geography FK | **LOW** |
| **branches** | `makani_number` | TEXT | UAE Makani address code | N/A — Keep as text | **NO CHANGE** | **LOW** — Not geography FK | **LOW** |
| **branches** | `latitude` | NUMERIC | GPS latitude | N/A — Keep as is | **NO CHANGE** | **LOW** — Not geography FK | **LOW** |
| **branches** | `longitude` | NUMERIC | GPS longitude | N/A — Keep as is | **NO CHANGE** | **LOW** — Not geography FK | **LOW** |
| **OrganizationFormDialog** | Country, Emirate, City, Area text inputs | INPUT | User types free text | Replace with geography selects | **REPLACE** with `CountrySelect`, `EmirateSelect`, `CitySelect`, `AreaZoneSelect` | **LOW** — UI change only | **HIGH** |
| **BranchFormDialog** | Emirate, City, Area text inputs | INPUT | User types free text | Replace with geography selects | **REPLACE** with `CountrySelect` (new), `EmirateSelect`, `CitySelect`, `AreaZoneSelect` | **LOW** — UI change only | **HIGH** |

**Key Insights**:
- ✅ **4 FK columns needed for organizations**: `country_id`, `emirate_id`, `city_id`, `area_zone_id`
- ✅ **4 FK columns needed for branches**: `country_id`, `emirate_id`, `city_id`, `area_zone_id`
- ✅ **8 text columns to keep temporarily**: For backward compatibility and data migration safety
- ✅ **Address line fields remain text**: No geography FK mapping needed
- ✅ **PO Box, Makani, lat/long remain as-is**: Not geography FK references

---

## 5. Organizations Integration Plan

### Current State

**Table**: `owner_companies`

**Existing Location/Address Fields**:
- `country` (TEXT) — Free-text country name
- `emirate` (TEXT) — Free-text emirate/region name
- `city` (TEXT) — Free-text city name (added 002D)
- `area` (TEXT) — Free-text area name (added 002D)
- `address_line_1` (TEXT) — Street address
- `address_line_2` (TEXT) — Additional address
- `po_box` (TEXT) — PO Box number
- `makani_number` (TEXT) — UAE Makani code

### Proposed Fields

**New FK Columns to Add**:
```sql
ALTER TABLE public.owner_companies
  ADD COLUMN country_id BIGINT REFERENCES public.countries(id),
  ADD COLUMN emirate_id BIGINT REFERENCES public.emirates(id),
  ADD COLUMN city_id BIGINT REFERENCES public.cities(id),
  ADD COLUMN area_zone_id BIGINT REFERENCES public.areas_zones(id);
```

**Columns to Keep** (Backward Compatibility):
- `country` (TEXT) — **KEEP** temporarily
- `emirate` (TEXT) — **KEEP** temporarily
- `city` (TEXT) — **KEEP** temporarily
- `area` (TEXT) — **KEEP** temporarily

**Columns to Keep As-Is** (Not Geography FKs):
- `address_line_1` — Free-form street address
- `address_line_2` — Free-form additional address
- `po_box` — PO Box number
- `makani_number` — UAE Makani precise location code
- `latitude` — (Not in owner_companies, but relevant for future)
- `longitude` — (Not in owner_companies, but relevant for future)

**Indexes to Add**:
```sql
CREATE INDEX idx_owner_companies_country_id ON public.owner_companies(country_id);
CREATE INDEX idx_owner_companies_emirate_id ON public.owner_companies(emirate_id);
CREATE INDEX idx_owner_companies_city_id ON public.owner_companies(city_id);
CREATE INDEX idx_owner_companies_area_zone_id ON public.owner_companies(area_zone_id);
```

### UI Changes

**Form**: `src/features/organizations/organization-form-dialog.tsx`

**Current Section**: "Address & Contact" (Section 2 of 5)

**Current Fields** (Text Inputs):
- Country (Input)
- Emirate (Input)
- City (Input)
- Area (Input)
- Address Line 1 (Input)
- Address Line 2 (Input)
- PO Box (Input)
- Makani Number (Input)
- Primary Email (Input)
- Primary Phone (Input)
- Website (Input)

**Proposed Changes**:

**Replace**:
- ❌ Country (Input) → ✅ `<CountrySelect>` with state management
- ❌ Emirate (Input) → ✅ `<EmirateSelect countryId={countryId}>` filtered by country
- ❌ City (Input) → ✅ `<CitySelect emirateId={emirateId}>` filtered by emirate
- ❌ Area (Input) → ✅ `<AreaZoneSelect cityId={cityId}>` filtered by city

**Keep As-Is**:
- ✅ Address Line 1 (Input)
- ✅ Address Line 2 (Input)
- ✅ PO Box (Input)
- ✅ Makani Number (Input)
- ✅ Primary Email (Input)
- ✅ Primary Phone (Input)
- ✅ Website (Input)

**Cascading State Management**:
```typescript
const [countryId, setCountryId] = useState<number | null>(organization?.country_id ?? null);
const [emirateId, setEmirateId] = useState<number | null>(organization?.emirate_id ?? null);
const [cityId, setCityId] = useState<number | null>(organization?.city_id ?? null);
const [areaZoneId, setAreaZoneId] = useState<number | null>(organization?.area_zone_id ?? null);

// Reset dependent selects when parent changes
useEffect(() => {
  if (!countryId) {
    setEmirateId(null);
    setCityId(null);
    setAreaZoneId(null);
  }
}, [countryId]);

useEffect(() => {
  if (!emirateId) {
    setCityId(null);
    setAreaZoneId(null);
  }
}, [emirateId]);

useEffect(() => {
  if (!cityId) {
    setAreaZoneId(null);
  }
}, [cityId]);
```

**Form Submission**:
```typescript
const data = {
  // ... other fields
  country_id: countryId,
  emirate_id: emirateId,
  city_id: cityId,
  area_zone_id: areaZoneId,
  // Keep old text fields for now (future: remove)
  country: null,
  emirate: null,
  city: null,
  area: null,
};
```

### Migration Strategy for Existing Records

**Goal**: Populate new FK columns from existing text values where exact match found.

**Approach**:

1. **Country Matching**:
   ```sql
   UPDATE public.owner_companies oc
   SET country_id = c.id
   FROM public.countries c
   WHERE oc.country_id IS NULL
     AND (
       LOWER(TRIM(oc.country)) = LOWER(TRIM(c.name_en))
       OR LOWER(TRIM(oc.country)) = LOWER(TRIM(c.name_ar))
       OR LOWER(TRIM(oc.country)) = LOWER(TRIM(c.country_code))
       OR oc.country ILIKE '%' || c.name_en || '%'
     );
   ```

2. **Emirate Matching**:
   ```sql
   UPDATE public.owner_companies oc
   SET emirate_id = e.id
   FROM public.emirates e
   WHERE oc.emirate_id IS NULL
     AND oc.country_id IS NOT NULL
     AND e.country_id = oc.country_id
     AND (
       LOWER(TRIM(oc.emirate)) = LOWER(TRIM(e.name_en))
       OR LOWER(TRIM(oc.emirate)) = LOWER(TRIM(e.name_ar))
       OR LOWER(TRIM(oc.emirate)) = LOWER(TRIM(e.emirate_code))
     );
   ```

3. **City Matching**:
   ```sql
   UPDATE public.owner_companies oc
   SET city_id = ct.id
   FROM public.cities ct
   WHERE oc.city_id IS NULL
     AND oc.emirate_id IS NOT NULL
     AND ct.emirate_id = oc.emirate_id
     AND (
       LOWER(TRIM(oc.city)) = LOWER(TRIM(ct.name_en))
       OR LOWER(TRIM(oc.city)) = LOWER(TRIM(ct.name_ar))
     );
   ```

4. **Area Matching**:
   ```sql
   UPDATE public.owner_companies oc
   SET area_zone_id = az.id
   FROM public.areas_zones az
   WHERE oc.area_zone_id IS NULL
     AND oc.city_id IS NOT NULL
     AND az.city_id = oc.city_id
     AND (
       LOWER(TRIM(oc.area)) = LOWER(TRIM(az.name_en))
       OR LOWER(TRIM(oc.area)) = LOWER(TRIM(az.name_ar))
     );
   ```

**Unmatched Values Handling**:
- Generate CSV report of unmatched records
- Include: `id`, `company_code`, `legal_name_en`, `country`, `emirate`, `city`, `area`, match status
- Manual review and correction by admin
- Preserve old text values (no data loss)

**Rollback Plan**:
- Old text columns remain intact
- FK columns are nullable
- Can revert UI to text inputs if critical issue found

---

## 6. Branches Integration Plan

### Current State

**Table**: `branches`

**Existing Location/Address Fields**:
- `emirate` (TEXT) — Free-text emirate/region name
- `city` (TEXT) — Free-text city name (added 002D)
- `area` (TEXT) — Free-text area name
- `address_line_1` (TEXT) — Street address
- `address_line_2` (TEXT) — Additional address
- `po_box` (TEXT) — PO Box number
- `makani_number` (TEXT) — UAE Makani code
- `latitude` (NUMERIC) — GPS latitude
- `longitude` (NUMERIC) — GPS longitude

### Proposed Fields

**New FK Columns to Add**:
```sql
ALTER TABLE public.branches
  ADD COLUMN country_id BIGINT REFERENCES public.countries(id),
  ADD COLUMN emirate_id BIGINT REFERENCES public.emirates(id),
  ADD COLUMN city_id BIGINT REFERENCES public.cities(id),
  ADD COLUMN area_zone_id BIGINT REFERENCES public.areas_zones(id);
```

**Note**: `country_id` is **NEW** for branches (not in original schema). This enables:
- Branches in multiple countries (international expansion)
- Proper cascading Country → Region → City hierarchy
- Consistency with owner_companies structure

**Columns to Keep** (Backward Compatibility):
- `emirate` (TEXT) — **KEEP** temporarily
- `city` (TEXT) — **KEEP** temporarily
- `area` (TEXT) — **KEEP** temporarily

**Columns to Keep As-Is**:
- `address_line_1`, `address_line_2`, `po_box`, `makani_number`, `latitude`, `longitude`

**Indexes to Add**:
```sql
CREATE INDEX idx_branches_country_id ON public.branches(country_id);
CREATE INDEX idx_branches_emirate_id ON public.branches(emirate_id);
CREATE INDEX idx_branches_city_id ON public.branches(city_id);
CREATE INDEX idx_branches_area_zone_id ON public.branches(area_zone_id);
```

### UI Changes

**Form**: `src/features/branches/branch-form-dialog.tsx`

**Current Section**: "Location" (Section 2 of 5)

**Current Fields**:
- Emirate (Input)
- City (Input)
- Area (Input)
- Address Line 1 (Input)
- Address Line 2 (Input)
- PO Box (Input)
- Makani Number (Input)
- Latitude (Number Input)
- Longitude (Number Input)

**Proposed Changes**:

**Add**:
- ✅ `<CountrySelect>` — **NEW** field (enables international branches)

**Replace**:
- ❌ Emirate (Input) → ✅ `<EmirateSelect countryId={countryId}>` filtered by country
- ❌ City (Input) → ✅ `<CitySelect emirateId={emirateId}>` filtered by emirate
- ❌ Area (Input) → ✅ `<AreaZoneSelect cityId={cityId}>` filtered by city

**Keep As-Is**:
- ✅ Address Line 1, 2, PO Box, Makani Number, Latitude, Longitude

**Cascading State Management**: Same pattern as Organizations (see above)

### Migration Strategy for Existing Records

**Same approach as Organizations**, with additional consideration:

**Country Inference**:
- If `branch.country_id` is NULL and `branch.emirate` matches UAE emirate → Set `country_id` to UAE (id=1)
- If `branch.country_id` is NULL and `owner_company.country_id` is known → Inherit from parent company
- Generate report for branches with ambiguous country

**Matching Queries**: Same SQL pattern as Organizations section above.

---

## 7. Address Tables Integration Plan

### Finding

❌ **No Separate Address Tables Exist**

Searched for:
- `owner_company_addresses`
- `branch_addresses`
- `addresses` (generic)
- `company_address` (any variation)

**Result**: Not found in current codebase.

### Current Approach

✅ **Address fields embedded directly in main tables**:
- `owner_companies` table contains address fields
- `branches` table contains address fields

### Recommendation

**For Phase 002F.3C.1B (This Integration)**:
- ✅ **Proceed with inline address approach**
- ✅ **Add FK columns to main tables**
- ❌ **Do NOT create separate address tables now**

**Rationale**:
- Simpler implementation (fewer tables, fewer joins)
- Most organizations and branches have 1 primary address
- Avoids over-engineering before business need confirmed
- FK columns in main tables provide sufficient structured geography

**Future Consideration** (Not in 002F.3C.1B):
- If multi-address support needed (e.g., warehouse address, office address, billing address), create:
  - `owner_company_addresses` table
  - `branch_addresses` table
- With fields: `address_type`, `is_primary`, `country_id`, `emirate_id`, `city_id`, `area_zone_id`, address lines, etc.
- But **defer until business requirement confirmed**

---

## 8. Other Existing Modules Integration Opportunities

| Module / Table / Component | Geography Integration Opportunity | Classification | Notes |
|----------------------------|-----------------------------------|----------------|-------|
| **user_profiles** | User nationality, home address | **LATER** | Not critical for 002F.3C.1B<br>Defer to HR module |
| **audit_logs** | No geography fields | **NOT NEEDED** | Audit logs inherit company/branch context |
| **roles** | No geography fields | **NOT NEEDED** | N/A |
| **permissions** | No geography fields | **NOT NEEDED** | N/A |
| **Global Lookup Categories/Values** | No geography fields | **NOT NEEDED** | Lookups are conceptual, not geographic |
| **Settings / Letterheads** (if exists) | Company address display | **NEXT** | After Organizations integration<br>Use organization FK geography for letterhead |
| **Numbering Rules** (if branch/country filters) | Filter numbering by geography | **LATER** | Low priority<br>Current numbering likely branch-scoped already |
| **Dashboard / Reports** | Geography filters (country, emirate, city) | **LATER** | After all master data integrated<br>Reporting enhancements phase |
| **Master Data Dashboard** | Geography module links | **NOT NEEDED** | Already exists (Geography pages approved) |
| **Future CRM (Customers)** | Customer address with geography FKs | **FUTURE MODULE** | Not in 002F.3C.1B<br>Will follow same pattern as Organizations |
| **Future Procurement (Vendors)** | Vendor address with geography FKs | **FUTURE MODULE** | Not in 002F.3C.1B<br>Will follow same pattern as Organizations |
| **Future HR (Employees)** | Employee home address, nationality | **FUTURE MODULE** | Not in 002F.3C.1B<br>Use countries.id for nationality |
| **Future Fleet (Vehicles)** | Vehicle registration location | **FUTURE MODULE** | Not in 002F.3C.1B |
| **Future Workshop (Work Orders)** | Service location | **FUTURE MODULE** | Not in 002F.3C.1B |
| **Future Projects / Work Sites** | Project site location | **FUTURE MODULE** | Not in 002F.3C.1B<br>Likely separate work_sites table |

**Classification Summary**:
- ✅ **NOW**: Organizations, Branches
- ⏭️ **NEXT**: Letterheads/Settings (if address display needed)
- ⏸️ **LATER**: Dashboard filters, Reports, Numbering
- 🚫 **NOT NEEDED**: Audit, Roles, Permissions, Lookups
- 🔮 **FUTURE MODULE**: CRM, Procurement, HR, Fleet, Workshop, Work Sites

---

## 9. Database Change Recommendations

### Minimum Safe Approach

✅ **Additive, Non-Destructive Migration**

**Strategy**:
1. ✅ **Add new FK columns** beside old text columns
2. ✅ **Keep old text columns** for backward compatibility (do NOT drop now)
3. ✅ **Populate FK columns** where exact match exists
4. ✅ **Keep old text columns** until migration fully verified
5. ⏭️ **Later cleanup phase** can remove/deprecate old text fields (after 1-3 months verification)

### Detailed Schema Changes

#### 9.1 Owner Companies Table

**Migration File**: `supabase/migrations/20260606120000_erp_base_002f3c1b1_organizations_geography_integration.sql`

```sql
-- Add geography FK columns to owner_companies
ALTER TABLE public.owner_companies
  ADD COLUMN country_id BIGINT REFERENCES public.countries(id) ON DELETE SET NULL,
  ADD COLUMN emirate_id BIGINT REFERENCES public.emirates(id) ON DELETE SET NULL,
  ADD COLUMN city_id BIGINT REFERENCES public.cities(id) ON DELETE SET NULL,
  ADD COLUMN area_zone_id BIGINT REFERENCES public.areas_zones(id) ON DELETE SET NULL;

-- Add indexes for performance
CREATE INDEX idx_owner_companies_country_id ON public.owner_companies(country_id);
CREATE INDEX idx_owner_companies_emirate_id ON public.owner_companies(emirate_id);
CREATE INDEX idx_owner_companies_city_id ON public.owner_companies(city_id);
CREATE INDEX idx_owner_companies_area_zone_id ON public.owner_companies(area_zone_id);

-- Add column comments
COMMENT ON COLUMN public.owner_companies.country_id IS 'FK to countries.id (structured geography). Text field "country" kept temporarily for backward compatibility.';
COMMENT ON COLUMN public.owner_companies.emirate_id IS 'FK to emirates.id (administrative region). Text field "emirate" kept temporarily for backward compatibility.';
COMMENT ON COLUMN public.owner_companies.city_id IS 'FK to cities.id (structured geography). Text field "city" kept temporarily for backward compatibility.';
COMMENT ON COLUMN public.owner_companies.area_zone_id IS 'FK to areas_zones.id (structured geography). Text field "area" kept temporarily for backward compatibility.';
```

**Columns to KEEP** (do NOT drop):
- `country` (TEXT) — Legacy field, keep for backward compatibility
- `emirate` (TEXT) — Legacy field, keep for backward compatibility
- `city` (TEXT) — Legacy field, keep for backward compatibility
- `area` (TEXT) — Legacy field, keep for backward compatibility

**Future Cleanup** (NOT in this phase):
- Mark old text columns as deprecated in comments
- Eventually drop after verification (6+ months later)

#### 9.2 Branches Table

**Migration File**: `supabase/migrations/20260606120001_erp_base_002f3c1b2_branches_geography_integration.sql`

```sql
-- Add geography FK columns to branches
ALTER TABLE public.branches
  ADD COLUMN country_id BIGINT REFERENCES public.countries(id) ON DELETE SET NULL,
  ADD COLUMN emirate_id BIGINT REFERENCES public.emirates(id) ON DELETE SET NULL,
  ADD COLUMN city_id BIGINT REFERENCES public.cities(id) ON DELETE SET NULL,
  ADD COLUMN area_zone_id BIGINT REFERENCES public.areas_zones(id) ON DELETE SET NULL;

-- Add indexes for performance
CREATE INDEX idx_branches_country_id ON public.branches(country_id);
CREATE INDEX idx_branches_emirate_id ON public.branches(emirate_id);
CREATE INDEX idx_branches_city_id ON public.branches(city_id);
CREATE INDEX idx_branches_area_zone_id ON public.branches(area_zone_id);

-- Add column comments
COMMENT ON COLUMN public.branches.country_id IS 'FK to countries.id (structured geography). Enables international branches. Inferred from emirate or parent company if not set.';
COMMENT ON COLUMN public.branches.emirate_id IS 'FK to emirates.id (administrative region). Text field "emirate" kept temporarily for backward compatibility.';
COMMENT ON COLUMN public.branches.city_id IS 'FK to cities.id (structured geography). Text field "city" kept temporarily for backward compatibility.';
COMMENT ON COLUMN public.branches.area_zone_id IS 'FK to areas_zones.id (structured geography). Text field "area" kept temporarily for backward compatibility.';
```

**Columns to KEEP**:
- `emirate` (TEXT) — Legacy field, keep for backward compatibility
- `city` (TEXT) — Legacy field, keep for backward compatibility
- `area` (TEXT) — Legacy field, keep for backward compatibility

### Rollback Approach

**If Critical Issue Found**:
1. ✅ **Old text columns intact** — No data loss
2. ✅ **FK columns nullable** — Can be NULLed out without error
3. ✅ **UI can revert to text inputs** — Simple component swap
4. ✅ **Drop FK constraints** if needed:
   ```sql
   ALTER TABLE public.owner_companies DROP COLUMN IF EXISTS country_id;
   -- Repeat for other FK columns
   ```

---

## 10. Data Migration Strategy

### Goal

Populate new FK columns from existing text values **where exact match found in geography master data**.

### Principles

1. ✅ **Preserve all existing text data** — No destructive operations
2. ✅ **Exact match only** — No fuzzy matching in automated migration
3. ✅ **Generate report for unmatched values** — Manual review and correction
4. ✅ **No errors on partial migration** — FK columns nullable, partial population acceptable

### Migration SQL

**Migration File**: `supabase/migrations/20260606120002_erp_base_002f3c1b_geography_data_migration.sql`

#### Step 1: Country Matching (Owner Companies)

```sql
-- Match owner_companies.country → countries.id
UPDATE public.owner_companies oc
SET country_id = c.id
FROM public.countries c
WHERE oc.country_id IS NULL
  AND oc.country IS NOT NULL
  AND (
    LOWER(TRIM(oc.country)) = LOWER(TRIM(c.name_en))
    OR LOWER(TRIM(oc.country)) = LOWER(TRIM(c.name_ar))
    OR LOWER(TRIM(oc.country)) = LOWER(TRIM(c.country_code))
    OR LOWER(TRIM(oc.country)) IN ('uae', 'united arab emirates', 'emirates') AND c.country_code = 'AE'
    OR LOWER(TRIM(oc.country)) IN ('saudi', 'saudi arabia', 'ksa') AND c.country_code = 'SA'
    OR LOWER(TRIM(oc.country)) IN ('qatar') AND c.country_code = 'QA'
  );
```

#### Step 2: Emirate Matching (Owner Companies)

```sql
-- Match owner_companies.emirate → emirates.id (filtered by country)
UPDATE public.owner_companies oc
SET emirate_id = e.id
FROM public.emirates e
WHERE oc.emirate_id IS NULL
  AND oc.country_id IS NOT NULL
  AND e.country_id = oc.country_id
  AND oc.emirate IS NOT NULL
  AND (
    LOWER(TRIM(oc.emirate)) = LOWER(TRIM(e.name_en))
    OR LOWER(TRIM(oc.emirate)) = LOWER(TRIM(e.name_ar))
    OR LOWER(TRIM(oc.emirate)) = LOWER(TRIM(e.emirate_code))
    OR LOWER(TRIM(oc.emirate)) IN ('abu dhabi', 'abudhabi', 'ad', 'adh') AND e.emirate_code = 'AD'
    OR LOWER(TRIM(oc.emirate)) IN ('dubai', 'dxb', 'db') AND e.emirate_code = 'DB'
  );
```

#### Step 3: City Matching (Owner Companies)

```sql
-- Match owner_companies.city → cities.id (filtered by emirate)
UPDATE public.owner_companies oc
SET city_id = ct.id
FROM public.cities ct
WHERE oc.city_id IS NULL
  AND oc.emirate_id IS NOT NULL
  AND ct.emirate_id = oc.emirate_id
  AND oc.city IS NOT NULL
  AND (
    LOWER(TRIM(oc.city)) = LOWER(TRIM(ct.name_en))
    OR LOWER(TRIM(oc.city)) = LOWER(TRIM(ct.name_ar))
    OR LOWER(TRIM(oc.city)) = LOWER(TRIM(ct.city_code))
  );
```

#### Step 4: Area Matching (Owner Companies)

```sql
-- Match owner_companies.area → areas_zones.id (filtered by city)
UPDATE public.owner_companies oc
SET area_zone_id = az.id
FROM public.areas_zones az
WHERE oc.area_zone_id IS NULL
  AND oc.city_id IS NOT NULL
  AND az.city_id = oc.city_id
  AND oc.area IS NOT NULL
  AND (
    LOWER(TRIM(oc.area)) = LOWER(TRIM(az.name_en))
    OR LOWER(TRIM(oc.area)) = LOWER(TRIM(az.name_ar))
    OR LOWER(TRIM(oc.area)) = LOWER(TRIM(az.area_code))
  );
```

#### Step 5: Branches Migration (Same Pattern)

Repeat steps 1-4 for `branches` table with additional country inference:

```sql
-- Infer country_id for branches if emirate matched UAE
UPDATE public.branches b
SET country_id = (SELECT id FROM public.countries WHERE country_code = 'AE' LIMIT 1)
WHERE b.country_id IS NULL
  AND b.emirate_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.emirates e 
    WHERE e.id = b.emirate_id 
      AND e.country_id = (SELECT id FROM public.countries WHERE country_code = 'AE' LIMIT 1)
  );
```

### Unmatched Values Handling

**Migration Report Generation**:

```sql
-- Generate report: Owner Companies with unmatched geography
SELECT 
  id,
  company_code,
  legal_name_en,
  country AS country_text,
  emirate AS emirate_text,
  city AS city_text,
  area AS area_text,
  CASE WHEN country_id IS NULL AND country IS NOT NULL THEN 'Unmatched Country' ELSE 'OK' END AS country_status,
  CASE WHEN emirate_id IS NULL AND emirate IS NOT NULL THEN 'Unmatched Emirate' ELSE 'OK' END AS emirate_status,
  CASE WHEN city_id IS NULL AND city IS NOT NULL THEN 'Unmatched City' ELSE 'OK' END AS city_status,
  CASE WHEN area_zone_id IS NULL AND area IS NOT NULL THEN 'Unmatched Area' ELSE 'OK' END AS area_status
FROM public.owner_companies
WHERE 
  (country IS NOT NULL AND country_id IS NULL)
  OR (emirate IS NOT NULL AND emirate_id IS NULL)
  OR (city IS NOT NULL AND city_id IS NULL)
  OR (area IS NOT NULL AND area_zone_id IS NULL)
ORDER BY company_code;
```

**Export to CSV**: System admin can export this report for manual review.

**Manual Correction**:
- Admin reviews unmatched records
- Options:
  1. Add missing geography master data (e.g., new city not in seed data)
  2. Correct text value typo and re-run migration
  3. Manually set FK via UI
  4. Leave as-is if text value intentionally custom

---

## 11. UI/Form Integration Plan

### Organizations Form

**File**: `src/features/organizations/organization-form-dialog.tsx`

**Section to Modify**: "Address & Contact" (Section 2 of 5)

**Changes**:

1. **Import Geography Select Components**:
   ```typescript
   import { CountrySelect } from "@/components/erp/geography/country-select";
   import { EmirateSelect } from "@/components/erp/geography/emirate-select";
   import { CitySelect } from "@/components/erp/geography/city-select";
   import { AreaZoneSelect } from "@/components/erp/geography/area-zone-select";
   ```

2. **Add State Management**:
   ```typescript
   const [countryId, setCountryId] = useState<number | null>(organization?.country_id ?? null);
   const [emirateId, setEmirateId] = useState<number | null>(organization?.emirate_id ?? null);
   const [cityId, setCityId] = useState<number | null>(organization?.city_id ?? null);
   const [areaZoneId, setAreaZoneId] = useState<number | null>(organization?.area_zone_id ?? null);
   ```

3. **Add Cascading Reset Logic**:
   ```typescript
   useEffect(() => {
     if (!countryId) {
       setEmirateId(null);
       setCityId(null);
       setAreaZoneId(null);
     }
   }, [countryId]);
   
   useEffect(() => {
     if (!emirateId) {
       setCityId(null);
       setAreaZoneId(null);
     }
   }, [emirateId]);
   
   useEffect(() => {
     if (!cityId) {
       setAreaZoneId(null);
     }
   }, [cityId]);
   ```

4. **Replace Input Components with Selects**:
   ```tsx
   {/* Country */}
   <div className="space-y-2">
     <Label htmlFor="country_id">Country</Label>
     <CountrySelect
       value={countryId}
       onValueChange={setCountryId}
       placeholder="Select country..."
       name="country_id"
     />
   </div>
   
   {/* Region / Emirate / Governorate */}
   <div className="space-y-2">
     <Label htmlFor="emirate_id">Region / Emirate / Governorate</Label>
     <EmirateSelect
       value={emirateId}
       onValueChange={setEmirateId}
       countryId={countryId}
       placeholder="Select region..."
       disabled={!countryId}
       name="emirate_id"
     />
   </div>
   
   {/* City */}
   <div className="space-y-2">
     <Label htmlFor="city_id">City</Label>
     <CitySelect
       value={cityId}
       onValueChange={setCityId}
       emirateId={emirateId}
       placeholder="Select city..."
       disabled={!emirateId}
       name="city_id"
     />
   </div>
   
   {/* Area / Zone */}
   <div className="space-y-2">
     <Label htmlFor="area_zone_id">Area / Zone (Optional)</Label>
     <AreaZoneSelect
       value={areaZoneId}
       onValueChange={setAreaZoneId}
       cityId={cityId}
       placeholder="Select area or zone..."
       disabled={!cityId}
       name="area_zone_id"
       allowClear={true}
     />
   </div>
   ```

5. **Update Form Submission**:
   ```typescript
   const data = {
     // ... existing fields
     country_id: countryId,
     emirate_id: emirateId,
     city_id: cityId,
     area_zone_id: areaZoneId,
     // Old text fields: set to null (future: remove from schema entirely)
     country: null,
     emirate: null,
     city: null,
     area: null,
   };
   ```

6. **Backward Compatibility Display** (View Mode):
   ```tsx
   {/* If viewing existing record with no FK but has old text value */}
   {isViewing && !organization.country_id && organization.country && (
     <p className="text-sm text-muted-foreground">
       Legacy: {organization.country}
     </p>
   )}
   ```

### Branches Form

**File**: `src/features/branches/branch-form-dialog.tsx`

**Section to Modify**: "Location" (Section 2 of 5)

**Changes**: Same pattern as Organizations form above, with these specifics:

1. **Add Country Field** (new for branches):
   ```tsx
   <CountrySelect
     value={countryId}
     onValueChange={setCountryId}
     placeholder="Select country..."
     name="country_id"
   />
   ```

2. **Update Emirate Label**:
   ```tsx
   <Label htmlFor="emirate_id">Region / Emirate / Governorate</Label>
   ```

3. **Keep Existing Fields**:
   - Address Line 1, 2
   - PO Box
   - Makani Number
   - Latitude, Longitude

### Validation Messages

**Required Field Validation**:
- Country: "Please select a country"
- Region/Emirate: "Please select a region or emirate"
- City: "Please select a city"
- Area/Zone: (Optional, no error if empty)

**Cascading Validation**:
- If Emirate selected but Country not selected → Auto-set Country from Emirate's country_id
- If City selected but Emirate not selected → Show warning "Please select region first"

### User Experience Considerations

1. **Loading States**: Select components show spinner while loading data
2. **Empty States**: "No countries available" message if geography data empty
3. **Disabled States**: Child selects disabled until parent selected
4. **Clear Functionality**: "X" button to clear selection (except required fields)
5. **Keyboard Navigation**: Select components support keyboard arrow keys
6. **Mobile Responsive**: Select components work on mobile/tablet

---

## 12. Server Actions / Validation Integration Plan

### Organizations Server Actions

**File**: `src/server/actions/organizations.ts` (assumed path)

**Changes Needed**:

1. **Update Create Action**:
   ```typescript
   export async function createOrganization(data: CreateOrganizationInput) {
     const authContext = await getAuthContext();
     if (!hasPermission(authContext, 'organizations.manage')) {
       throw new Error('Insufficient permissions');
     }
   
     const validated = createOrganizationSchema.parse(data);
     const supabase = createClient();
   
     const { data: newOrg, error } = await supabase
       .from('owner_companies')
       .insert({
         ...validated,
         // Include new FK fields
         country_id: validated.country_id,
         emirate_id: validated.emirate_id,
         city_id: validated.city_id,
         area_zone_id: validated.area_zone_id,
         // Old text fields: null or omit
         country: null,
         emirate: null,
         city: null,
         area: null,
         created_by: authContext.user.id,
       })
       .select()
       .single();
   
     if (error) throw error;
   
     // Audit log
     await logAudit({
       module_code: 'organizations',
       entity_name: 'owner_companies',
       entity_id: newOrg.id,
       entity_reference: newOrg.company_code,
       action: 'create',
       new_values: newOrg,
     });
   
     revalidatePath('/admin/organizations');
     return { success: true, data: newOrg };
   }
   ```

2. **Update Update Action**:
   ```typescript
   export async function updateOrganization(data: UpdateOrganizationInput) {
     // ... permission check
   
     const validated = updateOrganizationSchema.parse(data);
     const supabase = createClient();
   
     // Fetch old values for audit diff
     const { data: oldOrg } = await supabase
       .from('owner_companies')
       .select('*')
       .eq('id', data.id)
       .single();
   
     const { data: updated, error } = await supabase
       .from('owner_companies')
       .update({
         ...validated,
         country_id: validated.country_id,
         emirate_id: validated.emirate_id,
         city_id: validated.city_id,
         area_zone_id: validated.area_zone_id,
         updated_by: authContext.user.id,
       })
       .eq('id', data.id)
       .select()
       .single();
   
     if (error) throw error;
   
     // Audit log with diff
     const diff = createAuditDiff(oldOrg, updated);
     await logAudit({
       module_code: 'organizations',
       entity_name: 'owner_companies',
       entity_id: updated.id,
       entity_reference: updated.company_code,
       action: 'update',
       old_values: oldOrg,
       new_values: updated,
     });
   
     revalidatePath('/admin/organizations');
     return { success: true, data: updated };
   }
   ```

3. **Update Get/List Actions**:
   - No changes needed (FK columns automatically included in SELECT *)
   - Optional: Join geography tables for display names in list views

### Branches Server Actions

**File**: `src/server/actions/branches.ts` (assumed path)

**Changes**: Same pattern as Organizations above.

### Validation Schemas

**File**: `src/features/organizations/organization-schema.ts`

**Changes**:

```typescript
import { z } from "zod";

export const createOrganizationSchema = z.object({
  // ... existing basic fields
  
  // NEW: Geography FK fields
  country_id: z.number().int().positive().optional().nullable(),
  emirate_id: z.number().int().positive().optional().nullable(),
  city_id: z.number().int().positive().optional().nullable(),
  area_zone_id: z.number().int().positive().optional().nullable(),
  
  // OLD: Text fields (keep for now, but will be deprecated)
  country: z.string().max(100).optional().nullable(),
  emirate: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  area: z.string().max(100).optional().nullable(),
  
  // ... existing address fields (no change)
  address_line_1: z.string().max(500).optional().nullable(),
  address_line_2: z.string().max(500).optional().nullable(),
  po_box: z.string().max(50).optional().nullable(),
  makani_number: z.string().max(50).optional().nullable(),
  // ... rest of schema
});

export const updateOrganizationSchema = createOrganizationSchema.partial().extend({
  id: z.number().int().positive(),
});
```

**File**: `src/features/branches/branch-schema.ts`

**Changes**: Same pattern as above.

### Type Definitions

**File**: `src/types/database.ts` or similar

**Update**:

```typescript
export interface OwnerCompany {
  id: number;
  company_code: string;
  legal_name_en: string;
  legal_name_ar: string | null;
  // ... other fields
  
  // NEW: Geography FKs
  country_id: number | null;
  emirate_id: number | null;
  city_id: number | null;
  area_zone_id: number | null;
  
  // OLD: Text fields (deprecated but kept)
  country: string | null;
  emirate: string | null;
  city: string | null;
  area: string | null;
  
  // ... audit fields
}

export interface Branch {
  id: number;
  branch_code: string;
  branch_name_en: string;
  // ... other fields
  
  // NEW: Geography FKs
  country_id: number | null;
  emirate_id: number | null;
  city_id: number | null;
  area_zone_id: number | null;
  
  // OLD: Text fields (deprecated but kept)
  emirate: string | null;
  city: string | null;
  area: string | null;
  
  // ... audit fields
}
```

---

## 13. RLS / Permission / Audit Impact

### RLS Policies Impact

**Finding**: ✅ **No RLS Policy Changes Needed**

**Rationale**:
1. **New FK columns inherit table-level RLS**:
   - `owner_companies` RLS policies already control row visibility
   - `branches` RLS policies already control row visibility
   - Adding FK columns does NOT change who can see which rows

2. **Geography master data read access**:
   - Geography tables have their own RLS: `master_data.geography.view` permission required
   - Users with Organizations/Branches view permission typically also have Geography view permission
   - If not, grant `master_data.geography.view` to relevant roles

3. **System_admin full access preserved**:
   - System_admin bypasses all RLS policies
   - Can view/edit all organizations and branches regardless of FK values

**Verification Query**:
```sql
-- Check if user can read geography data
SELECT current_user_has_permission('master_data.geography.view');
```

**Action Required**: 
- ✅ Verify `group_admin`, `company_admin` roles have `master_data.geography.view` permission
- ✅ If missing, add permission assignment in a migration

### Permissions Impact

**Finding**: ✅ **No New Permissions Needed**

**Existing Permissions Cover Geography Integration**:
- `organizations.view` — View organizations (including FK geography fields)
- `organizations.manage` — Create/edit organizations (including setting FK fields)
- `branches.view` — View branches (including FK geography fields)
- `branches.manage` — Create/edit branches (including setting FK fields)
- `master_data.geography.view` — Read countries, emirates, cities, areas (needed for select dropdowns)

**Verification**:
- ✅ Current permission structure sufficient
- ✅ No new permission codes required
- ❌ Do NOT add `organizations.geography.manage` (over-engineering)

### Audit Impact

**Finding**: ✅ **Audit Logging Automatically Captures FK Changes**

**How Audit Works**:
1. **Create Operation**:
   - `new_values` JSONB captures entire new record including `country_id`, `emirate_id`, `city_id`, `area_zone_id`
   - Audit log shows: `"action": "create", "new_values": { "country_id": 1, "emirate_id": 3, ... }`

2. **Update Operation**:
   - `old_values` and `new_values` both captured
   - `createAuditDiff(old, new)` function generates diff
   - Audit diff shows: `"emirate_id": { "old": 3, "new": 5 }` if emirate changed

3. **No Code Changes Needed**:
   - ✅ Existing `logAudit()` helper automatically captures all columns
   - ✅ Audit logs already store JSONB (flexible schema)
   - ✅ FK changes will appear in audit_logs.new_values JSONB

**Future Enhancement** (Not in 002F.3C.1B):
- Display geography names in audit logs UI (e.g., "Country changed from 'UAE' to 'Saudi Arabia'")
- Requires joining audit_logs with geography tables for display
- Current: Shows FK numbers (acceptable for now)

### System_Admin Full Access

**Finding**: ✅ **System_Admin Full Access Preserved**

**Verification**:
- ✅ System_admin role bypasses all RLS policies (`current_user_is_global_admin()` returns TRUE)
- ✅ System_admin can view/edit all organizations regardless of company scope
- ✅ System_admin can view/edit all branches regardless of branch scope
- ✅ System_admin can view all geography master data
- ✅ System_admin can lock/unlock geography master data records

**No Changes Required**: System_admin behavior unchanged.

---

## 14. Backward Compatibility Plan

### Principles

1. ✅ **Zero Data Loss** — Old text columns preserved
2. ✅ **Gradual Migration** — FK columns nullable, partial population acceptable
3. ✅ **UI Fallback** — Display old text value if FK is null
4. ✅ **Rollback Safety** — Can revert to old text inputs if critical issue

### Old Text Columns Strategy

**KEEP for Now**:
- `owner_companies.country` (TEXT)
- `owner_companies.emirate` (TEXT)
- `owner_companies.city` (TEXT)
- `owner_companies.area` (TEXT)
- `branches.emirate` (TEXT)
- `branches.city` (TEXT)
- `branches.area` (TEXT)

**Deprecation Timeline**:
1. **Phase 002F.3C.1B (Current)**: Add FK columns, keep old text columns
2. **Phase 002F.3C.1B + 1 month**: Verify FK population, manual correction of unmatched
3. **Phase 002F.3C.1B + 3 months**: Mark old text columns as deprecated in migration comments
4. **Phase 002F.3C.1B + 6 months**: Consider dropping old text columns if 100% migrated
5. **Sameer Decision**: Final timeline for deprecation

### UI Fallback Display

**View Mode** (Viewing Existing Record):
```tsx
{/* Display geography name from FK */}
{organization.country_id ? (
  <p>Country: {getCountryName(organization.country_id)}</p>
) : organization.country ? (
  <p className="text-muted-foreground">Country (Legacy): {organization.country}</p>
) : (
  <p className="text-muted-foreground">Country: Not set</p>
)}
```

**Helper Function** (Optional):
```typescript
async function getCountryName(countryId: number): Promise<string> {
  const { data } = await supabase
    .from('countries')
    .select('name_en')
    .eq('id', countryId)
    .single();
  return data?.name_en || `Country ID ${countryId}`;
}
```

### Edit Mode Behavior

**Existing Record with Null FK**:
- ✅ Show geography select components (empty initially)
- ✅ Display legacy text value as hint: `<p className="text-xs text-muted-foreground">Legacy: {organization.country}</p>`
- ✅ User can select from geography master data
- ✅ On save, FK populated, old text cleared (or kept for audit)

**Existing Record with FK**:
- ✅ Show geography select components with FK value pre-selected
- ✅ User can change selection
- ✅ On save, FK updated

### Loading Existing Records

**Query**:
```typescript
const { data: organizations } = await supabase
  .from('owner_companies')
  .select('*')
  .eq('status', 'active');

// Both FK and text columns returned
// UI logic handles fallback display
```

**No Breaking Changes**: Existing queries continue to work.

### Rollback Plan

**If Critical Issue Found After Deployment**:

1. **Immediate Rollback** (UI Level):
   ```tsx
   // Revert form components to text inputs
   <Input name="country" defaultValue={organization.country || ""} />
   ```

2. **Database Rollback** (Schema Level):
   ```sql
   -- Drop FK columns if needed
   ALTER TABLE public.owner_companies DROP COLUMN IF EXISTS country_id;
   ALTER TABLE public.owner_companies DROP COLUMN IF EXISTS emirate_id;
   ALTER TABLE public.owner_companies DROP COLUMN IF EXISTS city_id;
   ALTER TABLE public.owner_companies DROP COLUMN IF EXISTS area_zone_id;
   -- Repeat for branches
   ```

3. **Data Intact**: Old text columns never dropped, so all data preserved.

---

## 15. Implementation Phasing Recommendation

### Recommended Sub-Phases

**ERP BASE 002F.3C.1B — Geography & Locations Integration (Split into 2 Sub-Phases)**

#### Phase 002F.3C.1B.1 — Organizations Geography Integration

**Scope**:
- ✅ Add FK columns to `owner_companies` table
- ✅ Update organization validation schema
- ✅ Update organization form UI (replace text inputs with geography selects)
- ✅ Update organization server actions
- ✅ Data migration for existing organizations
- ✅ Generate unmatched values report
- ✅ Test: Create new organization with geography FKs
- ✅ Test: Edit existing organization with null FKs
- ✅ Test: View organization with legacy text values

**Estimated Effort**: 4-6 hours implementation + 2 hours testing

**Deliverables**:
1. Migration file: `20260606120000_erp_base_002f3c1b1_organizations_geography_integration.sql`
2. Migration file: `20260606120002_erp_base_002f3c1b1_organizations_data_migration.sql`
3. Updated: `organization-schema.ts`
4. Updated: `organization-form-dialog.tsx`
5. Updated: `src/server/actions/organizations.ts`
6. Migration report: CSV of unmatched organizations

**Acceptance Criteria**:
- [ ] FK columns added to owner_companies
- [ ] UI uses geography select components
- [ ] Create organization saves FK values
- [ ] Edit organization loads FK values correctly
- [ ] Cascading selects work (Country → Emirate → City → Area)
- [ ] Old text values display as fallback
- [ ] Build passes (typecheck, lint, build)
- [ ] Manual browser testing successful

#### Phase 002F.3C.1B.2 — Branches Geography Integration

**Scope**:
- ✅ Add FK columns to `branches` table
- ✅ Update branch validation schema
- ✅ Update branch form UI (add Country select, replace text inputs)
- ✅ Update branch server actions
- ✅ Data migration for existing branches
- ✅ Generate unmatched values report
- ✅ Test: Create new branch with geography FKs
- ✅ Test: Edit existing branch with null FKs
- ✅ Test: View branch with legacy text values

**Estimated Effort**: 4-6 hours implementation + 2 hours testing

**Deliverables**:
1. Migration file: `20260606120001_erp_base_002f3c1b2_branches_geography_integration.sql`
2. Migration file: `20260606120003_erp_base_002f3c1b2_branches_data_migration.sql`
3. Updated: `branch-schema.ts`
4. Updated: `branch-form-dialog.tsx`
5. Updated: `src/server/actions/branches.ts`
6. Migration report: CSV of unmatched branches

**Acceptance Criteria**:
- [ ] FK columns added to branches
- [ ] UI uses geography select components
- [ ] Country select added to branch form
- [ ] Create branch saves FK values
- [ ] Edit branch loads FK values correctly
- [ ] Cascading selects work
- [ ] Old text values display as fallback
- [ ] Build passes
- [ ] Manual browser testing successful

### Alternative: Single Combined Phase

**If Sameer Prefers**: Combine 002F.3C.1B.1 and 002F.3C.1B.2 into **one implementation phase**.

**Pros**:
- ✅ Faster overall completion
- ✅ Fewer deployment cycles
- ✅ Organizations and Branches integrated together

**Cons**:
- ⚠️ Larger scope per phase (more risk)
- ⚠️ Harder to isolate issues if something breaks
- ⚠️ Longer testing cycle

**Recommendation**: ✅ **Split into 2 sub-phases** for safer, more manageable implementation.

### After 002F.3C.1B Completion

**Next Step**: ✅ **Proceed to ERP BASE 002F.3C.2 — Finance Basics / Commercial Readiness**

---

## 16. Testing Plan

### Database Testing

**Migration Verification**:
```sql
-- 1. Verify FK columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'owner_companies'
  AND column_name IN ('country_id', 'emirate_id', 'city_id', 'area_zone_id');

-- 2. Verify indexes exist
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename = 'owner_companies'
  AND indexname LIKE 'idx_%_id';

-- 3. Verify FK constraints
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'public.owner_companies'::regclass
  AND contype = 'f';

-- 4. Check data migration results
SELECT 
  COUNT(*) AS total_records,
  COUNT(country_id) AS country_fk_populated,
  COUNT(emirate_id) AS emirate_fk_populated,
  COUNT(city_id) AS city_fk_populated,
  COUNT(area_zone_id) AS area_fk_populated,
  COUNT(CASE WHEN country IS NOT NULL AND country_id IS NULL THEN 1 END) AS unmatched_country,
  COUNT(CASE WHEN emirate IS NOT NULL AND emirate_id IS NULL THEN 1 END) AS unmatched_emirate
FROM public.owner_companies;

-- 5. Test cascading deletes (should SET NULL, not cascade delete)
BEGIN;
DELETE FROM public.countries WHERE id = 999; -- Test country (non-existent)
ROLLBACK;
```

**Repeat for `branches` table**.

### TypeScript Testing

```bash
npm run typecheck
```

**Expected**: ✅ No TypeScript errors

**Check**:
- ✅ `organization-schema.ts` valid
- ✅ `branch-schema.ts` valid
- ✅ `organization-form-dialog.tsx` valid
- ✅ `branch-form-dialog.tsx` valid
- ✅ Type definitions updated

### Linting

```bash
npm run lint
```

**Expected**: ✅ No critical lint errors (warnings acceptable if pre-existing)

### Build

```bash
npm run build
```

**Expected**: ✅ Build succeeds without errors

### UI Component Testing (Manual Browser)

#### Organizations Form Testing

**Test 1: Create New Organization with Geography**:
1. Navigate to `/admin/organizations`
2. Click "Add Organization"
3. Select **Country**: "United Arab Emirates"
4. Select **Region/Emirate**: "Abu Dhabi"
5. Select **City**: "Abu Dhabi"
6. Select **Area/Zone**: "Musaffah"
7. Fill other required fields
8. Click "Save"
9. ✅ Verify: Record created with FK values populated
10. ✅ Verify: View mode displays geography names

**Test 2: Edit Existing Organization with Null FKs**:
1. Open existing organization with legacy text values
2. ✅ Verify: Text values show as "Legacy: ..." hint
3. Select geography from dropdowns
4. Click "Save"
5. ✅ Verify: FKs populated, legacy text cleared or kept

**Test 3: Cascading Select Behavior**:
1. Add new organization
2. Select Country: "Saudi Arabia"
3. ✅ Verify: Emirate dropdown shows only Saudi regions
4. Select Emirate: "Riyadh"
5. ✅ Verify: City dropdown shows only Riyadh cities
6. Change Country to "UAE"
7. ✅ Verify: Emirate dropdown resets to empty
8. ✅ Verify: City and Area dropdowns disabled

**Test 4: View Mode Fallback**:
1. View organization with null FKs but legacy text values
2. ✅ Verify: Legacy text displays correctly
3. Edit and populate FKs
4. View again
5. ✅ Verify: Geography names display (not legacy text)

#### Branches Form Testing

**Test 1-4**: Same as Organizations above, adapted for branches.

**Test 5: Country Field (New for Branches)**:
1. Add new branch
2. ✅ Verify: Country select visible and functional
3. Select Country
4. ✅ Verify: Enables Emirate dropdown

### RLS Testing

**Test 1: System_Admin**:
1. Login as system_admin
2. ✅ Can view all organizations
3. ✅ Can edit all organizations
4. ✅ Can create organization with any geography FK
5. ✅ Can view geography master data

**Test 2: Company_Admin**:
1. Login as company_admin (scoped to Company A)
2. ✅ Can view Company A organizations/branches
3. ❌ Cannot view Company B organizations
4. ✅ Can edit Company A organization geography FKs
5. ✅ Can view geography master data (if permission granted)

**Test 3: Branch_Admin**:
1. Login as branch_admin (scoped to Branch X)
2. ✅ Can view Branch X
3. ❌ Cannot edit Branch X geography FKs (unless permission granted)
4. ✅ Can view geography master data

### Permission Testing

**Verify Permissions**:
```sql
-- Check geography view permission for roles
SELECT r.role_code, p.permission_code
FROM public.roles r
JOIN public.role_permissions rp ON rp.role_id = r.id
JOIN public.permissions p ON p.id = rp.permission_id
WHERE p.permission_code = 'master_data.geography.view'
ORDER BY r.role_code;
```

**Expected**:
- ✅ system_admin: has permission
- ✅ group_admin: has permission
- ✅ company_admin: has permission (or grant it)
- ✅ branch_admin: has permission (or grant it)

### Data Migration Testing

**Test Migration Report**:
1. Export unmatched organizations CSV
2. ✅ Verify: Report includes all unmatched records
3. ✅ Verify: Report columns: id, company_code, country_text, emirate_text, match_status
4. Manual review: Identify if unmatched values are typos or legitimate custom values

**Test Manual Correction**:
1. Admin edits unmatched organization in UI
2. Selects correct geography from dropdowns
3. Saves
4. ✅ Verify: FK populated
5. Re-run migration report
6. ✅ Verify: Record no longer in unmatched list

---

## 17. Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Old text values do not match geography master data exactly** | **HIGH** — FKs remain null, users see legacy text only | **HIGH** — UAE emirate names may vary ("Abu Dhabi" vs "AbuDhabi" vs "AD") | ✅ Comprehensive data migration SQL with fuzzy matching<br>✅ Generate unmatched values report<br>✅ Manual admin review and correction<br>✅ Keep old text columns for fallback |
| **Data loss if old text columns dropped prematurely** | **CRITICAL** — Irreversible data loss | **LOW** — Plan explicitly keeps old columns | ✅ Do NOT drop old text columns in 002F.3C.1B<br>✅ Deprecate after 3-6 months verification<br>✅ Sameer approval required before any column drop |
| **Route/form breakage** | **MEDIUM** — Users cannot create/edit organizations | **LOW** — UI changes are straightforward | ✅ Thorough manual browser testing<br>✅ Test all form modes (add, edit, view)<br>✅ Test cascading select behavior<br>✅ Rollback plan ready (revert to text inputs) |
| **FK constraint failures** | **MEDIUM** — Cannot save organization if FK invalid | **VERY LOW** — Geography master data seeded and stable | ✅ FK constraints use ON DELETE SET NULL (not RESTRICT)<br>✅ Geography master data locked (is_system = TRUE for critical records)<br>✅ Select components only show valid FK values |
| **Inconsistent country/region/city values** | **MEDIUM** — User selects city from wrong region | **LOW** — Cascading selects enforce hierarchy | ✅ EmirateSelect filtered by countryId<br>✅ CitySelect filtered by emirateId<br>✅ AreaZoneSelect filtered by cityId<br>✅ Reset child selects when parent changes |
| **Cascading select UX issues** | **LOW** — Users confused by disabled dropdowns | **MEDIUM** — Users may not understand cascading hierarchy | ✅ Clear labels: "Region / Emirate / Governorate"<br>✅ Placeholder text: "Select country first"<br>✅ Disabled state with opacity<br>✅ Tooltip/help text (future enhancement) |
| **Geography master data read access restricted** | **MEDIUM** — Select dropdowns empty for non-admin users | **LOW** — Most roles have geography view permission | ✅ Verify all relevant roles have `master_data.geography.view` permission<br>✅ Grant permission in migration if missing<br>✅ Test with company_admin and branch_admin roles |
| **Too much scope before 002F.3C.2** | **LOW** — Delays Finance Basics implementation | **MEDIUM** — Integration may take longer than expected | ✅ Phased approach: Organizations first, then Branches<br>✅ Clear acceptance criteria<br>✅ Strict scope: ONLY Organizations and Branches (no other modules) |
| **Future modules depend on geography FKs** | **LOW** — If geography integration fails, future modules blocked | **VERY LOW** — Geography master data approved and stable | ✅ Geography module (002F.3C.1) already approved and tested<br>✅ Select components proven and functional<br>✅ This integration is low-risk extension |

**Overall Risk Level**: ✅ **LOW TO MEDIUM** — Mitigations address all major risks. Safe to proceed.

---

## 18. Acceptance Criteria

### Database

- [ ] FK columns added to `owner_companies`: `country_id`, `emirate_id`, `city_id`, `area_zone_id`
- [ ] FK columns added to `branches`: `country_id`, `emirate_id`, `city_id`, `area_zone_id`
- [ ] Indexes created for all FK columns
- [ ] FK constraints added with `ON DELETE SET NULL`
- [ ] Old text columns preserved: `country`, `emirate`, `city`, `area` in both tables
- [ ] Data migration executed successfully
- [ ] Migration report generated for unmatched values
- [ ] No existing data lost

### TypeScript

- [ ] `organization-schema.ts` updated with FK fields
- [ ] `branch-schema.ts` updated with FK fields
- [ ] Type definitions updated
- [ ] `npm run typecheck` passes with 0 errors

### UI Components

- [ ] `OrganizationFormDialog` uses `CountrySelect`, `EmirateSelect`, `CitySelect`, `AreaZoneSelect`
- [ ] `BranchFormDialog` uses all 4 geography select components
- [ ] Cascading select behavior implemented (Country → Emirate → City → Area)
- [ ] Reset logic: changing parent clears child selects
- [ ] Disabled states: child selects disabled until parent selected
- [ ] Legacy text fallback display in view mode
- [ ] All text inputs for geography replaced (no free-text entry for country/emirate/city/area)

### Server Actions

- [ ] `createOrganization` saves FK values
- [ ] `updateOrganization` saves FK values and preserves audit diff
- [ ] `createBranch` saves FK values
- [ ] `updateBranch` saves FK values and preserves audit diff
- [ ] `logAudit` captures FK changes in new_values/old_values JSONB

### RLS & Permissions

- [ ] No RLS policy changes needed (existing policies cover FK columns)
- [ ] Geography view permission granted to relevant roles
- [ ] System_admin full access preserved
- [ ] Company_admin can view/edit organizations in their scope
- [ ] Branch_admin can view branches in their scope

### Build & Lint

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes (or only pre-existing warnings)
- [ ] `npm run build` succeeds

### Browser Testing

- [ ] Create new organization with geography FKs: SUCCESS
- [ ] Edit existing organization with null FKs: SUCCESS
- [ ] View organization with legacy text: Displays fallback correctly
- [ ] Cascading selects work: Country → Emirate → City → Area
- [ ] Reset logic works: Changing country clears emirate, city, area
- [ ] Create new branch with geography FKs: SUCCESS
- [ ] Edit existing branch with null FKs: SUCCESS
- [ ] View branch with legacy text: Displays fallback correctly
- [ ] Country field added to branch form: VISIBLE and FUNCTIONAL

### Data Migration

- [ ] Migration report generated (CSV or SQL query result)
- [ ] Unmatched organizations identified and documented
- [ ] Unmatched branches identified and documented
- [ ] Manual admin review completed (or scheduled)
- [ ] No critical data mismatches

### Documentation

- [ ] This integration plan approved by Sameer
- [ ] Implementation report generated after completion
- [ ] Migration report shared with Sameer
- [ ] Any deviations from plan documented

---

## 19. Final Recommendation

### Should Integration Happen Before 002F.3C.2?

✅ **YES — Geography Integration MUST Happen Before Finance Basics (002F.3C.2)**

**Rationale**:

1. **Foundation for Future Modules**:
   - CRM (Customers), Procurement (Vendors), HR (Employees) will ALL need geography FKs
   - Finance Basics (002F.3C.2) itself may need geography (e.g., banks.country_id)
   - Implementing geography integration now establishes pattern for all future modules
   - Deferring creates technical debt and inconsistent data models

2. **Current Modules Incomplete Without Geography**:
   - Organizations and Branches use free-text location fields (low data quality)
   - Cannot generate reports by country/region/city without structured FKs
   - Cannot filter operations by geography without FKs

3. **Low Risk, High Value**:
   - ✅ Geography master data approved and stable
   - ✅ Select components already exist and functional
   - ✅ Safe additive migration (no data loss)
   - ✅ Estimated 8-12 hours implementation time (small scope)
   - ✅ High value: Clean, structured geography data for entire system

4. **Sameer's Explicit Requirement**:
   - User quote: "Before 002F.3C.2, we need to integrate organizations and branches with master data like country, city, area, etc."
   - Clear directive to complete geography integration first

### Recommended Minimum Safe Implementation

✅ **Phased Approach: 002F.3C.1B.1 (Organizations) → 002F.3C.1B.2 (Branches)**

**Phase 002F.3C.1B.1**:
- ✅ Add FK columns to `owner_companies`
- ✅ Update organization form UI
- ✅ Update organization validation/actions
- ✅ Data migration for organizations
- ✅ Test and verify

**Phase 002F.3C.1B.2**:
- ✅ Add FK columns to `branches`
- ✅ Update branch form UI
- ✅ Update branch validation/actions
- ✅ Data migration for branches
- ✅ Test and verify

**Alternative**: If Sameer prefers, combine into **one phase** (002F.3C.1B) for faster completion.

### Exact First Implementation Sub-Phase

✅ **PROMPT_ERP_BASE_002F_3C_1B_1_IMPLEMENT_ORGANIZATIONS_GEOGRAPHY_INTEGRATION.md**

**Scope**:
- Database: Add FK columns to `owner_companies`, data migration
- UI: Update `organization-form-dialog.tsx` with geography selects
- Validation: Update `organization-schema.ts`
- Actions: Update organization server actions
- Testing: Manual browser testing + build verification

**Estimated Effort**: 4-6 hours implementation + 2 hours testing

**After Completion**: Proceed to **PROMPT_ERP_BASE_002F_3C_1B_2_IMPLEMENT_BRANCHES_GEOGRAPHY_INTEGRATION.md**

### Any Decision Needed from Sameer

**Questions for Sameer**:

1. ✅ **Phasing Preference**:
   - Option A: Split into 2 sub-phases (Organizations, then Branches) — **RECOMMENDED**
   - Option B: Single combined phase (Organizations + Branches together)

2. ✅ **Data Migration Unmatched Values**:
   - After migration, unmatched organizations/branches report will be generated
   - Will Sameer review manually? Or delegate to admin?
   - Timeline for manual correction?

3. ✅ **Old Text Column Deprecation Timeline**:
   - Keep old text columns for 1 month? 3 months? 6 months?
   - When can old columns be dropped?

4. ✅ **Geography View Permission**:
   - Should `company_admin` and `branch_admin` roles have `master_data.geography.view` permission?
   - Or restrict geography view to global admins only?

5. ✅ **Proceed to Implementation**:
   - After Sameer approves this plan, proceed immediately to 002F.3C.1B.1?
   - Or wait for additional review?

### Whether Work Sites Remain Deferred

✅ **YES — Work Sites Remain Deferred to Future Phase**

**Rationale**:
- Work Sites not mentioned in current geography module (002F.3C.1)
- Work Sites likely separate master data table (not Organizations or Branches)
- Work Sites will be part of future Operations or Projects module
- No impact on current 002F.3C.1B scope

**Future**: Work Sites will follow same geography integration pattern when implemented.

### Whether Old Text Fields Remain Temporarily

✅ **YES — Old Text Fields MUST Remain Temporarily**

**Timeline**:
- ✅ **002F.3C.1B (Now)**: Add FK columns, keep old text columns
- ✅ **002F.3C.1B + 1 month**: Verify FK population, manual correction
- ✅ **002F.3C.1B + 3 months**: Mark old columns as deprecated in comments
- ⏭️ **002F.3C.1B + 6+ months**: Consider dropping old text columns (Sameer approval required)

**Do NOT Drop Old Columns Now**: Critical for data safety and rollback capability.

---

## 20. Next Prompt Name After Approval

### Recommended Next Prompt

✅ **`PROMPT_ERP_BASE_002F_3C_1B_1_IMPLEMENT_ORGANIZATIONS_GEOGRAPHY_INTEGRATION.md`**

**Purpose**: Implementation Only (NOT Planning)

**Scope**:
1. Create migration: `20260606120000_erp_base_002f3c1b1_organizations_geography_integration.sql`
2. Create migration: `20260606120002_erp_base_002f3c1b1_organizations_data_migration.sql`
3. Update: `src/features/organizations/organization-schema.ts`
4. Update: `src/features/organizations/organization-form-dialog.tsx`
5. Update: `src/server/actions/organizations.ts` (if actions file exists)
6. Update: Type definitions (if separate file)
7. Run: `npm run typecheck`, `npm run lint`, `npm run build`
8. Apply migrations via MCP
9. Manual browser testing
10. Generate implementation report

**After 002F.3C.1B.1 Completion**:

✅ **`PROMPT_ERP_BASE_002F_3C_1B_2_IMPLEMENT_BRANCHES_GEOGRAPHY_INTEGRATION.md`**

**Scope**: Same as above but for `branches` table and branch form UI.

**After 002F.3C.1B Completion**:

✅ **Proceed to ERP BASE 002F.3C.2 — Finance Basics / Commercial Readiness**

---

## Final Status

✅ **READY FOR SAMEER REVIEW — Geography Integration Impact Plan Complete**

**Document Deliverables**:
- ✅ 20 comprehensive sections covering all aspects of integration
- ✅ Detailed source inspection summary (organizations, branches, geography components)
- ✅ Complete field inventory with risk assessment
- ✅ Database schema change recommendations (additive, non-destructive)
- ✅ Data migration strategy (exact matching, unmatched report)
- ✅ UI integration plan (cascading selects, state management)
- ✅ Server actions and validation updates
- ✅ RLS/Permission/Audit impact analysis
- ✅ Backward compatibility plan (old columns preserved)
- ✅ Implementation phasing (2 sub-phases recommended)
- ✅ Comprehensive testing plan (database, TypeScript, UI, RLS)
- ✅ Risk analysis with mitigations
- ✅ Clear acceptance criteria
- ✅ Final recommendation: YES, proceed before 002F.3C.2
- ✅ Next prompt name: `PROMPT_ERP_BASE_002F_3C_1B_1_IMPLEMENT_ORGANIZATIONS_GEOGRAPHY_INTEGRATION.md`

**Ready for**:
- ✅ Sameer review and approval
- ✅ Implementation to begin immediately after approval
- ✅ Safe, structured, low-risk integration of geography into existing modules

**Implementation Can Start**: ✅ **YES — After Sameer approval of this plan**

---

**END OF GEOGRAPHY INTEGRATION IMPACT PLAN**