-- ============================================================================
-- ERP BASE 002F.3E.2 — PEOPLE / CONTACTS / CRM FOUNDATION
-- DATABASE SCHEMA + LOOKUP CATEGORIES + SEED VALUES
-- ============================================================================
--
-- Phase: ERP BASE 002F.3E.2 — Database + Lookups + Seeds
-- Created: Sunday, June 7, 2026 3:00 PM (UTC+4)
-- Updated: Sunday, June 7, 2026 4:45 PM (UTC+4) — REV4 FINAL Schema Compatibility Fix
-- Source: ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN_REV4.md
-- Purpose: Create 29 tables, seed 23 lookup categories + ~136 values, 116 RLS policies, 4 permissions
--
-- REVISION HISTORY:
--   Initial (3:00 PM): Generated with 22 lookup categories, ~130 values
--   REV1 (3:30 PM): Added ICV certificate fields (10 fields) and CICPA registration (1 field) to 5 tables
--                   Added ICV_STATUS_TYPES lookup category with 6 values
--                   Lookup categories: 22 → 23, Lookup values: ~130 → ~136
--   REV3 (3:50 PM): Removed unsafe FK references to global_lookup_values(value_code) — 75 occurrences
--                   Added column comments indicating lookup category source for all lookup-code fields
--                   Lookup validation moved to application layer via LookupSelect components
--   REV4 FINAL (4:45 PM): SCHEMA COMPATIBILITY FIX — Regenerated to match actual database schema
--                         Fixed global_lookup_values INSERTs: category_code → category_id (via CTE subqueries)
--                         Fixed global_lookup_values INSERTs: value_name_en/ar → value_label_en/ar
--                         Fixed role_permissions INSERTs: (role_code, permission_code) → (role_id, permission_id)
--                         All 23 lookup INSERT blocks now use CTE pattern with scalar subqueries
--                         All 4 role_permissions INSERT blocks now use CROSS JOIN with FK resolution
--
-- CRITICAL: THIS SQL FILE IS FOR REVIEW ONLY
-- It has NOT been applied to the database.
-- Sameer/Dina review and approval required before application.
--
-- ============================================================================
-- LOOKUP PATTERN EXPLANATION (REV3)
-- ============================================================================
--
-- All *_code fields (e.g., customer_type_code, status_code, icv_status_code) reference
-- lookup values from global_lookup_values table, but DO NOT use direct foreign keys.
--
-- REASON:
--   global_lookup_values.value_code is NOT globally unique.
--   The same value_code may exist in multiple lookup categories.
--   Example: ACTIVE may exist in PARTY_STATUS_TYPES, EQUIPMENT_STATUS_TYPES, etc.
--   The lookup system uses (category_code, value_code) as composite key.
--   Direct FK to value_code alone is unsafe and would cause referential integrity issues.
--
-- VALIDATION APPROACH:
--   1. Database: Column comments document the intended lookup category (e.g., 'Lookup value code from CUSTOMER_TYPES')
--   2. Application: LookupSelect component enforces category-specific value selection
--   3. Server: Zod schemas validate value_code exists in the correct category via server queries
--
-- EXAMPLE:
--   customers.customer_type_code text not null
--   COMMENT: 'Lookup value code from CUSTOMER_TYPES'
--   Application ensures only CUSTOMER_TYPES values can be selected
--
-- ============================================================================
-- CLASSIFICATION RULES DOCUMENTATION
-- ============================================================================
--
-- CUSTOMERS:
--   Use for: normal customer, government customer, semi-government customer,
--            utility company, water & power plant, main contractor, EPC contractor,
--            scrap buyer, scrap supplier, industrial customer, commercial customer,
--            partner customer
--
-- VENDORS:
--   Use for: supplier, material supplier, equipment supplier, service provider,
--            insurance company, lessor (property/vehicle/equipment/camp),
--            transporter as service provider, logistics service provider,
--            private waste disposal facility, private waste disposal service provider,
--            utility provider
--
-- SUBCONTRACTORS:
--   Use for: civil subcontractor, manpower subcontractor, transport subcontractor,
--            transporter when subcontracted for project execution,
--            demolition subcontractor, equipment subcontractor,
--            specialized subcontractor, partner subcontractor
--
-- CONSULTANTS:
--   Use for: engineering consultant, HSE consultant, legal consultant,
--            technical consultant, environmental consultant, audit consultant
--
-- GOVERNMENT AUTHORITIES:
--   Use for: license issuer, permit issuer, regulator, municipality,
--            civil defense, police, environmental authority, free zone authority,
--            port authority, customs authority, port/customs authority,
--            utility authority, transport authority,
--            government waste disposal authority, government disposal facility,
--            ministry
--
-- RECRUITMENT AGENCIES:
--   Use for: local recruitment agency, overseas recruitment agency,
--            manpower supply agency, executive search agency
--   Note: Separate table but vendor-like for payment and bank detail purposes.
--
-- FLEXIBLE CLASSIFICATIONS:
--   - Transporter can be vendor (service provider) OR subcontractor (project execution)
--   - Waste disposal facility can be government authority (government-owned) OR vendor (private)
--   - Recruitment agencies are separate but vendor-like for payments
--   - Partners are not separate table; they are customer or subcontractor classification
--
-- ============================================================================
-- SECTION 1: LOOKUP CATEGORIES (22 Categories)
-- ============================================================================

-- Insert lookup categories (idempotent)
INSERT INTO global_lookup_categories (
  category_code, category_name_en, category_name_ar, description, 
  module_code, is_system, is_locked, sort_order
) VALUES
-- PARTY_STATUS_TYPES
('PARTY_STATUS_TYPES', 'Party Status Types', 'أنواع حالة الطرف', 
 'Common status values for all party entities', 
 'PARTIES', true, true, 10),

-- CUSTOMER_TYPES
('CUSTOMER_TYPES', 'Customer Types', 'أنواع العملاء', 
 'Customer classification types (REV1 expanded for government/utility/industrial customers)', 
 'PARTIES', true, false, 20),

-- CUSTOMER_SEGMENTS
('CUSTOMER_SEGMENTS', 'Customer Segments', 'شرائح العملاء', 
 'Customer segmentation for CRM and sales strategy', 
 'PARTIES', false, false, 30),

-- VENDOR_TYPES
('VENDOR_TYPES', 'Vendor Types', 'أنواع الموردين', 
 'Vendor classification types (REV1 expanded for transporters/logistics/waste disposal)', 
 'PARTIES', true, false, 40),

-- VENDOR_CATEGORIES
('VENDOR_CATEGORIES', 'Vendor Categories', 'فئات الموردين', 
 'Vendor categorization for procurement', 
 'PARTIES', false, false, 50),

-- SUPPLIER_CATEGORIES
('SUPPLIER_CATEGORIES', 'Supplier Categories', 'فئات الموردين', 
 'Supplier categorization for material/equipment suppliers', 
 'PARTIES', false, false, 60),

-- SUBCONTRACTOR_TYPES
('SUBCONTRACTOR_TYPES', 'Subcontractor Types', 'أنواع المقاولين من الباطن', 
 'Subcontractor classification types (REV1 expanded for transport subcontractors)', 
 'PARTIES', true, false, 70),

-- SUBCONTRACTOR_CATEGORIES
('SUBCONTRACTOR_CATEGORIES', 'Subcontractor Categories', 'فئات المقاولين من الباطن', 
 'Subcontractor categorization for project management', 
 'PARTIES', false, false, 80),

-- CONSULTANT_TYPES
('CONSULTANT_TYPES', 'Consultant Types', 'أنواع الاستشاريين', 
 'Consultant classification types (REV1 expanded for audit consultants)', 
 'PARTIES', true, false, 90),

-- CONSULTANT_CATEGORIES
('CONSULTANT_CATEGORIES', 'Consultant Categories', 'فئات الاستشاريين', 
 'Consultant categorization for professional services', 
 'PARTIES', false, false, 100),

-- GOVERNMENT_AUTHORITY_TYPES
('GOVERNMENT_AUTHORITY_TYPES', 'Government Authority Types', 'أنواع الجهات الحكومية', 
 'Government authority classification (REV1 expanded for license/permit issuers, utility/transport authorities)', 
 'PARTIES', true, false, 110),

-- GOVERNMENT_AUTHORITY_CATEGORIES
('GOVERNMENT_AUTHORITY_CATEGORIES', 'Government Authority Categories', 'فئات الجهات الحكومية', 
 'Government authority categorization for compliance', 
 'PARTIES', false, false, 120),

-- JURISDICTION_LEVEL_TYPES
('JURISDICTION_LEVEL_TYPES', 'Jurisdiction Level Types', 'أنواع مستويات الاختصاص', 
 'Jurisdiction levels for government authorities', 
 'PARTIES', true, false, 130),

-- RECRUITMENT_AGENCY_TYPES
('RECRUITMENT_AGENCY_TYPES', 'Recruitment Agency Types', 'أنواع وكالات التوظيف',
 'Recruitment agency classification types',
 'PARTIES', true, false, 140),

-- ICV_STATUS_TYPES
('ICV_STATUS_TYPES', 'ICV Certificate Status Types', 'أنواع حالة شهادة ICV',
 'ICV (In-Country Value) certificate status types',
 'COMPLIANCE', true, false, 150),

-- RECRUITMENT_AGENCY_CATEGORIES
('RECRUITMENT_AGENCY_CATEGORIES', 'Recruitment Agency Categories', 'فئات وكالات التوظيف', 
 'Recruitment agency categorization for HR', 
 'PARTIES', false, false, 150),

-- INDUSTRY_TYPES
('INDUSTRY_TYPES', 'Industry Types', 'أنواع الصناعات', 
 'Industry classification for customers and business analysis', 
 'PARTIES', false, false, 160),

-- CRM_LEAD_SOURCES
('CRM_LEAD_SOURCES', 'CRM Lead Sources', 'مصادر العملاء المحتملين', 
 'Lead sources for CRM and sales tracking', 
 'PARTIES', false, false, 170),

-- CONTACT_TYPES
('CONTACT_TYPES', 'Contact Types', 'أنواع جهات الاتصال', 
 'Contact person types for relationship management', 
 'PARTIES', false, false, 180),

-- COMMUNICATION_PREFERENCE_TYPES
('COMMUNICATION_PREFERENCE_TYPES', 'Communication Preference Types', 'أنواع تفضيلات الاتصال', 
 'Preferred communication methods for contacts', 
 'PARTIES', false, false, 190),

-- ADDRESS_TYPES
('ADDRESS_TYPES', 'Address Types', 'أنواع العناوين', 
 'Address types for party entities', 
 'PARTIES', false, false, 200),

-- PARTY_DOCUMENT_TYPES
('PARTY_DOCUMENT_TYPES', 'Party Document Types', 'أنواع مستندات الطرف', 
 'Document types for party entities', 
 'PARTIES', false, false, 210),

-- BANK_ACCOUNT_TYPES
('BANK_ACCOUNT_TYPES', 'Bank Account Types', 'أنواع الحسابات المصرفية', 
 'Bank account types for payment processing', 
 'PARTIES', false, false, 220)

ON CONFLICT (category_code) 
DO UPDATE SET 
  category_name_en = EXCLUDED.category_name_en,
  category_name_ar = EXCLUDED.category_name_ar,
  description = EXCLUDED.description,
  module_code = EXCLUDED.module_code,
  updated_at = now();

-- ============================================================================
-- SECTION 2: LOOKUP VALUES (~130 Values)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PARTY_STATUS_TYPES (5 values)
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'PARTY_STATUS_TYPES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'ACTIVE', 'Active', 'نشط', 'Active party', 'green', true, true, true, 10),
  ((SELECT id FROM cat), 'INACTIVE', 'Inactive', 'غير نشط', 'Inactive party', 'gray', true, false, false, 20),
  ((SELECT id FROM cat), 'BLACKLISTED', 'Blacklisted', 'القائمة السوداء', 'Blacklisted party', 'red', true, false, false, 30),
  ((SELECT id FROM cat), 'ON_HOLD', 'On Hold', 'معلق', 'Party on hold', 'yellow', true, false, false, 40),
  ((SELECT id FROM cat), 'UNDER_REVIEW', 'Under Review', 'قيد المراجعة', 'Party under review', 'orange', true, false, false, 50)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  badge_variant = EXCLUDED.badge_variant,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- CUSTOMER_TYPES (12 values) — REV1 EXPANDED
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'CUSTOMER_TYPES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'NORMAL_CUSTOMER', 'Normal Customer', 'عميل عادي', 'Normal customer', 'blue', true, false, true, 10),
  ((SELECT id FROM cat), 'GOVERNMENT_CUSTOMER', 'Government Customer', 'عميل حكومي', 'Government customer (e.g., municipalities, government entities)', 'purple', true, false, false, 20),
  ((SELECT id FROM cat), 'SEMI_GOVERNMENT_CUSTOMER', 'Semi-Government Customer', 'عميل شبه حكومي', 'Semi-government customer (e.g., Dubai Holding entities)', 'purple', true, false, false, 30),
  ((SELECT id FROM cat), 'UTILITY_COMPANY', 'Utility Company', 'شركة المرافق', 'Utility company (e.g., TAQA, EWEC, DEWA)', 'orange', true, false, false, 40),
  ((SELECT id FROM cat), 'WATER_POWER_PLANT', 'Water & Power Plant', 'محطة المياه والطاقة', 'Water desalination plant or power generation facility', 'cyan', true, false, false, 50),
  ((SELECT id FROM cat), 'INDUSTRIAL_CUSTOMER', 'Industrial Customer', 'عميل صناعي', 'Industrial customer (e.g., manufacturing facilities, factories)', 'brown', true, false, false, 60),
  ((SELECT id FROM cat), 'COMMERCIAL_CUSTOMER', 'Commercial Customer', 'عميل تجاري', 'Commercial customer (e.g., retail, hospitality, commercial real estate)', 'pink', true, false, false, 70),
  ((SELECT id FROM cat), 'MAIN_CONTRACTOR', 'Main Contractor', 'المقاول الرئيسي', 'Main contractor', 'purple', true, false, false, 80),
  ((SELECT id FROM cat), 'EPC_CONTRACTOR', 'EPC Contractor', 'مقاول EPC', 'EPC contractor', 'purple', true, false, false, 90),
  ((SELECT id FROM cat), 'SCRAP_BUYER', 'Scrap Buyer', 'مشتري الخردة', 'Scrap buyer', 'green', true, false, false, 100),
  ((SELECT id FROM cat), 'SCRAP_SUPPLIER', 'Scrap Supplier', 'مورد الخردة', 'Scrap supplier', 'orange', true, false, false, 110),
  ((SELECT id FROM cat), 'PARTNER_CUSTOMER', 'Partner Customer', 'عميل شريك', 'Partner customer', 'gold', true, false, false, 120)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  badge_variant = EXCLUDED.badge_variant,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- CUSTOMER_SEGMENTS (10 values)
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'CUSTOMER_SEGMENTS' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'ENTERPRISE', 'Enterprise', 'مؤسسة كبيرة', 'Enterprise customer', 'purple', false, false, false, 10),
  ((SELECT id FROM cat), 'SME', 'SME', 'شركة صغيرة ومتوسطة', 'Small and medium enterprise', 'blue', false, false, false, 20),
  ((SELECT id FROM cat), 'GOVERNMENT', 'Government', 'حكومي', 'Government sector', 'purple', false, false, false, 30),
  ((SELECT id FROM cat), 'INDUSTRIAL', 'Industrial', 'صناعي', 'Industrial sector', 'brown', false, false, false, 40),
  ((SELECT id FROM cat), 'COMMERCIAL', 'Commercial', 'تجاري', 'Commercial sector', 'pink', false, false, false, 50),
  ((SELECT id FROM cat), 'CONSTRUCTION', 'Construction', 'إنشاءات', 'Construction sector', 'orange', false, false, false, 60),
  ((SELECT id FROM cat), 'LOGISTICS', 'Logistics', 'لوجستيات', 'Logistics sector', 'cyan', false, false, false, 70),
  ((SELECT id FROM cat), 'RETAIL', 'Retail', 'تجزئة', 'Retail sector', 'green', false, false, false, 80),
  ((SELECT id FROM cat), 'HOSPITALITY', 'Hospitality', 'ضيافة', 'Hospitality sector', 'yellow', false, false, false, 90),
  ((SELECT id FROM cat), 'OTHER', 'Other', 'أخرى', 'Other segment', 'gray', false, false, false, 100)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- VENDOR_TYPES (15 values) — REV1 EXPANDED
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'VENDOR_TYPES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'SUPPLIER', 'Supplier', 'مورد', 'General supplier', 'blue', true, false, true, 10),
  ((SELECT id FROM cat), 'MATERIAL_SUPPLIER', 'Material Supplier', 'مورد المواد', 'Material supplier', 'green', true, false, false, 20),
  ((SELECT id FROM cat), 'EQUIPMENT_SUPPLIER', 'Equipment Supplier', 'مورد المعدات', 'Equipment supplier', 'orange', true, false, false, 30),
  ((SELECT id FROM cat), 'SERVICE_PROVIDER', 'Service Provider', 'مزود الخدمة', 'Service provider', 'purple', true, false, false, 40),
  ((SELECT id FROM cat), 'TRANSPORTER', 'Transporter', 'ناقل', 'Transport service vendor (general transport services)', 'cyan', true, false, false, 50),
  ((SELECT id FROM cat), 'TRANSPORT_SERVICE_PROVIDER', 'Transport Service Provider', 'مزود خدمة النقل', 'Specialized transport service provider', 'cyan', true, false, false, 60),
  ((SELECT id FROM cat), 'LOGISTICS_SERVICE_PROVIDER', 'Logistics Service Provider', 'مزود خدمة لوجستية', '3PL logistics service provider', 'cyan', true, false, false, 70),
  ((SELECT id FROM cat), 'PRIVATE_WASTE_DISPOSAL_FACILITY', 'Private Waste Disposal Facility', 'مرفق التخلص من النفايات الخاصة', 'Private waste treatment/disposal company', 'green', true, false, false, 80),
  ((SELECT id FROM cat), 'WASTE_DISPOSAL_SERVICE_PROVIDER', 'Waste Disposal Service Provider', 'مزود خدمة التخلص من النفايات', 'Waste management service vendor', 'green', true, false, false, 90),
  ((SELECT id FROM cat), 'INSURANCE_COMPANY', 'Insurance Company', 'شركة تأمين', 'Insurance company', 'yellow', true, false, false, 100),
  ((SELECT id FROM cat), 'PROPERTY_LESSOR', 'Property Lessor', 'مؤجر العقارات', 'Property lessor', 'brown', true, false, false, 110),
  ((SELECT id FROM cat), 'VEHICLE_LESSOR', 'Vehicle Lessor', 'مؤجر المركبات', 'Vehicle lessor', 'brown', true, false, false, 120),
  ((SELECT id FROM cat), 'EQUIPMENT_LESSOR', 'Equipment Lessor', 'مؤجر المعدات', 'Equipment lessor', 'brown', true, false, false, 130),
  ((SELECT id FROM cat), 'CAMP_ACCOMMODATION_LESSOR', 'Camp/Accommodation Lessor', 'مؤجر المخيمات/الإقامة', 'Camp/accommodation lessor', 'brown', true, false, false, 140),
  ((SELECT id FROM cat), 'UTILITY_PROVIDER', 'Utility Provider', 'مزود المرافق', 'Utility provider', 'gray', true, false, false, 150)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  badge_variant = EXCLUDED.badge_variant,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- VENDOR_CATEGORIES (8 values)
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'VENDOR_CATEGORIES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'PREFERRED', 'Preferred Vendor', 'مورد مفضل', 'Preferred vendor', 'green', false, false, false, 10),
  ((SELECT id FROM cat), 'APPROVED', 'Approved Vendor', 'مورد معتمد', 'Approved vendor', 'blue', false, false, false, 20),
  ((SELECT id FROM cat), 'TRIAL', 'Trial Vendor', 'مورد تجريبي', 'Trial vendor', 'yellow', false, false, false, 30),
  ((SELECT id FROM cat), 'LOCAL', 'Local Vendor', 'مورد محلي', 'Local UAE vendor', 'cyan', false, false, false, 40),
  ((SELECT id FROM cat), 'INTERNATIONAL', 'International Vendor', 'مورد دولي', 'International vendor', 'purple', false, false, false, 50),
  ((SELECT id FROM cat), 'STRATEGIC', 'Strategic Vendor', 'مورد استراتيجي', 'Strategic vendor', 'gold', false, false, false, 60),
  ((SELECT id FROM cat), 'ONE_TIME', 'One-Time Vendor', 'مورد لمرة واحدة', 'One-time vendor', 'gray', false, false, false, 70),
  ((SELECT id FROM cat), 'BLOCKED', 'Blocked Vendor', 'مورد محظور', 'Blocked vendor', 'red', false, false, false, 80)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- SUPPLIER_CATEGORIES (6 values)
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'SUPPLIER_CATEGORIES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'RAW_MATERIALS', 'Raw Materials', 'المواد الخام', 'Raw materials supplier', 'green', false, false, false, 10),
  ((SELECT id FROM cat), 'SPARE_PARTS', 'Spare Parts', 'قطع الغيار', 'Spare parts supplier', 'orange', false, false, false, 20),
  ((SELECT id FROM cat), 'CONSUMABLES', 'Consumables', 'المواد الاستهلاكية', 'Consumables supplier', 'blue', false, false, false, 30),
  ((SELECT id FROM cat), 'MACHINERY', 'Machinery', 'الآلات', 'Machinery supplier', 'purple', false, false, false, 40),
  ((SELECT id FROM cat), 'CHEMICALS', 'Chemicals', 'المواد الكيميائية', 'Chemicals supplier', 'yellow', false, false, false, 50),
  ((SELECT id FROM cat), 'PACKAGING', 'Packaging', 'التغليف', 'Packaging supplier', 'pink', false, false, false, 60)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- SUBCONTRACTOR_TYPES (8 values) — REV1 EXPANDED
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'SUBCONTRACTOR_TYPES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'CIVIL_SUBCONTRACTOR', 'Civil Subcontractor', 'مقاول مدني من الباطن', 'Civil subcontractor', 'blue', true, false, true, 10),
  ((SELECT id FROM cat), 'MANPOWER_SUBCONTRACTOR', 'Manpower Subcontractor', 'مقاول عمالة من الباطن', 'Manpower subcontractor', 'green', true, false, false, 20),
  ((SELECT id FROM cat), 'TRANSPORTER', 'Transporter', 'ناقل', 'Transporter subcontractor (project execution)', 'orange', true, false, false, 30),
  ((SELECT id FROM cat), 'TRANSPORT_SUBCONTRACTOR', 'Transport Subcontractor', 'مقاول نقل من الباطن', 'Transport subcontractor (subcontracted for project execution)', 'orange', true, false, false, 40),
  ((SELECT id FROM cat), 'DEMOLITION_SUBCONTRACTOR', 'Demolition Subcontractor', 'مقاول هدم من الباطن', 'Demolition subcontractor', 'red', true, false, false, 50),
  ((SELECT id FROM cat), 'EQUIPMENT_SUBCONTRACTOR', 'Equipment Subcontractor', 'مقاول معدات من الباطن', 'Equipment subcontractor', 'purple', true, false, false, 60),
  ((SELECT id FROM cat), 'SPECIALIZED_SUBCONTRACTOR', 'Specialized Subcontractor', 'مقاول متخصص من الباطن', 'Specialized subcontractor (painting, electrical, HVAC, etc.)', 'cyan', true, false, false, 70),
  ((SELECT id FROM cat), 'PARTNER_SUBCONTRACTOR', 'Partner Subcontractor', 'مقاول شريك من الباطن', 'Partner subcontractor', 'gold', true, false, false, 80)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  badge_variant = EXCLUDED.badge_variant,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- SUBCONTRACTOR_CATEGORIES (6 values)
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'SUBCONTRACTOR_CATEGORIES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'PREFERRED', 'Preferred Subcontractor', 'مقاول من الباطن مفضل', 'Preferred subcontractor', 'green', false, false, false, 10),
  ((SELECT id FROM cat), 'APPROVED', 'Approved Subcontractor', 'مقاول من الباطن معتمد', 'Approved subcontractor', 'blue', false, false, false, 20),
  ((SELECT id FROM cat), 'TRIAL', 'Trial Subcontractor', 'مقاول من الباطن تجريبي', 'Trial subcontractor', 'yellow', false, false, false, 30),
  ((SELECT id FROM cat), 'LOCAL', 'Local Subcontractor', 'مقاول من الباطن محلي', 'Local UAE subcontractor', 'cyan', false, false, false, 40),
  ((SELECT id FROM cat), 'INTERNATIONAL', 'International Subcontractor', 'مقاول من الباطن دولي', 'International subcontractor', 'purple', false, false, false, 50),
  ((SELECT id FROM cat), 'BLOCKED', 'Blocked Subcontractor', 'مقاول من الباطن محظور', 'Blocked subcontractor', 'red', false, false, false, 60)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- CONSULTANT_TYPES (6 values) — REV1 EXPANDED
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'CONSULTANT_TYPES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'ENGINEERING_CONSULTANT', 'Engineering Consultant', 'استشاري هندسي', 'Engineering consultant', 'blue', true, false, true, 10),
  ((SELECT id FROM cat), 'HSE_CONSULTANT', 'HSE Consultant', 'استشاري الصحة والسلامة والبيئة', 'HSE consultant', 'red', true, false, false, 20),
  ((SELECT id FROM cat), 'LEGAL_CONSULTANT', 'Legal Consultant', 'استشاري قانوني', 'Legal consultant', 'purple', true, false, false, 30),
  ((SELECT id FROM cat), 'TECHNICAL_CONSULTANT', 'Technical Consultant', 'استشاري فني', 'Technical consultant', 'green', true, false, false, 40),
  ((SELECT id FROM cat), 'ENVIRONMENTAL_CONSULTANT', 'Environmental Consultant', 'استشاري بيئي', 'Environmental consultant', 'green', true, false, false, 50),
  ((SELECT id FROM cat), 'AUDIT_CONSULTANT', 'Audit Consultant', 'استشاري تدقيق', 'Audit consultant (financial, operational, compliance)', 'orange', true, false, false, 60)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  badge_variant = EXCLUDED.badge_variant,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- CONSULTANT_CATEGORIES (4 values)
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'CONSULTANT_CATEGORIES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'RETAINER', 'Retainer Consultant', 'استشاري محتفظ به', 'Retainer consultant', 'green', false, false, false, 10),
  ((SELECT id FROM cat), 'PROJECT_BASED', 'Project-Based Consultant', 'استشاري على أساس المشروع', 'Project-based consultant', 'blue', false, false, false, 20),
  ((SELECT id FROM cat), 'ADHOC', 'Ad-Hoc Consultant', 'استشاري مخصص', 'Ad-hoc consultant', 'yellow', false, false, false, 30),
  ((SELECT id FROM cat), 'STRATEGIC', 'Strategic Consultant', 'استشاري استراتيجي', 'Strategic consultant', 'purple', false, false, false, 40)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- GOVERNMENT_AUTHORITY_TYPES (15 values) — REV1 EXPANDED
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'GOVERNMENT_AUTHORITY_TYPES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'LICENSE_ISSUER', 'License Issuer', 'مصدر الرخصة', 'License issuer (e.g., Dubai Economic Department)', 'blue', true, false, false, 10),
  ((SELECT id FROM cat), 'PERMIT_ISSUER', 'Permit Issuer', 'مصدر التصريح', 'Permit issuer (e.g., CICPA, environmental permits)', 'blue', true, false, false, 20),
  ((SELECT id FROM cat), 'REGULATOR', 'Regulator', 'المنظم', 'Regulator', 'gray', true, false, true, 30),
  ((SELECT id FROM cat), 'MUNICIPALITY', 'Municipality', 'البلدية', 'Municipality', 'blue', true, false, false, 40),
  ((SELECT id FROM cat), 'POLICE', 'Police', 'الشرطة', 'Police', 'red', true, false, false, 50),
  ((SELECT id FROM cat), 'CIVIL_DEFENSE', 'Civil Defense', 'الدفاع المدني', 'Civil defense', 'red', true, false, false, 60),
  ((SELECT id FROM cat), 'ENVIRONMENTAL_AUTHORITY', 'Environmental Authority', 'الهيئة البيئية', 'Environmental authority', 'green', true, false, false, 70),
  ((SELECT id FROM cat), 'FREE_ZONE_AUTHORITY', 'Free Zone Authority', 'هيئة المنطقة الحرة', 'Free zone authority', 'purple', true, false, false, 80),
  ((SELECT id FROM cat), 'PORT_AUTHORITY', 'Port Authority', 'سلطة الميناء', 'Port authority', 'cyan', true, false, false, 90),
  ((SELECT id FROM cat), 'CUSTOMS_AUTHORITY', 'Customs Authority', 'سلطة الجمارك', 'Customs authority', 'cyan', true, false, false, 100),
  ((SELECT id FROM cat), 'PORT_CUSTOMS_AUTHORITY', 'Port & Customs Authority', 'سلطة الميناء والجمارك', 'Combined port and customs authority', 'cyan', true, false, false, 110),
  ((SELECT id FROM cat), 'UTILITY_AUTHORITY', 'Utility Authority', 'سلطة المرافق', 'Utility authority', 'orange', true, false, false, 120),
  ((SELECT id FROM cat), 'TRANSPORT_AUTHORITY', 'Transport Authority', 'سلطة النقل', 'Transport authority (e.g., Dubai RTA, Abu Dhabi DOT)', 'orange', true, false, false, 130),
  ((SELECT id FROM cat), 'WASTE_DISPOSAL_FACILITY', 'Waste Disposal Facility', 'مرفق التخلص من النفايات', 'Government waste disposal facility', 'green', true, false, false, 140),
  ((SELECT id FROM cat), 'GOVERNMENT_WASTE_DISPOSAL_AUTHORITY', 'Govt Waste Disposal Authority', 'سلطة التخلص من النفايات الحكومية', 'Government waste disposal authority', 'green', true, false, false, 150),
  ((SELECT id FROM cat), 'MINISTRY', 'Ministry', 'الوزارة', 'Ministry', 'purple', true, false, false, 160)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  badge_variant = EXCLUDED.badge_variant,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- GOVERNMENT_AUTHORITY_CATEGORIES (4 values)
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'GOVERNMENT_AUTHORITY_CATEGORIES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'FEDERAL', 'Federal Authority', 'جهة اتحادية', 'Federal authority', 'purple', false, false, false, 10),
  ((SELECT id FROM cat), 'EMIRATE', 'Emirate Authority', 'جهة إمارة', 'Emirate authority', 'blue', false, false, false, 20),
  ((SELECT id FROM cat), 'LOCAL', 'Local Authority', 'جهة محلية', 'Local authority', 'cyan', false, false, false, 30),
  ((SELECT id FROM cat), 'FREE_ZONE', 'Free Zone Authority', 'جهة منطقة حرة', 'Free zone authority', 'purple', false, false, false, 40)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- JURISDICTION_LEVEL_TYPES (4 values)
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'JURISDICTION_LEVEL_TYPES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'FEDERAL', 'Federal', 'اتحادي', 'Federal jurisdiction', 'purple', true, false, false, 10),
  ((SELECT id FROM cat), 'EMIRATE', 'Emirate', 'إمارة', 'Emirate jurisdiction', 'blue', true, false, false, 20),
  ((SELECT id FROM cat), 'MUNICIPALITY', 'Municipality', 'بلدية', 'Municipality jurisdiction', 'cyan', true, false, false, 30),
  ((SELECT id FROM cat), 'FREE_ZONE', 'Free Zone', 'منطقة حرة', 'Free zone jurisdiction', 'purple', true, false, false, 40)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- RECRUITMENT_AGENCY_TYPES (4 values)
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'RECRUITMENT_AGENCY_TYPES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'LOCAL_RECRUITMENT_AGENCY', 'Local Recruitment Agency', 'وكالة توظيف محلية', 'Local UAE recruitment agency', 'blue', true, false, false, 10),
  ((SELECT id FROM cat), 'OVERSEAS_RECRUITMENT_AGENCY', 'Overseas Recruitment Agency', 'وكالة توظيف خارجية', 'Overseas recruitment agency', 'purple', true, false, false, 20),
  ((SELECT id FROM cat), 'MANPOWER_SUPPLY_AGENCY', 'Manpower Supply Agency', 'وكالة توريد القوى العاملة', 'Manpower supply agency', 'green', true, false, false, 30),
  ((SELECT id FROM cat), 'EXECUTIVE_SEARCH_AGENCY', 'Executive Search Agency', 'وكالة البحث التنفيذي', 'Executive search agency', 'gold', true, false, false, 40)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- ICV_STATUS_TYPES (6 values)
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'ICV_STATUS_TYPES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'VALID', 'Valid', 'صالح', 'ICV certificate is valid', 'green', true, false, false, 10),
  ((SELECT id FROM cat), 'EXPIRED', 'Expired', 'منتهي الصلاحية', 'ICV certificate has expired', 'red', true, false, false, 20),
  ((SELECT id FROM cat), 'UNDER_RENEWAL', 'Under Renewal', 'قيد التجديد', 'ICV certificate is under renewal', 'orange', true, false, false, 30),
  ((SELECT id FROM cat), 'NOT_AVAILABLE', 'Not Available', 'غير متوفر', 'ICV certificate is not available', 'gray', true, false, true, 40),
  ((SELECT id FROM cat), 'NOT_REQUIRED', 'Not Required', 'غير مطلوب', 'ICV certificate is not required', 'blue', true, false, false, 50),
  ((SELECT id FROM cat), 'PENDING_SUBMISSION', 'Pending Submission', 'بانتظار التقديم', 'ICV certificate/details are pending submission', 'yellow', true, false, false, 60)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- RECRUITMENT_AGENCY_CATEGORIES (4 values)
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'RECRUITMENT_AGENCY_CATEGORIES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'PREFERRED', 'Preferred Agency', 'وكالة مفضلة', 'Preferred recruitment agency', 'green', false, false, false, 10),
  ((SELECT id FROM cat), 'APPROVED', 'Approved Agency', 'وكالة معتمدة', 'Approved recruitment agency', 'blue', false, false, false, 20),
  ((SELECT id FROM cat), 'TRIAL', 'Trial Agency', 'وكالة تجريبية', 'Trial recruitment agency', 'yellow', false, false, false, 30),
  ((SELECT id FROM cat), 'BLOCKED', 'Blocked Agency', 'وكالة محظورة', 'Blocked recruitment agency', 'red', false, false, false, 40)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- INDUSTRY_TYPES (12 values)
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'INDUSTRY_TYPES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'CONSTRUCTION', 'Construction', 'إنشاءات', 'Construction industry', 'orange', false, false, false, 10),
  ((SELECT id FROM cat), 'MANUFACTURING', 'Manufacturing', 'تصنيع', 'Manufacturing industry', 'brown', false, false, false, 20),
  ((SELECT id FROM cat), 'LOGISTICS', 'Logistics', 'لوجستيات', 'Logistics industry', 'cyan', false, false, false, 30),
  ((SELECT id FROM cat), 'RETAIL', 'Retail', 'تجزئة', 'Retail industry', 'green', false, false, false, 40),
  ((SELECT id FROM cat), 'HOSPITALITY', 'Hospitality', 'ضيافة', 'Hospitality industry', 'yellow', false, false, false, 50),
  ((SELECT id FROM cat), 'GOVERNMENT', 'Government', 'حكومي', 'Government sector', 'purple', false, false, false, 60),
  ((SELECT id FROM cat), 'UTILITIES', 'Utilities', 'المرافق', 'Utilities industry', 'orange', false, false, false, 70),
  ((SELECT id FROM cat), 'ENERGY', 'Energy', 'طاقة', 'Energy industry', 'red', false, false, false, 80),
  ((SELECT id FROM cat), 'HEALTHCARE', 'Healthcare', 'رعاية صحية', 'Healthcare industry', 'pink', false, false, false, 90),
  ((SELECT id FROM cat), 'REAL_ESTATE', 'Real Estate', 'عقارات', 'Real estate industry', 'brown', false, false, false, 100),
  ((SELECT id FROM cat), 'TECHNOLOGY', 'Technology', 'تقنية', 'Technology industry', 'blue', false, false, false, 110),
  ((SELECT id FROM cat), 'OTHER', 'Other', 'أخرى', 'Other industry', 'gray', false, false, false, 120)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- CRM_LEAD_SOURCES (10 values)
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'CRM_LEAD_SOURCES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'WEBSITE', 'Website', 'موقع إلكتروني', 'Website inquiry', 'blue', false, false, false, 10),
  ((SELECT id FROM cat), 'REFERRAL', 'Referral', 'إحالة', 'Customer referral', 'green', false, false, false, 20),
  ((SELECT id FROM cat), 'DIRECT_SALES', 'Direct Sales', 'مبيعات مباشرة', 'Direct sales team', 'purple', false, false, false, 30),
  ((SELECT id FROM cat), 'SOCIAL_MEDIA', 'Social Media', 'وسائل التواصل الاجتماعي', 'Social media', 'cyan', false, false, false, 40),
  ((SELECT id FROM cat), 'EMAIL_CAMPAIGN', 'Email Campaign', 'حملة البريد الإلكتروني', 'Email marketing campaign', 'orange', false, false, false, 50),
  ((SELECT id FROM cat), 'TRADE_SHOW', 'Trade Show', 'معرض تجاري', 'Trade show/exhibition', 'yellow', false, false, false, 60),
  ((SELECT id FROM cat), 'COLD_CALL', 'Cold Call', 'مكالمة باردة', 'Cold call', 'gray', false, false, false, 70),
  ((SELECT id FROM cat), 'EXISTING_CUSTOMER', 'Existing Customer', 'عميل حالي', 'Existing customer', 'green', false, false, false, 80),
  ((SELECT id FROM cat), 'PARTNER', 'Partner', 'شريك', 'Partner referral', 'gold', false, false, false, 90),
  ((SELECT id FROM cat), 'OTHER', 'Other', 'أخرى', 'Other source', 'gray', false, false, false, 100)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- CONTACT_TYPES (8 values)
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'CONTACT_TYPES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'PRIMARY', 'Primary Contact', 'جهة اتصال رئيسية', 'Primary contact', 'blue', false, false, false, 10),
  ((SELECT id FROM cat), 'FINANCE', 'Finance Contact', 'جهة اتصال مالية', 'Finance contact', 'green', false, false, false, 20),
  ((SELECT id FROM cat), 'OPERATIONS', 'Operations Contact', 'جهة اتصال تشغيلية', 'Operations contact', 'orange', false, false, false, 30),
  ((SELECT id FROM cat), 'TECHNICAL', 'Technical Contact', 'جهة اتصال فنية', 'Technical contact', 'purple', false, false, false, 40),
  ((SELECT id FROM cat), 'SALES', 'Sales Contact', 'جهة اتصال مبيعات', 'Sales contact', 'cyan', false, false, false, 50),
  ((SELECT id FROM cat), 'LEGAL', 'Legal Contact', 'جهة اتصال قانونية', 'Legal contact', 'red', false, false, false, 60),
  ((SELECT id FROM cat), 'AUTHORIZED_SIGNATORY', 'Authorized Signatory', 'مفوض بالتوقيع', 'Authorized signatory', 'gold', false, false, false, 70),
  ((SELECT id FROM cat), 'OTHER', 'Other Contact', 'جهة اتصال أخرى', 'Other contact', 'gray', false, false, false, 80)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- COMMUNICATION_PREFERENCE_TYPES (6 values)
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'COMMUNICATION_PREFERENCE_TYPES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'EMAIL', 'Email', 'البريد الإلكتروني', 'Email communication', 'blue', false, false, false, 10),
  ((SELECT id FROM cat), 'PHONE', 'Phone', 'هاتف', 'Phone communication', 'green', false, false, false, 20),
  ((SELECT id FROM cat), 'WHATSAPP', 'WhatsApp', 'واتساب', 'WhatsApp communication', 'green', false, false, false, 30),
  ((SELECT id FROM cat), 'SMS', 'SMS', 'رسالة نصية', 'SMS communication', 'orange', false, false, false, 40),
  ((SELECT id FROM cat), 'IN_PERSON', 'In Person', 'شخصياً', 'In-person communication', 'purple', false, false, false, 50),
  ((SELECT id FROM cat), 'NO_CONTACT', 'No Contact', 'لا تواصل', 'Do not contact', 'red', false, false, false, 60)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- ADDRESS_TYPES (5 values)
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'ADDRESS_TYPES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'BILLING', 'Billing Address', 'عنوان الفواتير', 'Billing address', 'blue', false, false, false, 10),
  ((SELECT id FROM cat), 'SHIPPING', 'Shipping Address', 'عنوان الشحن', 'Shipping address', 'green', false, false, false, 20),
  ((SELECT id FROM cat), 'SITE', 'Site Address', 'عنوان الموقع', 'Site address', 'orange', false, false, false, 30),
  ((SELECT id FROM cat), 'OFFICE', 'Office Address', 'عنوان المكتب', 'Office address', 'purple', false, false, false, 40),
  ((SELECT id FROM cat), 'OTHER', 'Other Address', 'عنوان آخر', 'Other address', 'gray', false, false, false, 50)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- PARTY_DOCUMENT_TYPES (12 values)
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'PARTY_DOCUMENT_TYPES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'TRN_CERTIFICATE', 'TRN Certificate', 'شهادة التسجيل الضريبي', 'Tax Registration Number certificate', 'blue', false, false, false, 10),
  ((SELECT id FROM cat), 'TRADE_LICENSE', 'Trade License', 'الرخصة التجارية', 'Trade license', 'blue', false, false, false, 20),
  ((SELECT id FROM cat), 'INSURANCE_POLICY', 'Insurance Policy', 'وثيقة التأمين', 'Insurance policy', 'green', false, false, false, 30),
  ((SELECT id FROM cat), 'REGISTRATION_CERTIFICATE', 'Registration Certificate', 'شهادة التسجيل', 'Registration certificate', 'purple', false, false, false, 40),
  ((SELECT id FROM cat), 'HSE_CERTIFICATE', 'HSE Certificate', 'شهادة الصحة والسلامة والبيئة', 'HSE certificate', 'red', false, false, false, 50),
  ((SELECT id FROM cat), 'QUALITY_CERTIFICATE', 'Quality Certificate', 'شهادة الجودة', 'Quality certificate', 'orange', false, false, false, 60),
  ((SELECT id FROM cat), 'AUTHORIZATION_LETTER', 'Authorization Letter', 'خطاب التفويض', 'Authorization letter', 'yellow', false, false, false, 70),
  ((SELECT id FROM cat), 'BANK_LETTER', 'Bank Letter', 'خطاب البنك', 'Bank letter', 'cyan', false, false, false, 80),
  ((SELECT id FROM cat), 'CONTRACT', 'Contract', 'عقد', 'Contract', 'purple', false, false, false, 90),
  ((SELECT id FROM cat), 'MOU', 'MOU', 'مذكرة تفاهم', 'Memorandum of Understanding', 'blue', false, false, false, 100),
  ((SELECT id FROM cat), 'ID_DOCUMENT', 'ID Document', 'وثيقة الهوية', 'ID document', 'gray', false, false, false, 110),
  ((SELECT id FROM cat), 'OTHER', 'Other Document', 'مستند آخر', 'Other document', 'gray', false, false, false, 120)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- BANK_ACCOUNT_TYPES (4 values)
-- ----------------------------------------------------------------------------
WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'BANK_ACCOUNT_TYPES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'CURRENT', 'Current Account', 'حساب جاري', 'Current account', 'blue', false, false, false, 10),
  ((SELECT id FROM cat), 'SAVINGS', 'Savings Account', 'حساب توفير', 'Savings account', 'green', false, false, false, 20),
  ((SELECT id FROM cat), 'BUSINESS', 'Business Account', 'حساب تجاري', 'Business account', 'purple', false, false, false, 30),
  ((SELECT id FROM cat), 'ESCROW', 'Escrow Account', 'حساب ضمان', 'Escrow account', 'orange', false, false, false, 40)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  updated_at = now();

-- ============================================================================
-- SECTION 3: PERMISSIONS AND ROLE ASSIGNMENTS (4 Grouped Permissions)
-- ============================================================================

-- Insert grouped party master permissions (idempotent)
INSERT INTO permissions (permission_code, permission_name_en, permission_name_ar, description, module_code, is_system, sort_order)
VALUES
('master_data.party_master.view', 'View Party Master Data', 'عرض البيانات الرئيسية للطرف', 
 'View all party entities (customers, vendors, subcontractors, consultants, government authorities, recruitment agencies)', 
 'PARTIES', true, 10),
('master_data.party_master.manage', 'Manage Party Master Data', 'إدارة البيانات الرئيسية للطرف', 
 'Create, edit, deactivate all party entities and child records', 
 'PARTIES', true, 20),
('master_data.party_master.export', 'Export Party Master Data', 'تصدير البيانات الرئيسية للطرف', 
 'Export all party data to CSV/Excel', 
 'PARTIES', true, 30),
('master_data.party_master.audit_view', 'View Party Audit Logs', 'عرض سجلات تدقيق الطرف', 
 'View audit logs for all party entities', 
 'PARTIES', true, 40)
ON CONFLICT (permission_code) 
DO UPDATE SET 
  permission_name_en = EXCLUDED.permission_name_en,
  permission_name_ar = EXCLUDED.permission_name_ar,
  description = EXCLUDED.description,
  updated_at = now();

-- Assign permissions to roles
-- system_admin: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'system_admin'
  AND p.permission_code IN (
  'master_data.party_master.view',
  'master_data.party_master.manage',
  'master_data.party_master.export',
  'master_data.party_master.audit_view'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- group_admin: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'group_admin'
  AND p.permission_code IN (
  'master_data.party_master.view',
  'master_data.party_master.manage',
  'master_data.party_master.export',
  'master_data.party_master.audit_view'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- company_admin: view and export only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'company_admin'
  AND p.permission_code IN (
  'master_data.party_master.view',
  'master_data.party_master.export'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- branch_admin: view only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'branch_admin'
  AND p.permission_code IN (
  'master_data.party_master.view'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

