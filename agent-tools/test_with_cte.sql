-- ============================================================================
-- ERP BASE 002F.3E.2 — PEOPLE / CONTACTS / CRM FOUNDATION
-- DATABASE SCHEMA + LOOKUP CATEGORIES + SEED VALUES
-- ============================================================================
--
-- Phase: ERP BASE 002F.3E.2 — Database + Lookups + Seeds
-- Created: Sunday, June 7, 2026 3:00 PM (UTC+4)
-- Updated: Sunday, June 7, 2026 3:50 PM (UTC+4) — REV3 Corrections
-- Source: ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN_REV3.md
-- Purpose: Create 29 tables, seed 23 lookup categories + ~136 values, RLS policies, permissions
--
-- REVISION HISTORY:
--   Initial (3:00 PM): Generated with 22 lookup categories, ~130 values
--   REV1 (3:30 PM): Added ICV certificate fields (10 fields) and CICPA registration (1 field) to 5 tables
--                   Added ICV_STATUS_TYPES lookup category with 6 values
--                   Lookup categories: 22 → 23, Lookup values: ~130 → ~136
--   REV3 (3:50 PM): Removed unsafe FK references to global_lookup_values(value_code) — 75 occurrences
--                   Added column comments indicating lookup category source for all lookup-code fields
--                   Lookup validation moved to application layer via LookupSelect components
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
SELECT
  cat.id,
  'ACTIVE', 'Active', 'نشط', 'Active party', 'green', true, true, true, 10),
  'INACTIVE', 'Inactive', 'غير نشط', 'Inactive party', 'gray', true, false, false, 20),
  'BLACKLISTED', 'Blacklisted', 'القائمة السوداء', 'Blacklisted party', 'red', true, false, false, 30),
  'ON_HOLD', 'On Hold', 'معلق', 'Party on hold', 'yellow', true, false, false, 40),
  'UNDER_REVIEW', 'Under Review', 'قيد المراجعة', 'Party under review', 'orange', true, false, false, 50)
FROM cat
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
SELECT
  cat.id,
  'NORMAL_CUSTOMER', 'Normal Customer', 'عميل عادي', 'Normal customer', 'blue', true, false, true, 10),
  'GOVERNMENT_CUSTOMER', 'Government Customer', 'عميل حكومي', 'Government customer (e.g., municipalities, government entities)', 'purple', true, false, false, 20),
  'SEMI_GOVERNMENT_CUSTOMER', 'Semi-Government Customer', 'عميل شبه حكومي', 'Semi-government customer (e.g., Dubai Holding entities)', 'purple', true, false, false, 30),
  'UTILITY_COMPANY', 'Utility Company', 'شركة المرافق', 'Utility company (e.g., TAQA, EWEC, DEWA)', 'orange', true, false, false, 40),
  'WATER_POWER_PLANT', 'Water & Power Plant', 'محطة المياه والطاقة', 'Water desalination plant or power generation facility', 'cyan', true, false, false, 50),
  'INDUSTRIAL_CUSTOMER', 'Industrial Customer', 'عميل صناعي', 'Industrial customer (e.g., manufacturing facilities, factories)', 'brown', true, false, false, 60),
  'COMMERCIAL_CUSTOMER', 'Commercial Customer', 'عميل تجاري', 'Commercial customer (e.g., retail, hospitality, commercial real estate)', 'pink', true, false, false, 70),
  'MAIN_CONTRACTOR', 'Main Contractor', 'المقاول الرئيسي', 'Main contractor', 'purple', true, false, false, 80),
  'EPC_CONTRACTOR', 'EPC Contractor', 'مقاول EPC', 'EPC contractor', 'purple', true, false, false, 90),
  'SCRAP_BUYER', 'Scrap Buyer', 'مشتري الخردة', 'Scrap buyer', 'green', true, false, false, 100),
  'SCRAP_SUPPLIER', 'Scrap Supplier', 'مورد الخردة', 'Scrap supplier', 'orange', true, false, false, 110),
  'PARTNER_CUSTOMER', 'Partner Customer', 'عميل شريك', 'Partner customer', 'gold', true, false, false, 120)
FROM cat
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
SELECT
  cat.id,
  'ENTERPRISE', 'Enterprise', 'مؤسسة كبيرة', 'Enterprise customer', 'purple', false, false, false, 10),
  'SME', 'SME', 'شركة صغيرة ومتوسطة', 'Small and medium enterprise', 'blue', false, false, false, 20),
  'GOVERNMENT', 'Government', 'حكومي', 'Government sector', 'purple', false, false, false, 30),
  'INDUSTRIAL', 'Industrial', 'صناعي', 'Industrial sector', 'brown', false, false, false, 40),
  'COMMERCIAL', 'Commercial', 'تجاري', 'Commercial sector', 'pink', false, false, false, 50),
  'CONSTRUCTION', 'Construction', 'إنشاءات', 'Construction sector', 'orange', false, false, false, 60),
  'LOGISTICS', 'Logistics', 'لوجستيات', 'Logistics sector', 'cyan', false, false, false, 70),
  'RETAIL', 'Retail', 'تجزئة', 'Retail sector', 'green', false, false, false, 80),
  'HOSPITALITY', 'Hospitality', 'ضيافة', 'Hospitality sector', 'yellow', false, false, false, 90),
  'OTHER', 'Other', 'أخرى', 'Other segment', 'gray', false, false, false, 100)
FROM cat
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
SELECT
  cat.id,
  'SUPPLIER', 'Supplier', 'مورد', 'General supplier', 'blue', true, false, true, 10),
  'MATERIAL_SUPPLIER', 'Material Supplier', 'مورد المواد', 'Material supplier', 'green', true, false, false, 20),
  'EQUIPMENT_SUPPLIER', 'Equipment Supplier', 'مورد المعدات', 'Equipment supplier', 'orange', true, false, false, 30),
  'SERVICE_PROVIDER', 'Service Provider', 'مزود الخدمة', 'Service provider', 'purple', true, false, false, 40),
  'TRANSPORTER', 'Transporter', 'ناقل', 'Transport service vendor (general transport services)', 'cyan', true, false, false, 50),
  'TRANSPORT_SERVICE_PROVIDER', 'Transport Service Provider', 'مزود خدمة النقل', 'Specialized transport service provider', 'cyan', true, false, false, 60),
  'LOGISTICS_SERVICE_PROVIDER', 'Logistics Service Provider', 'مزود خدمة لوجستية', '3PL logistics service provider', 'cyan', true, false, false, 70),
  'PRIVATE_WASTE_DISPOSAL_FACILITY', 'Private Waste Disposal Facility', 'مرفق التخلص من النفايات الخاصة', 'Private waste treatment/disposal company', 'green', true, false, false, 80),
  'WASTE_DISPOSAL_SERVICE_PROVIDER', 'Waste Disposal Service Provider', 'مزود خدمة التخلص من النفايات', 'Waste management service vendor', 'green', true, false, false, 90),
  'INSURANCE_COMPANY', 'Insurance Company', 'شركة تأمين', 'Insurance company', 'yellow', true, false, false, 100),
  'PROPERTY_LESSOR', 'Property Lessor', 'مؤجر العقارات', 'Property lessor', 'brown', true, false, false, 110),
  'VEHICLE_LESSOR', 'Vehicle Lessor', 'مؤجر المركبات', 'Vehicle lessor', 'brown', true, false, false, 120),
  'EQUIPMENT_LESSOR', 'Equipment Lessor', 'مؤجر المعدات', 'Equipment lessor', 'brown', true, false, false, 130),
  'CAMP_ACCOMMODATION_LESSOR', 'Camp/Accommodation Lessor', 'مؤجر المخيمات/الإقامة', 'Camp/accommodation lessor', 'brown', true, false, false, 140),
  'UTILITY_PROVIDER', 'Utility Provider', 'مزود المرافق', 'Utility provider', 'gray', true, false, false, 150)
FROM cat
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
SELECT
  cat.id,
  'PREFERRED', 'Preferred Vendor', 'مورد مفضل', 'Preferred vendor', 'green', false, false, false, 10),
  'APPROVED', 'Approved Vendor', 'مورد معتمد', 'Approved vendor', 'blue', false, false, false, 20),
  'TRIAL', 'Trial Vendor', 'مورد تجريبي', 'Trial vendor', 'yellow', false, false, false, 30),
  'LOCAL', 'Local Vendor', 'مورد محلي', 'Local UAE vendor', 'cyan', false, false, false, 40),
  'INTERNATIONAL', 'International Vendor', 'مورد دولي', 'International vendor', 'purple', false, false, false, 50),
  'STRATEGIC', 'Strategic Vendor', 'مورد استراتيجي', 'Strategic vendor', 'gold', false, false, false, 60),
  'ONE_TIME', 'One-Time Vendor', 'مورد لمرة واحدة', 'One-time vendor', 'gray', false, false, false, 70),
  'BLOCKED', 'Blocked Vendor', 'مورد محظور', 'Blocked vendor', 'red', false, false, false, 80)
FROM cat
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
SELECT
  cat.id,
  'RAW_MATERIALS', 'Raw Materials', 'المواد الخام', 'Raw materials supplier', 'green', false, false, false, 10),
  'SPARE_PARTS', 'Spare Parts', 'قطع الغيار', 'Spare parts supplier', 'orange', false, false, false, 20),
  'CONSUMABLES', 'Consumables', 'المواد الاستهلاكية', 'Consumables supplier', 'blue', false, false, false, 30),
  'MACHINERY', 'Machinery', 'الآلات', 'Machinery supplier', 'purple', false, false, false, 40),
  'CHEMICALS', 'Chemicals', 'المواد الكيميائية', 'Chemicals supplier', 'yellow', false, false, false, 50),
  'PACKAGING', 'Packaging', 'التغليف', 'Packaging supplier', 'pink', false, false, false, 60)
FROM cat
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
SELECT
  cat.id,
  'CIVIL_SUBCONTRACTOR', 'Civil Subcontractor', 'مقاول مدني من الباطن', 'Civil subcontractor', 'blue', true, false, true, 10),
  'MANPOWER_SUBCONTRACTOR', 'Manpower Subcontractor', 'مقاول عمالة من الباطن', 'Manpower subcontractor', 'green', true, false, false, 20),
  'TRANSPORTER', 'Transporter', 'ناقل', 'Transporter subcontractor (project execution)', 'orange', true, false, false, 30),
  'TRANSPORT_SUBCONTRACTOR', 'Transport Subcontractor', 'مقاول نقل من الباطن', 'Transport subcontractor (subcontracted for project execution)', 'orange', true, false, false, 40),
  'DEMOLITION_SUBCONTRACTOR', 'Demolition Subcontractor', 'مقاول هدم من الباطن', 'Demolition subcontractor', 'red', true, false, false, 50),
  'EQUIPMENT_SUBCONTRACTOR', 'Equipment Subcontractor', 'مقاول معدات من الباطن', 'Equipment subcontractor', 'purple', true, false, false, 60),
  'SPECIALIZED_SUBCONTRACTOR', 'Specialized Subcontractor', 'مقاول متخصص من الباطن', 'Specialized subcontractor (painting, electrical, HVAC, etc.)', 'cyan', true, false, false, 70),
  'PARTNER_SUBCONTRACTOR', 'Partner Subcontractor', 'مقاول شريك من الباطن', 'Partner subcontractor', 'gold', true, false, false, 80)
FROM cat
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
SELECT
  cat.id,
  'PREFERRED', 'Preferred Subcontractor', 'مقاول من الباطن مفضل', 'Preferred subcontractor', 'green', false, false, false, 10),
  'APPROVED', 'Approved Subcontractor', 'مقاول من الباطن معتمد', 'Approved subcontractor', 'blue', false, false, false, 20),
  'TRIAL', 'Trial Subcontractor', 'مقاول من الباطن تجريبي', 'Trial subcontractor', 'yellow', false, false, false, 30),
  'LOCAL', 'Local Subcontractor', 'مقاول من الباطن محلي', 'Local UAE subcontractor', 'cyan', false, false, false, 40),
  'INTERNATIONAL', 'International Subcontractor', 'مقاول من الباطن دولي', 'International subcontractor', 'purple', false, false, false, 50),
  'BLOCKED', 'Blocked Subcontractor', 'مقاول من الباطن محظور', 'Blocked subcontractor', 'red', false, false, false, 60)
FROM cat
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
SELECT
  cat.id,
  'ENGINEERING_CONSULTANT', 'Engineering Consultant', 'استشاري هندسي', 'Engineering consultant', 'blue', true, false, true, 10),
  'HSE_CONSULTANT', 'HSE Consultant', 'استشاري الصحة والسلامة والبيئة', 'HSE consultant', 'red', true, false, false, 20),
  'LEGAL_CONSULTANT', 'Legal Consultant', 'استشاري قانوني', 'Legal consultant', 'purple', true, false, false, 30),
  'TECHNICAL_CONSULTANT', 'Technical Consultant', 'استشاري فني', 'Technical consultant', 'green', true, false, false, 40),
  'ENVIRONMENTAL_CONSULTANT', 'Environmental Consultant', 'استشاري بيئي', 'Environmental consultant', 'green', true, false, false, 50),
  'AUDIT_CONSULTANT', 'Audit Consultant', 'استشاري تدقيق', 'Audit consultant (financial, operational, compliance)', 'orange', true, false, false, 60)
FROM cat
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
SELECT
  cat.id,
  'RETAINER', 'Retainer Consultant', 'استشاري محتفظ به', 'Retainer consultant', 'green', false, false, false, 10),
  'PROJECT_BASED', 'Project-Based Consultant', 'استشاري على أساس المشروع', 'Project-based consultant', 'blue', false, false, false, 20),
  'ADHOC', 'Ad-Hoc Consultant', 'استشاري مخصص', 'Ad-hoc consultant', 'yellow', false, false, false, 30),
  'STRATEGIC', 'Strategic Consultant', 'استشاري استراتيجي', 'Strategic consultant', 'purple', false, false, false, 40)
FROM cat
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
SELECT
  cat.id,
  'LICENSE_ISSUER', 'License Issuer', 'مصدر الرخصة', 'License issuer (e.g., Dubai Economic Department)', 'blue', true, false, false, 10),
  'PERMIT_ISSUER', 'Permit Issuer', 'مصدر التصريح', 'Permit issuer (e.g., CICPA, environmental permits)', 'blue', true, false, false, 20),
  'REGULATOR', 'Regulator', 'المنظم', 'Regulator', 'gray', true, false, true, 30),
  'MUNICIPALITY', 'Municipality', 'البلدية', 'Municipality', 'blue', true, false, false, 40),
  'POLICE', 'Police', 'الشرطة', 'Police', 'red', true, false, false, 50),
  'CIVIL_DEFENSE', 'Civil Defense', 'الدفاع المدني', 'Civil defense', 'red', true, false, false, 60),
  'ENVIRONMENTAL_AUTHORITY', 'Environmental Authority', 'الهيئة البيئية', 'Environmental authority', 'green', true, false, false, 70),
  'FREE_ZONE_AUTHORITY', 'Free Zone Authority', 'هيئة المنطقة الحرة', 'Free zone authority', 'purple', true, false, false, 80),
  'PORT_AUTHORITY', 'Port Authority', 'سلطة الميناء', 'Port authority', 'cyan', true, false, false, 90),
  'CUSTOMS_AUTHORITY', 'Customs Authority', 'سلطة الجمارك', 'Customs authority', 'cyan', true, false, false, 100),
  'PORT_CUSTOMS_AUTHORITY', 'Port & Customs Authority', 'سلطة الميناء والجمارك', 'Combined port and customs authority', 'cyan', true, false, false, 110),
  'UTILITY_AUTHORITY', 'Utility Authority', 'سلطة المرافق', 'Utility authority', 'orange', true, false, false, 120),
  'TRANSPORT_AUTHORITY', 'Transport Authority', 'سلطة النقل', 'Transport authority (e.g., Dubai RTA, Abu Dhabi DOT)', 'orange', true, false, false, 130),
  'WASTE_DISPOSAL_FACILITY', 'Waste Disposal Facility', 'مرفق التخلص من النفايات', 'Government waste disposal facility', 'green', true, false, false, 140),
  'GOVERNMENT_WASTE_DISPOSAL_AUTHORITY', 'Govt Waste Disposal Authority', 'سلطة التخلص من النفايات الحكومية', 'Government waste disposal authority', 'green', true, false, false, 150),
  'MINISTRY', 'Ministry', 'الوزارة', 'Ministry', 'purple', true, false, false, 160)
FROM cat
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
SELECT
  cat.id,
  'FEDERAL', 'Federal Authority', 'جهة اتحادية', 'Federal authority', 'purple', false, false, false, 10),
  'EMIRATE', 'Emirate Authority', 'جهة إمارة', 'Emirate authority', 'blue', false, false, false, 20),
  'LOCAL', 'Local Authority', 'جهة محلية', 'Local authority', 'cyan', false, false, false, 30),
  'FREE_ZONE', 'Free Zone Authority', 'جهة منطقة حرة', 'Free zone authority', 'purple', false, false, false, 40)
FROM cat
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
SELECT
  cat.id,
  'FEDERAL', 'Federal', 'اتحادي', 'Federal jurisdiction', 'purple', true, false, false, 10),
  'EMIRATE', 'Emirate', 'إمارة', 'Emirate jurisdiction', 'blue', true, false, false, 20),
  'MUNICIPALITY', 'Municipality', 'بلدية', 'Municipality jurisdiction', 'cyan', true, false, false, 30),
  'FREE_ZONE', 'Free Zone', 'منطقة حرة', 'Free zone jurisdiction', 'purple', true, false, false, 40)
FROM cat
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
SELECT
  cat.id,
  'LOCAL_RECRUITMENT_AGENCY', 'Local Recruitment Agency', 'وكالة توظيف محلية', 'Local UAE recruitment agency', 'blue', true, false, false, 10),
  'OVERSEAS_RECRUITMENT_AGENCY', 'Overseas Recruitment Agency', 'وكالة توظيف خارجية', 'Overseas recruitment agency', 'purple', true, false, false, 20),
  'MANPOWER_SUPPLY_AGENCY', 'Manpower Supply Agency', 'وكالة توريد القوى العاملة', 'Manpower supply agency', 'green', true, false, false, 30),
  'EXECUTIVE_SEARCH_AGENCY', 'Executive Search Agency', 'وكالة البحث التنفيذي', 'Executive search agency', 'gold', true, false, false, 40)
FROM cat
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
SELECT
  cat.id,
  'VALID', 'Valid', 'صالح', 'ICV certificate is valid', 'green', true, false, false, 10),
  'EXPIRED', 'Expired', 'منتهي الصلاحية', 'ICV certificate has expired', 'red', true, false, false, 20),
  'UNDER_RENEWAL', 'Under Renewal', 'قيد التجديد', 'ICV certificate is under renewal', 'orange', true, false, false, 30),
  'NOT_AVAILABLE', 'Not Available', 'غير متوفر', 'ICV certificate is not available', 'gray', true, false, true, 40),
  'NOT_REQUIRED', 'Not Required', 'غير مطلوب', 'ICV certificate is not required', 'blue', true, false, false, 50),
  'PENDING_SUBMISSION', 'Pending Submission', 'بانتظار التقديم', 'ICV certificate/details are pending submission', 'yellow', true, false, false, 60)
FROM cat
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
SELECT
  cat.id,
  'PREFERRED', 'Preferred Agency', 'وكالة مفضلة', 'Preferred recruitment agency', 'green', false, false, false, 10),
  'APPROVED', 'Approved Agency', 'وكالة معتمدة', 'Approved recruitment agency', 'blue', false, false, false, 20),
  'TRIAL', 'Trial Agency', 'وكالة تجريبية', 'Trial recruitment agency', 'yellow', false, false, false, 30),
  'BLOCKED', 'Blocked Agency', 'وكالة محظورة', 'Blocked recruitment agency', 'red', false, false, false, 40)
FROM cat
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
SELECT
  cat.id,
  'CONSTRUCTION', 'Construction', 'إنشاءات', 'Construction industry', 'orange', false, false, false, 10),
  'MANUFACTURING', 'Manufacturing', 'تصنيع', 'Manufacturing industry', 'brown', false, false, false, 20),
  'LOGISTICS', 'Logistics', 'لوجستيات', 'Logistics industry', 'cyan', false, false, false, 30),
  'RETAIL', 'Retail', 'تجزئة', 'Retail industry', 'green', false, false, false, 40),
  'HOSPITALITY', 'Hospitality', 'ضيافة', 'Hospitality industry', 'yellow', false, false, false, 50),
  'GOVERNMENT', 'Government', 'حكومي', 'Government sector', 'purple', false, false, false, 60),
  'UTILITIES', 'Utilities', 'المرافق', 'Utilities industry', 'orange', false, false, false, 70),
  'ENERGY', 'Energy', 'طاقة', 'Energy industry', 'red', false, false, false, 80),
  'HEALTHCARE', 'Healthcare', 'رعاية صحية', 'Healthcare industry', 'pink', false, false, false, 90),
  'REAL_ESTATE', 'Real Estate', 'عقارات', 'Real estate industry', 'brown', false, false, false, 100),
  'TECHNOLOGY', 'Technology', 'تقنية', 'Technology industry', 'blue', false, false, false, 110),
  'OTHER', 'Other', 'أخرى', 'Other industry', 'gray', false, false, false, 120)
FROM cat
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
SELECT
  cat.id,
  'WEBSITE', 'Website', 'موقع إلكتروني', 'Website inquiry', 'blue', false, false, false, 10),
  'REFERRAL', 'Referral', 'إحالة', 'Customer referral', 'green', false, false, false, 20),
  'DIRECT_SALES', 'Direct Sales', 'مبيعات مباشرة', 'Direct sales team', 'purple', false, false, false, 30),
  'SOCIAL_MEDIA', 'Social Media', 'وسائل التواصل الاجتماعي', 'Social media', 'cyan', false, false, false, 40),
  'EMAIL_CAMPAIGN', 'Email Campaign', 'حملة البريد الإلكتروني', 'Email marketing campaign', 'orange', false, false, false, 50),
  'TRADE_SHOW', 'Trade Show', 'معرض تجاري', 'Trade show/exhibition', 'yellow', false, false, false, 60),
  'COLD_CALL', 'Cold Call', 'مكالمة باردة', 'Cold call', 'gray', false, false, false, 70),
  'EXISTING_CUSTOMER', 'Existing Customer', 'عميل حالي', 'Existing customer', 'green', false, false, false, 80),
  'PARTNER', 'Partner', 'شريك', 'Partner referral', 'gold', false, false, false, 90),
  'OTHER', 'Other', 'أخرى', 'Other source', 'gray', false, false, false, 100)
FROM cat
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
SELECT
  cat.id,
  'PRIMARY', 'Primary Contact', 'جهة اتصال رئيسية', 'Primary contact', 'blue', false, false, false, 10),
  'FINANCE', 'Finance Contact', 'جهة اتصال مالية', 'Finance contact', 'green', false, false, false, 20),
  'OPERATIONS', 'Operations Contact', 'جهة اتصال تشغيلية', 'Operations contact', 'orange', false, false, false, 30),
  'TECHNICAL', 'Technical Contact', 'جهة اتصال فنية', 'Technical contact', 'purple', false, false, false, 40),
  'SALES', 'Sales Contact', 'جهة اتصال مبيعات', 'Sales contact', 'cyan', false, false, false, 50),
  'LEGAL', 'Legal Contact', 'جهة اتصال قانونية', 'Legal contact', 'red', false, false, false, 60),
  'AUTHORIZED_SIGNATORY', 'Authorized Signatory', 'مفوض بالتوقيع', 'Authorized signatory', 'gold', false, false, false, 70),
  'OTHER', 'Other Contact', 'جهة اتصال أخرى', 'Other contact', 'gray', false, false, false, 80)
FROM cat
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
SELECT
  cat.id,
  'EMAIL', 'Email', 'البريد الإلكتروني', 'Email communication', 'blue', false, false, false, 10),
  'PHONE', 'Phone', 'هاتف', 'Phone communication', 'green', false, false, false, 20),
  'WHATSAPP', 'WhatsApp', 'واتساب', 'WhatsApp communication', 'green', false, false, false, 30),
  'SMS', 'SMS', 'رسالة نصية', 'SMS communication', 'orange', false, false, false, 40),
  'IN_PERSON', 'In Person', 'شخصياً', 'In-person communication', 'purple', false, false, false, 50),
  'NO_CONTACT', 'No Contact', 'لا تواصل', 'Do not contact', 'red', false, false, false, 60)
FROM cat
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
SELECT
  cat.id,
  'BILLING', 'Billing Address', 'عنوان الفواتير', 'Billing address', 'blue', false, false, false, 10),
  'SHIPPING', 'Shipping Address', 'عنوان الشحن', 'Shipping address', 'green', false, false, false, 20),
  'SITE', 'Site Address', 'عنوان الموقع', 'Site address', 'orange', false, false, false, 30),
  'OFFICE', 'Office Address', 'عنوان المكتب', 'Office address', 'purple', false, false, false, 40),
  'OTHER', 'Other Address', 'عنوان آخر', 'Other address', 'gray', false, false, false, 50)
FROM cat
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
SELECT
  cat.id,
  'TRN_CERTIFICATE', 'TRN Certificate', 'شهادة التسجيل الضريبي', 'Tax Registration Number certificate', 'blue', false, false, false, 10),
  'TRADE_LICENSE', 'Trade License', 'الرخصة التجارية', 'Trade license', 'blue', false, false, false, 20),
  'INSURANCE_POLICY', 'Insurance Policy', 'وثيقة التأمين', 'Insurance policy', 'green', false, false, false, 30),
  'REGISTRATION_CERTIFICATE', 'Registration Certificate', 'شهادة التسجيل', 'Registration certificate', 'purple', false, false, false, 40),
  'HSE_CERTIFICATE', 'HSE Certificate', 'شهادة الصحة والسلامة والبيئة', 'HSE certificate', 'red', false, false, false, 50),
  'QUALITY_CERTIFICATE', 'Quality Certificate', 'شهادة الجودة', 'Quality certificate', 'orange', false, false, false, 60),
  'AUTHORIZATION_LETTER', 'Authorization Letter', 'خطاب التفويض', 'Authorization letter', 'yellow', false, false, false, 70),
  'BANK_LETTER', 'Bank Letter', 'خطاب البنك', 'Bank letter', 'cyan', false, false, false, 80),
  'CONTRACT', 'Contract', 'عقد', 'Contract', 'purple', false, false, false, 90),
  'MOU', 'MOU', 'مذكرة تفاهم', 'Memorandum of Understanding', 'blue', false, false, false, 100),
  'ID_DOCUMENT', 'ID Document', 'وثيقة الهوية', 'ID document', 'gray', false, false, false, 110),
  'OTHER', 'Other Document', 'مستند آخر', 'Other document', 'gray', false, false, false, 120)
FROM cat
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
SELECT
  cat.id,
  'CURRENT', 'Current Account', 'حساب جاري', 'Current account', 'blue', false, false, false, 10),
  'SAVINGS', 'Savings Account', 'حساب توفير', 'Savings account', 'green', false, false, false, 20),
  'BUSINESS', 'Business Account', 'حساب تجاري', 'Business account', 'purple', false, false, false, 30),
  'ESCROW', 'Escrow Account', 'حساب ضمان', 'Escrow account', 'orange', false, false, false, 40)
FROM cat
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
INSERT INTO role_permissions (role_code, permission_code)
SELECT 'system_admin', permission_code
FROM permissions
WHERE permission_code IN (
  'master_data.party_master.view',
  'master_data.party_master.manage',
  'master_data.party_master.export',
  'master_data.party_master.audit_view'
)
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- group_admin: all permissions
INSERT INTO role_permissions (role_code, permission_code)
SELECT 'group_admin', permission_code
FROM permissions
WHERE permission_code IN (
  'master_data.party_master.view',
  'master_data.party_master.manage',
  'master_data.party_master.export',
  'master_data.party_master.audit_view'
)
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- company_admin: view and export only
INSERT INTO role_permissions (role_code, permission_code)
SELECT 'company_admin', permission_code
FROM permissions
WHERE permission_code IN (
  'master_data.party_master.view',
  'master_data.party_master.export'
)
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- branch_admin: view only
INSERT INTO role_permissions (role_code, permission_code)
SELECT 'branch_admin', permission_code
FROM permissions
WHERE permission_code IN (
  'master_data.party_master.view'
)
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- ============================================================================
-- SECTION 4: MAIN ENTITY TABLES (6 Tables)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 4.1 CUSTOMERS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id bigint generated by default as identity primary key,
  
  -- Code and names
  customer_code text unique not null,
  customer_name_en text not null,
  customer_name_ar text,
  
  -- Classification
  customer_type_code text not null,
  industry_type_code text,
  customer_segment_code text,
  lead_source_code text,
  
  -- Registration and legal
  trn text check (trn is null or char_length(trn) = 15),
  trade_license_number text,
  license_expiry_date date,
  
  -- Contact information
  website_url text,
  primary_email text check (primary_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  primary_phone text,
  primary_mobile text,
  
  -- Geography
  country_id bigint references countries(id),
  emirate_id bigint references emirates(id),
  city_id bigint references cities(id),
  area_zone_id bigint references areas_zones(id),
  address_line_1 text,
  address_line_2 text,
  po_box text,
  makani_number text,
  
  -- Commercial terms
  currency_id bigint references currencies(id),
  payment_term_id bigint references payment_terms(id),
  tax_type_id bigint references tax_types(id),
  credit_limit decimal(15, 2) check (credit_limit >= 0),
  credit_days integer check (credit_days >= 0),
  
  -- Sales management
  sales_owner_user_profile_id bigint references user_profiles(id),
  
  -- ICV (In-Country Value) certificate information
  icv_certificate_number text,
  icv_score_percentage numeric(5, 2) check (icv_score_percentage is null or (icv_score_percentage >= 0 and icv_score_percentage <= 100)),
  icv_issue_date date,
  icv_expiry_date date check (icv_issue_date is null or icv_expiry_date is null or icv_expiry_date >= icv_issue_date),
  icv_company_type text,
  icv_financial_year_end_date date,
  icv_certification_body text,
  icv_version text,
  icv_status_code text,
  icv_document_path text,
  
  -- CICPA (Critical Infrastructure and Coastal Protection Authority) company registration
  cicpa_registration_number text,
  
  -- Notes
  notes text,
  
  -- Status
  status_code text not null default 'ACTIVE',
  
  -- Audit fields
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  
  -- System fields
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0
);

COMMENT ON TABLE customers IS 'Customer master data for CRM, sales, and commercial transactions';
COMMENT ON COLUMN customers.customer_type_code IS 'Lookup value code from CUSTOMER_TYPES. Customer type (REV1: includes GOVERNMENT_CUSTOMER, UTILITY_COMPANY, WATER_POWER_PLANT, INDUSTRIAL_CUSTOMER, COMMERCIAL_CUSTOMER)';
COMMENT ON COLUMN customers.industry_type_code IS 'Lookup value code from INDUSTRY_TYPES.';
COMMENT ON COLUMN customers.customer_segment_code IS 'Lookup value code from CUSTOMER_SEGMENTS.';
COMMENT ON COLUMN customers.lead_source_code IS 'Lookup value code from CRM_LEAD_SOURCES.';
COMMENT ON COLUMN customers.status_code IS 'Lookup value code from PARTY_STATUS_TYPES.';
COMMENT ON COLUMN customers.icv_certificate_number IS 'ICV certificate number for the customer/company, if applicable. Metadata tracking only, not score calculation.';
COMMENT ON COLUMN customers.icv_score_percentage IS 'ICV score percentage (0-100). From ICV certificate.';
COMMENT ON COLUMN customers.icv_status_code IS 'Lookup value code from ICV_STATUS_TYPES. ICV certificate status (VALID, EXPIRED, UNDER_RENEWAL, NOT_AVAILABLE, NOT_REQUIRED, PENDING_SUBMISSION)';
COMMENT ON COLUMN customers.icv_document_path IS 'Temporary nullable reference to ICV certificate document. DMS not yet implemented.';
COMMENT ON COLUMN customers.cicpa_registration_number IS 'Company CICPA registration number, if applicable. Company-level registration only, not individual employee access cards.';

-- ----------------------------------------------------------------------------
-- 4.2 VENDORS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendors (
  id bigint generated by default as identity primary key,
  
  -- Code and names
  vendor_code text unique not null,
  vendor_name_en text not null,
  vendor_name_ar text,
  
  -- Classification
  vendor_type_code text not null,
  vendor_category_code text,
  supplier_category_code text,
  
  -- Registration and legal
  trn text check (trn is null or char_length(trn) = 15),
  trade_license_number text,
  license_expiry_date date,
  
  -- Contact information
  website_url text,
  primary_email text check (primary_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  primary_phone text,
  primary_mobile text,
  
  -- Geography
  country_id bigint references countries(id),
  emirate_id bigint references emirates(id),
  city_id bigint references cities(id),
  area_zone_id bigint references areas_zones(id),
  address_line_1 text,
  address_line_2 text,
  po_box text,
  makani_number text,
  
  -- Commercial terms
  currency_id bigint references currencies(id),
  payment_term_id bigint references payment_terms(id),
  tax_type_id bigint references tax_types(id),
  default_bank_id bigint references banks(id),
  
  -- ICV (In-Country Value) certificate information
  icv_certificate_number text,
  icv_score_percentage numeric(5, 2) check (icv_score_percentage is null or (icv_score_percentage >= 0 and icv_score_percentage <= 100)),
  icv_issue_date date,
  icv_expiry_date date check (icv_issue_date is null or icv_expiry_date is null or icv_expiry_date >= icv_issue_date),
  icv_company_type text,
  icv_financial_year_end_date date,
  icv_certification_body text,
  icv_version text,
  icv_status_code text,
  icv_document_path text,
  
  -- CICPA (Critical Infrastructure and Coastal Protection Authority) company registration
  cicpa_registration_number text,
  
  -- Notes
  notes text,
  
  -- Status
  status_code text not null default 'ACTIVE',
  
  -- Audit fields
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  
  -- System fields
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0
);

COMMENT ON TABLE vendors IS 'Vendor master data for procurement and supplier management';
COMMENT ON COLUMN vendors.vendor_type_code IS 'Lookup value code from VENDOR_TYPES. Vendor type (REV1: includes TRANSPORTER, LOGISTICS_SERVICE_PROVIDER, PRIVATE_WASTE_DISPOSAL_FACILITY)';
COMMENT ON COLUMN vendors.vendor_category_code IS 'Lookup value code from VENDOR_CATEGORIES.';
COMMENT ON COLUMN vendors.supplier_category_code IS 'Lookup value code from SUPPLIER_CATEGORIES.';
COMMENT ON COLUMN vendors.status_code IS 'Lookup value code from PARTY_STATUS_TYPES.';
COMMENT ON COLUMN vendors.icv_certificate_number IS 'ICV certificate number for the vendor/company, if applicable. Metadata tracking only, not score calculation.';
COMMENT ON COLUMN vendors.icv_score_percentage IS 'ICV score percentage (0-100). From ICV certificate.';
COMMENT ON COLUMN vendors.icv_status_code IS 'Lookup value code from ICV_STATUS_TYPES. ICV certificate status (VALID, EXPIRED, UNDER_RENEWAL, NOT_AVAILABLE, NOT_REQUIRED, PENDING_SUBMISSION)';
COMMENT ON COLUMN vendors.icv_document_path IS 'Temporary nullable reference to ICV certificate document. DMS not yet implemented.';
COMMENT ON COLUMN vendors.cicpa_registration_number IS 'Company CICPA registration number, if applicable. Company-level registration only, not individual employee access cards.';

-- ----------------------------------------------------------------------------
-- 4.3 SUBCONTRACTORS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subcontractors (
  id bigint generated by default as identity primary key,
  
  -- Code and names
  subcontractor_code text unique not null,
  subcontractor_name_en text not null,
  subcontractor_name_ar text,
  
  -- Classification
  subcontractor_type_code text not null,
  subcontractor_category_code text,
  
  -- Registration and legal
  trn text check (trn is null or char_length(trn) = 15),
  trade_license_number text,
  license_expiry_date date,
  
  -- Contact information
  website_url text,
  primary_email text check (primary_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  primary_phone text,
  primary_mobile text,
  
  -- Geography
  country_id bigint references countries(id),
  emirate_id bigint references emirates(id),
  city_id bigint references cities(id),
  area_zone_id bigint references areas_zones(id),
  address_line_1 text,
  address_line_2 text,
  po_box text,
  makani_number text,
  
  -- Commercial terms
  currency_id bigint references currencies(id),
  payment_term_id bigint references payment_terms(id),
  tax_type_id bigint references tax_types(id),
  
  -- HSE and capabilities
  hse_prequalification_status_code text,
  worker_supply_allowed boolean not null default false,
  equipment_supply_allowed boolean not null default false,
  
  -- ICV (In-Country Value) certificate information
  icv_certificate_number text,
  icv_score_percentage numeric(5, 2) check (icv_score_percentage is null or (icv_score_percentage >= 0 and icv_score_percentage <= 100)),
  icv_issue_date date,
  icv_expiry_date date check (icv_issue_date is null or icv_expiry_date is null or icv_expiry_date >= icv_issue_date),
  icv_company_type text,
  icv_financial_year_end_date date,
  icv_certification_body text,
  icv_version text,
  icv_status_code text,
  icv_document_path text,
  
  -- CICPA (Critical Infrastructure and Coastal Protection Authority) company registration
  cicpa_registration_number text,
  
  -- Notes
  notes text,
  
  -- Status
  status_code text not null default 'ACTIVE',
  
  -- Audit fields
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  
  -- System fields
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0
);

COMMENT ON TABLE subcontractors IS 'Subcontractor master data for subcontracting management';
COMMENT ON COLUMN subcontractors.subcontractor_type_code IS 'Lookup value code from SUBCONTRACTOR_TYPES. Subcontractor type (REV1: includes TRANSPORT_SUBCONTRACTOR, SPECIALIZED_SUBCONTRACTOR)';
COMMENT ON COLUMN subcontractors.subcontractor_category_code IS 'Lookup value code from SUBCONTRACTOR_CATEGORIES.';
COMMENT ON COLUMN subcontractors.hse_prequalification_status_code IS 'Lookup value code from HSE_PREQUALIFICATION_STATUS_TYPES.';
COMMENT ON COLUMN subcontractors.status_code IS 'Lookup value code from PARTY_STATUS_TYPES.';
COMMENT ON COLUMN subcontractors.icv_certificate_number IS 'ICV certificate number for the subcontractor/company, if applicable. Metadata tracking only, not score calculation.';
COMMENT ON COLUMN subcontractors.icv_score_percentage IS 'ICV score percentage (0-100). From ICV certificate.';
COMMENT ON COLUMN subcontractors.icv_status_code IS 'Lookup value code from ICV_STATUS_TYPES. ICV certificate status (VALID, EXPIRED, UNDER_RENEWAL, NOT_AVAILABLE, NOT_REQUIRED, PENDING_SUBMISSION)';
COMMENT ON COLUMN subcontractors.icv_document_path IS 'Temporary nullable reference to ICV certificate document. DMS not yet implemented.';
COMMENT ON COLUMN subcontractors.cicpa_registration_number IS 'Company CICPA registration number, if applicable. Company-level registration only, not individual employee access cards.';

-- ----------------------------------------------------------------------------
-- 4.4 CONSULTANTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consultants (
  id bigint generated by default as identity primary key,
  
  -- Code and names
  consultant_code text unique not null,
  consultant_name_en text not null,
  consultant_name_ar text,
  
  -- Classification
  consultant_type_code text not null,
  consultant_category_code text,
  
  -- Registration and legal
  trn text check (trn is null or char_length(trn) = 15),
  trade_license_number text,
  license_expiry_date date,
  
  -- Contact information
  website_url text,
  primary_email text check (primary_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  primary_phone text,
  primary_mobile text,
  
  -- Geography
  country_id bigint references countries(id),
  emirate_id bigint references emirates(id),
  city_id bigint references cities(id),
  area_zone_id bigint references areas_zones(id),
  address_line_1 text,
  address_line_2 text,
  po_box text,
  makani_number text,
  
  -- Commercial terms
  currency_id bigint references currencies(id),
  payment_term_id bigint references payment_terms(id),
  tax_type_id bigint references tax_types(id),
  
  -- ICV (In-Country Value) certificate information
  icv_certificate_number text,
  icv_score_percentage numeric(5, 2) check (icv_score_percentage is null or (icv_score_percentage >= 0 and icv_score_percentage <= 100)),
  icv_issue_date date,
  icv_expiry_date date check (icv_issue_date is null or icv_expiry_date is null or icv_expiry_date >= icv_issue_date),
  icv_company_type text,
  icv_financial_year_end_date date,
  icv_certification_body text,
  icv_version text,
  icv_status_code text,
  icv_document_path text,
  
  -- CICPA (Critical Infrastructure and Coastal Protection Authority) company registration
  cicpa_registration_number text,
  
  -- Notes
  notes text,
  
  -- Status
  status_code text not null default 'ACTIVE',
  
  -- Audit fields
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  
  -- System fields
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0
);

COMMENT ON TABLE consultants IS 'Consultant master data for professional services';
COMMENT ON COLUMN consultants.consultant_type_code IS 'Lookup value code from CONSULTANT_TYPES. Consultant type (REV1: includes AUDIT_CONSULTANT)';
COMMENT ON COLUMN consultants.consultant_category_code IS 'Lookup value code from CONSULTANT_CATEGORIES.';
COMMENT ON COLUMN consultants.status_code IS 'Lookup value code from PARTY_STATUS_TYPES.';
COMMENT ON COLUMN consultants.icv_certificate_number IS 'ICV certificate number for the consultant/company, if applicable. Metadata tracking only, not score calculation.';
COMMENT ON COLUMN consultants.icv_score_percentage IS 'ICV score percentage (0-100). From ICV certificate.';
COMMENT ON COLUMN consultants.icv_status_code IS 'Lookup value code from ICV_STATUS_TYPES. ICV certificate status (VALID, EXPIRED, UNDER_RENEWAL, NOT_AVAILABLE, NOT_REQUIRED, PENDING_SUBMISSION)';
COMMENT ON COLUMN consultants.icv_document_path IS 'Temporary nullable reference to ICV certificate document. DMS not yet implemented.';
COMMENT ON COLUMN consultants.cicpa_registration_number IS 'Company CICPA registration number, if applicable. Company-level registration only, not individual employee access cards.';

-- ----------------------------------------------------------------------------
-- 4.5 GOVERNMENT_AUTHORITIES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS government_authorities (
  id bigint generated by default as identity primary key,
  
  -- Code and names
  authority_code text unique not null,
  authority_name_en text not null,
  authority_name_ar text,
  
  -- Classification
  authority_type_code text not null,
  authority_category_code text,
  jurisdiction_level_code text,
  
  -- Contact information
  website_url text,
  primary_email text check (primary_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  primary_phone text,
  primary_mobile text,
  
  -- Geography
  country_id bigint references countries(id),
  emirate_id bigint references emirates(id),
  city_id bigint references cities(id),
  area_zone_id bigint references areas_zones(id),
  address_line_1 text,
  address_line_2 text,
  po_box text,
  
  -- Notes
  notes text,
  
  -- Status
  status_code text not null default 'ACTIVE',
  
  -- Audit fields
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  
  -- System fields
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0
);

COMMENT ON TABLE government_authorities IS 'Government authority master data for compliance and regulatory management';
COMMENT ON COLUMN government_authorities.authority_type_code IS 'Lookup value code from GOVERNMENT_AUTHORITY_TYPES. Authority type (REV1: includes LICENSE_ISSUER, PERMIT_ISSUER, UTILITY_AUTHORITY, TRANSPORT_AUTHORITY)';
COMMENT ON COLUMN government_authorities.authority_category_code IS 'Lookup value code from GOVERNMENT_AUTHORITY_CATEGORIES.';
COMMENT ON COLUMN government_authorities.jurisdiction_level_code IS 'Lookup value code from JURISDICTION_LEVEL_TYPES.';
COMMENT ON COLUMN government_authorities.status_code IS 'Lookup value code from PARTY_STATUS_TYPES.';

-- ----------------------------------------------------------------------------
-- 4.6 RECRUITMENT_AGENCIES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recruitment_agencies (
  id bigint generated by default as identity primary key,
  
  -- Code and names
  agency_code text unique not null,
  agency_name_en text not null,
  agency_name_ar text,
  
  -- Classification
  agency_type_code text not null,
  agency_category_code text,
  
  -- Geography
  country_id bigint references countries(id),
  emirate_id bigint references emirates(id),
  city_id bigint references cities(id),
  area_zone_id bigint references areas_zones(id),
  address_line_1 text,
  address_line_2 text,
  po_box text,
  
  -- Contact information
  primary_email text check (primary_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  primary_phone text,
  primary_mobile text,
  website_url text,
  
  -- License information
  license_number text,
  license_expiry_date date,
  
  -- Countries served (text array for simplicity in this phase)
  countries_served text[],
  
  -- Commercial terms (vendor-like for payment purposes)
  currency_id bigint references currencies(id),
  payment_term_id bigint references payment_terms(id),
  tax_type_id bigint references tax_types(id),
  
  -- ICV (In-Country Value) certificate information
  icv_certificate_number text,
  icv_score_percentage numeric(5, 2) check (icv_score_percentage is null or (icv_score_percentage >= 0 and icv_score_percentage <= 100)),
  icv_issue_date date,
  icv_expiry_date date check (icv_issue_date is null or icv_expiry_date is null or icv_expiry_date >= icv_issue_date),
  icv_company_type text,
  icv_financial_year_end_date date,
  icv_certification_body text,
  icv_version text,
  icv_status_code text,
  icv_document_path text,
  
  -- CICPA (Critical Infrastructure and Coastal Protection Authority) company registration
  cicpa_registration_number text,
  
  -- Notes
  notes text,
  
  -- Status
  status_code text not null default 'ACTIVE',
  
  -- Audit fields
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  
  -- System fields
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0
);

COMMENT ON TABLE recruitment_agencies IS 'Recruitment agency master data (vendor-like for payment/commercial purposes but separate for HR control)';
COMMENT ON COLUMN recruitment_agencies.agency_type_code IS 'Lookup value code from RECRUITMENT_AGENCY_TYPES.';
COMMENT ON COLUMN recruitment_agencies.agency_category_code IS 'Lookup value code from RECRUITMENT_AGENCY_CATEGORIES.';
COMMENT ON COLUMN recruitment_agencies.status_code IS 'Lookup value code from PARTY_STATUS_TYPES.';
COMMENT ON COLUMN recruitment_agencies.icv_certificate_number IS 'ICV certificate number for the recruitment agency/company, if applicable. Metadata tracking only, not score calculation.';
COMMENT ON COLUMN recruitment_agencies.icv_score_percentage IS 'ICV score percentage (0-100). From ICV certificate.';
COMMENT ON COLUMN recruitment_agencies.icv_status_code IS 'Lookup value code from ICV_STATUS_TYPES. ICV certificate status (VALID, EXPIRED, UNDER_RENEWAL, NOT_AVAILABLE, NOT_REQUIRED, PENDING_SUBMISSION)';
COMMENT ON COLUMN recruitment_agencies.icv_document_path IS 'Temporary nullable reference to ICV certificate document. DMS not yet implemented.';
COMMENT ON COLUMN recruitment_agencies.cicpa_registration_number IS 'Company CICPA registration number, if applicable. Company-level registration only, not individual employee access cards.';
COMMENT ON COLUMN recruitment_agencies.countries_served IS 'Array of country codes where agency provides recruitment services';

-- ============================================================================
-- SECTION 5: CONTACT TABLES (6 Tables)
-- ============================================================================

-- Macro for contact tables (applied to all 6 entities)
-- customer_contacts, vendor_contacts, subcontractor_contacts, 
-- consultant_contacts, government_authority_contacts, recruitment_agency_contacts

CREATE TABLE IF NOT EXISTS customer_contacts (
  id bigint generated by default as identity primary key,
  customer_id bigint not null references customers(id) on delete cascade,
  contact_code text not null,
  contact_name_en text not null,
  contact_name_ar text,
  designation text,
  department text,
  contact_type_code text,
  email text check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  mobile text,
  phone text,
  whatsapp text,
  is_primary boolean not null default false,
  is_authorized_signatory boolean not null default false,
  is_decision_maker boolean not null default false,
  is_finance_contact boolean not null default false,
  is_operations_contact boolean not null default false,
  preferred_communication_code text,
  notes text,
  status_code text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  unique (customer_id, contact_code)
);

CREATE TABLE IF NOT EXISTS vendor_contacts (
  id bigint generated by default as identity primary key,
  vendor_id bigint not null references vendors(id) on delete cascade,
  contact_code text not null,
  contact_name_en text not null,
  contact_name_ar text,
  designation text,
  department text,
  contact_type_code text,
  email text check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  mobile text,
  phone text,
  whatsapp text,
  is_primary boolean not null default false,
  is_authorized_signatory boolean not null default false,
  is_decision_maker boolean not null default false,
  is_finance_contact boolean not null default false,
  is_operations_contact boolean not null default false,
  preferred_communication_code text,
  notes text,
  status_code text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  unique (vendor_id, contact_code)
);

CREATE TABLE IF NOT EXISTS subcontractor_contacts (
  id bigint generated by default as identity primary key,
  subcontractor_id bigint not null references subcontractors(id) on delete cascade,
  contact_code text not null,
  contact_name_en text not null,
  contact_name_ar text,
  designation text,
  department text,
  contact_type_code text,
  email text check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  mobile text,
  phone text,
  whatsapp text,
  is_primary boolean not null default false,
  is_authorized_signatory boolean not null default false,
  is_decision_maker boolean not null default false,
  is_finance_contact boolean not null default false,
  is_operations_contact boolean not null default false,
  preferred_communication_code text,
  notes text,
  status_code text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  unique (subcontractor_id, contact_code)
);

CREATE TABLE IF NOT EXISTS consultant_contacts (
  id bigint generated by default as identity primary key,
  consultant_id bigint not null references consultants(id) on delete cascade,
  contact_code text not null,
  contact_name_en text not null,
  contact_name_ar text,
  designation text,
  department text,
  contact_type_code text,
  email text check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  mobile text,
  phone text,
  whatsapp text,
  is_primary boolean not null default false,
  is_authorized_signatory boolean not null default false,
  is_decision_maker boolean not null default false,
  is_finance_contact boolean not null default false,
  is_operations_contact boolean not null default false,
  preferred_communication_code text,
  notes text,
  status_code text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  unique (consultant_id, contact_code)
);

CREATE TABLE IF NOT EXISTS government_authority_contacts (
  id bigint generated by default as identity primary key,
  government_authority_id bigint not null references government_authorities(id) on delete cascade,
  contact_code text not null,
  contact_name_en text not null,
  contact_name_ar text,
  designation text,
  department text,
  contact_type_code text,
  email text check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  mobile text,
  phone text,
  whatsapp text,
  is_primary boolean not null default false,
  is_authorized_signatory boolean not null default false,
  is_decision_maker boolean not null default false,
  is_finance_contact boolean not null default false,
  is_operations_contact boolean not null default false,
  preferred_communication_code text,
  notes text,
  status_code text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  unique (government_authority_id, contact_code)
);

CREATE TABLE IF NOT EXISTS recruitment_agency_contacts (
  id bigint generated by default as identity primary key,
  recruitment_agency_id bigint not null references recruitment_agencies(id) on delete cascade,
  contact_code text not null,
  contact_name_en text not null,
  contact_name_ar text,
  designation text,
  department text,
  contact_type_code text,
  email text check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'),
  mobile text,
  phone text,
  whatsapp text,
  is_primary boolean not null default false,
  is_authorized_signatory boolean not null default false,
  is_decision_maker boolean not null default false,
  is_finance_contact boolean not null default false,
  is_operations_contact boolean not null default false,
  preferred_communication_code text,
  notes text,
  status_code text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  unique (recruitment_agency_id, contact_code)
);

-- ============================================================================
-- SECTION 6: ADDRESS TABLES (6 Tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_addresses (
  id bigint generated by default as identity primary key,
  customer_id bigint not null references customers(id) on delete cascade,
  address_type_code text,
  country_id bigint references countries(id),
  emirate_id bigint references emirates(id),
  city_id bigint references cities(id),
  area_zone_id bigint references areas_zones(id),
  address_line_1 text,
  address_line_2 text,
  building_name text,
  street_name text,
  po_box text,
  makani_number text,
  latitude decimal(10, 8) check (latitude between -90 and 90),
  longitude decimal(11, 8) check (longitude between -180 and 180),
  is_primary boolean not null default false,
  is_billing_address boolean not null default false,
  is_shipping_address boolean not null default false,
  notes text,
  status_code text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0
);

CREATE TABLE IF NOT EXISTS vendor_addresses (
  id bigint generated by default as identity primary key,
  vendor_id bigint not null references vendors(id) on delete cascade,
  address_type_code text,
  country_id bigint references countries(id),
  emirate_id bigint references emirates(id),
  city_id bigint references cities(id),
  area_zone_id bigint references areas_zones(id),
  address_line_1 text,
  address_line_2 text,
  building_name text,
  street_name text,
  po_box text,
  makani_number text,
  latitude decimal(10, 8) check (latitude between -90 and 90),
  longitude decimal(11, 8) check (longitude between -180 and 180),
  is_primary boolean not null default false,
  is_billing_address boolean not null default false,
  is_shipping_address boolean not null default false,
  notes text,
  status_code text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0
);

CREATE TABLE IF NOT EXISTS subcontractor_addresses (
  id bigint generated by default as identity primary key,
  subcontractor_id bigint not null references subcontractors(id) on delete cascade,
  address_type_code text,
  country_id bigint references countries(id),
  emirate_id bigint references emirates(id),
  city_id bigint references cities(id),
  area_zone_id bigint references areas_zones(id),
  address_line_1 text,
  address_line_2 text,
  building_name text,
  street_name text,
  po_box text,
  makani_number text,
  latitude decimal(10, 8) check (latitude between -90 and 90),
  longitude decimal(11, 8) check (longitude between -180 and 180),
  is_primary boolean not null default false,
  is_billing_address boolean not null default false,
  is_shipping_address boolean not null default false,
  notes text,
  status_code text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0
);

CREATE TABLE IF NOT EXISTS consultant_addresses (
  id bigint generated by default as identity primary key,
  consultant_id bigint not null references consultants(id) on delete cascade,
  address_type_code text,
  country_id bigint references countries(id),
  emirate_id bigint references emirates(id),
  city_id bigint references cities(id),
  area_zone_id bigint references areas_zones(id),
  address_line_1 text,
  address_line_2 text,
  building_name text,
  street_name text,
  po_box text,
  makani_number text,
  latitude decimal(10, 8) check (latitude between -90 and 90),
  longitude decimal(11, 8) check (longitude between -180 and 180),
  is_primary boolean not null default false,
  is_billing_address boolean not null default false,
  is_shipping_address boolean not null default false,
  notes text,
  status_code text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0
);

CREATE TABLE IF NOT EXISTS government_authority_addresses (
  id bigint generated by default as identity primary key,
  government_authority_id bigint not null references government_authorities(id) on delete cascade,
  address_type_code text,
  country_id bigint references countries(id),
  emirate_id bigint references emirates(id),
  city_id bigint references cities(id),
  area_zone_id bigint references areas_zones(id),
  address_line_1 text,
  address_line_2 text,
  building_name text,
  street_name text,
  po_box text,
  makani_number text,
  latitude decimal(10, 8) check (latitude between -90 and 90),
  longitude decimal(11, 8) check (longitude between -180 and 180),
  is_primary boolean not null default false,
  is_billing_address boolean not null default false,
  is_shipping_address boolean not null default false,
  notes text,
  status_code text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0
);

CREATE TABLE IF NOT EXISTS recruitment_agency_addresses (
  id bigint generated by default as identity primary key,
  recruitment_agency_id bigint not null references recruitment_agencies(id) on delete cascade,
  address_type_code text,
  country_id bigint references countries(id),
  emirate_id bigint references emirates(id),
  city_id bigint references cities(id),
  area_zone_id bigint references areas_zones(id),
  address_line_1 text,
  address_line_2 text,
  building_name text,
  street_name text,
  po_box text,
  makani_number text,
  latitude decimal(10, 8) check (latitude between -90 and 90),
  longitude decimal(11, 8) check (longitude between -180 and 180),
  is_primary boolean not null default false,
  is_billing_address boolean not null default false,
  is_shipping_address boolean not null default false,
  notes text,
  status_code text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0
);

-- ============================================================================
-- SECTION 7: DOCUMENT TABLES (6 Tables)
-- ============================================================================
-- ============================================================================
-- CONTINUATION OF: 20260607150000_erp_base_002f3e2_people_contacts_crm_database_lookups_seeds.sql
-- THIS FILE CONTAINS: SECTIONS 7-13 (Document Tables through Verification)
-- TO BE APPENDED TO THE MAIN MIGRATION FILE
-- ============================================================================

-- ============================================================================
-- SECTION 7: DOCUMENT TABLES (6 Tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_documents (
  id bigint generated by default as identity primary key,
  customer_id bigint not null references customers(id) on delete cascade,
  document_type_code text,
  document_name text not null,
  document_number text,
  issue_date date,
  expiry_date date check (expiry_date is null or issue_date is null or expiry_date >= issue_date),
  has_expiry boolean not null default false,
  expiry_reminder_days integer check (expiry_reminder_days is null or expiry_reminder_days >= 0),
  file_path text,
  is_required boolean not null default false,
  is_verified boolean not null default false,
  verified_by bigint references user_profiles(id),
  verified_at timestamptz,
  notes text,
  status_code text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0
);

CREATE TABLE IF NOT EXISTS vendor_documents (
  id bigint generated by default as identity primary key,
  vendor_id bigint not null references vendors(id) on delete cascade,
  document_type_code text,
  document_name text not null,
  document_number text,
  issue_date date,
  expiry_date date check (expiry_date is null or issue_date is null or expiry_date >= issue_date),
  has_expiry boolean not null default false,
  expiry_reminder_days integer check (expiry_reminder_days is null or expiry_reminder_days >= 0),
  file_path text,
  is_required boolean not null default false,
  is_verified boolean not null default false,
  verified_by bigint references user_profiles(id),
  verified_at timestamptz,
  notes text,
  status_code text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0
);

CREATE TABLE IF NOT EXISTS subcontractor_documents (
  id bigint generated by default as identity primary key,
  subcontractor_id bigint not null references subcontractors(id) on delete cascade,
  document_type_code text,
  document_name text not null,
  document_number text,
  issue_date date,
  expiry_date date check (expiry_date is null or issue_date is null or expiry_date >= issue_date),
  has_expiry boolean not null default false,
  expiry_reminder_days integer check (expiry_reminder_days is null or expiry_reminder_days >= 0),
  file_path text,
  is_required boolean not null default false,
  is_verified boolean not null default false,
  verified_by bigint references user_profiles(id),
  verified_at timestamptz,
  notes text,
  status_code text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0
);

CREATE TABLE IF NOT EXISTS consultant_documents (
  id bigint generated by default as identity primary key,
  consultant_id bigint not null references consultants(id) on delete cascade,
  document_type_code text,
  document_name text not null,
  document_number text,
  issue_date date,
  expiry_date date check (expiry_date is null or issue_date is null or expiry_date >= issue_date),
  has_expiry boolean not null default false,
  expiry_reminder_days integer check (expiry_reminder_days is null or expiry_reminder_days >= 0),
  file_path text,
  is_required boolean not null default false,
  is_verified boolean not null default false,
  verified_by bigint references user_profiles(id),
  verified_at timestamptz,
  notes text,
  status_code text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0
);

CREATE TABLE IF NOT EXISTS government_authority_documents (
  id bigint generated by default as identity primary key,
  government_authority_id bigint not null references government_authorities(id) on delete cascade,
  document_type_code text,
  document_name text not null,
  document_number text,
  issue_date date,
  expiry_date date check (expiry_date is null or issue_date is null or expiry_date >= issue_date),
  has_expiry boolean not null default false,
  expiry_reminder_days integer check (expiry_reminder_days is null or expiry_reminder_days >= 0),
  file_path text,
  is_required boolean not null default false,
  is_verified boolean not null default false,
  verified_by bigint references user_profiles(id),
  verified_at timestamptz,
  notes text,
  status_code text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0
);

CREATE TABLE IF NOT EXISTS recruitment_agency_documents (
  id bigint generated by default as identity primary key,
  recruitment_agency_id bigint not null references recruitment_agencies(id) on delete cascade,
  document_type_code text,
  document_name text not null,
  document_number text,
  issue_date date,
  expiry_date date check (expiry_date is null or issue_date is null or expiry_date >= issue_date),
  has_expiry boolean not null default false,
  expiry_reminder_days integer check (expiry_reminder_days is null or expiry_reminder_days >= 0),
  file_path text,
  is_required boolean not null default false,
  is_verified boolean not null default false,
  verified_by bigint references user_profiles(id),
  verified_at timestamptz,
  notes text,
  status_code text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id),
  deactivated_at timestamptz,
  deactivated_by bigint references user_profiles(id),
  deactivation_reason text,
  is_active boolean not null default true,
  is_locked boolean not null default false,
  is_system boolean not null default false,
  sort_order integer not null default 0
);

-- ============================================================================
-- SECTION 8: BANK DETAILS TABLES (5 Tables)
-- NOTE: government_authority_bank_details is explicitly EXCLUDED
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_bank_details (
  id bigint generated by default as identity primary key,
  customer_id bigint not null references customers(id) on delete cascade,
  bank_id bigint references banks(id),
  bank_account_type_code text,
  account_name text not null,
  account_number text not null,
  iban text,
  swift_code text,
  currency_id bigint references currencies(id),
  is_primary boolean not null default false,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id)
);

CREATE TABLE IF NOT EXISTS vendor_bank_details (
  id bigint generated by default as identity primary key,
  vendor_id bigint not null references vendors(id) on delete cascade,
  bank_id bigint references banks(id),
  bank_account_type_code text,
  account_name text not null,
  account_number text not null,
  iban text,
  swift_code text,
  currency_id bigint references currencies(id),
  is_primary boolean not null default false,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id)
);

CREATE TABLE IF NOT EXISTS subcontractor_bank_details (
  id bigint generated by default as identity primary key,
  subcontractor_id bigint not null references subcontractors(id) on delete cascade,
  bank_id bigint references banks(id),
  bank_account_type_code text,
  account_name text not null,
  account_number text not null,
  iban text,
  swift_code text,
  currency_id bigint references currencies(id),
  is_primary boolean not null default false,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id)
);

CREATE TABLE IF NOT EXISTS consultant_bank_details (
  id bigint generated by default as identity primary key,
  consultant_id bigint not null references consultants(id) on delete cascade,
  bank_id bigint references banks(id),
  bank_account_type_code text,
  account_name text not null,
  account_number text not null,
  iban text,
  swift_code text,
  currency_id bigint references currencies(id),
  is_primary boolean not null default false,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id)
);

CREATE TABLE IF NOT EXISTS recruitment_agency_bank_details (
  id bigint generated by default as identity primary key,
  recruitment_agency_id bigint not null references recruitment_agencies(id) on delete cascade,
  bank_id bigint references banks(id),
  bank_account_type_code text,
  account_name text not null,
  account_number text not null,
  iban text,
  swift_code text,
  currency_id bigint references currencies(id),
  is_primary boolean not null default false,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by bigint references user_profiles(id),
  updated_at timestamptz not null default now(),
  updated_by bigint references user_profiles(id)
);

COMMENT ON TABLE recruitment_agency_bank_details IS 'Recruitment agencies are vendor-like for payment purposes (bank details required)';

-- ============================================================================
-- SECTION 9: INDEXES
-- ============================================================================

-- Main entity indexes
CREATE INDEX IF NOT EXISTS idx_customers_customer_code ON customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_customer_name_en ON customers(customer_name_en);
CREATE INDEX IF NOT EXISTS idx_customers_customer_type_code ON customers(customer_type_code);
CREATE INDEX IF NOT EXISTS idx_customers_status_code ON customers(status_code);
CREATE INDEX IF NOT EXISTS idx_customers_country_id ON customers(country_id);
CREATE INDEX IF NOT EXISTS idx_customers_emirate_id ON customers(emirate_id);
CREATE INDEX IF NOT EXISTS idx_customers_is_active ON customers(is_active);
CREATE INDEX IF NOT EXISTS idx_customers_trn ON customers(trn) WHERE trn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_icv_certificate_number ON customers(icv_certificate_number) WHERE icv_certificate_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_icv_expiry_date ON customers(icv_expiry_date) WHERE icv_expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_icv_status_code ON customers(icv_status_code) WHERE icv_status_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_cicpa_registration_number ON customers(cicpa_registration_number) WHERE cicpa_registration_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vendors_vendor_code ON vendors(vendor_code);
CREATE INDEX IF NOT EXISTS idx_vendors_vendor_name_en ON vendors(vendor_name_en);
CREATE INDEX IF NOT EXISTS idx_vendors_vendor_type_code ON vendors(vendor_type_code);
CREATE INDEX IF NOT EXISTS idx_vendors_status_code ON vendors(status_code);
CREATE INDEX IF NOT EXISTS idx_vendors_country_id ON vendors(country_id);
CREATE INDEX IF NOT EXISTS idx_vendors_emirate_id ON vendors(emirate_id);
CREATE INDEX IF NOT EXISTS idx_vendors_is_active ON vendors(is_active);
CREATE INDEX IF NOT EXISTS idx_vendors_trn ON vendors(trn) WHERE trn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendors_icv_certificate_number ON vendors(icv_certificate_number) WHERE icv_certificate_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendors_icv_expiry_date ON vendors(icv_expiry_date) WHERE icv_expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendors_icv_status_code ON vendors(icv_status_code) WHERE icv_status_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendors_cicpa_registration_number ON vendors(cicpa_registration_number) WHERE cicpa_registration_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subcontractors_subcontractor_code ON subcontractors(subcontractor_code);
CREATE INDEX IF NOT EXISTS idx_subcontractors_subcontractor_name_en ON subcontractors(subcontractor_name_en);
CREATE INDEX IF NOT EXISTS idx_subcontractors_subcontractor_type_code ON subcontractors(subcontractor_type_code);
CREATE INDEX IF NOT EXISTS idx_subcontractors_status_code ON subcontractors(status_code);
CREATE INDEX IF NOT EXISTS idx_subcontractors_is_active ON subcontractors(is_active);
CREATE INDEX IF NOT EXISTS idx_subcontractors_icv_certificate_number ON subcontractors(icv_certificate_number) WHERE icv_certificate_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subcontractors_icv_expiry_date ON subcontractors(icv_expiry_date) WHERE icv_expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subcontractors_icv_status_code ON subcontractors(icv_status_code) WHERE icv_status_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subcontractors_cicpa_registration_number ON subcontractors(cicpa_registration_number) WHERE cicpa_registration_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_consultants_consultant_code ON consultants(consultant_code);
CREATE INDEX IF NOT EXISTS idx_consultants_consultant_name_en ON consultants(consultant_name_en);
CREATE INDEX IF NOT EXISTS idx_consultants_consultant_type_code ON consultants(consultant_type_code);
CREATE INDEX IF NOT EXISTS idx_consultants_status_code ON consultants(status_code);
CREATE INDEX IF NOT EXISTS idx_consultants_is_active ON consultants(is_active);
CREATE INDEX IF NOT EXISTS idx_consultants_icv_certificate_number ON consultants(icv_certificate_number) WHERE icv_certificate_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consultants_icv_expiry_date ON consultants(icv_expiry_date) WHERE icv_expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consultants_icv_status_code ON consultants(icv_status_code) WHERE icv_status_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consultants_cicpa_registration_number ON consultants(cicpa_registration_number) WHERE cicpa_registration_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_government_authorities_authority_code ON government_authorities(authority_code);
CREATE INDEX IF NOT EXISTS idx_government_authorities_authority_name_en ON government_authorities(authority_name_en);
CREATE INDEX IF NOT EXISTS idx_government_authorities_authority_type_code ON government_authorities(authority_type_code);
CREATE INDEX IF NOT EXISTS idx_government_authorities_jurisdiction_level_code ON government_authorities(jurisdiction_level_code);
CREATE INDEX IF NOT EXISTS idx_government_authorities_status_code ON government_authorities(status_code);
CREATE INDEX IF NOT EXISTS idx_government_authorities_is_active ON government_authorities(is_active);

CREATE INDEX IF NOT EXISTS idx_recruitment_agencies_agency_code ON recruitment_agencies(agency_code);
CREATE INDEX IF NOT EXISTS idx_recruitment_agencies_agency_name_en ON recruitment_agencies(agency_name_en);
CREATE INDEX IF NOT EXISTS idx_recruitment_agencies_agency_type_code ON recruitment_agencies(agency_type_code);
CREATE INDEX IF NOT EXISTS idx_recruitment_agencies_status_code ON recruitment_agencies(status_code);
CREATE INDEX IF NOT EXISTS idx_recruitment_agencies_is_active ON recruitment_agencies(is_active);
CREATE INDEX IF NOT EXISTS idx_recruitment_agencies_icv_certificate_number ON recruitment_agencies(icv_certificate_number) WHERE icv_certificate_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recruitment_agencies_icv_expiry_date ON recruitment_agencies(icv_expiry_date) WHERE icv_expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recruitment_agencies_icv_status_code ON recruitment_agencies(icv_status_code) WHERE icv_status_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_recruitment_agencies_cicpa_registration_number ON recruitment_agencies(cicpa_registration_number) WHERE cicpa_registration_number IS NOT NULL;

-- Contact table indexes
CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer_id ON customer_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_email ON customer_contacts(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_contacts_is_primary ON customer_contacts(is_primary) WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS idx_vendor_contacts_vendor_id ON vendor_contacts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_contacts_email ON vendor_contacts(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_contacts_is_primary ON vendor_contacts(is_primary) WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS idx_subcontractor_contacts_subcontractor_id ON subcontractor_contacts(subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_consultant_contacts_consultant_id ON consultant_contacts(consultant_id);
CREATE INDEX IF NOT EXISTS idx_government_authority_contacts_government_authority_id ON government_authority_contacts(government_authority_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_agency_contacts_recruitment_agency_id ON recruitment_agency_contacts(recruitment_agency_id);

-- Address table indexes
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id ON customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_is_primary ON customer_addresses(is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_vendor_addresses_vendor_id ON vendor_addresses(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_addresses_is_primary ON vendor_addresses(is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_subcontractor_addresses_subcontractor_id ON subcontractor_addresses(subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_consultant_addresses_consultant_id ON consultant_addresses(consultant_id);
CREATE INDEX IF NOT EXISTS idx_government_authority_addresses_government_authority_id ON government_authority_addresses(government_authority_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_agency_addresses_recruitment_agency_id ON recruitment_agency_addresses(recruitment_agency_id);

-- Document table indexes
CREATE INDEX IF NOT EXISTS idx_customer_documents_customer_id ON customer_documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_documents_expiry_date ON customer_documents(expiry_date) WHERE has_expiry = true;
CREATE INDEX IF NOT EXISTS idx_vendor_documents_vendor_id ON vendor_documents(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_documents_expiry_date ON vendor_documents(expiry_date) WHERE has_expiry = true;
CREATE INDEX IF NOT EXISTS idx_subcontractor_documents_subcontractor_id ON subcontractor_documents(subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_subcontractor_documents_expiry_date ON subcontractor_documents(expiry_date) WHERE has_expiry = true;
CREATE INDEX IF NOT EXISTS idx_consultant_documents_consultant_id ON consultant_documents(consultant_id);
CREATE INDEX IF NOT EXISTS idx_government_authority_documents_government_authority_id ON government_authority_documents(government_authority_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_agency_documents_recruitment_agency_id ON recruitment_agency_documents(recruitment_agency_id);

-- Bank details indexes
CREATE INDEX IF NOT EXISTS idx_customer_bank_details_customer_id ON customer_bank_details(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_bank_details_is_primary ON customer_bank_details(is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_vendor_bank_details_vendor_id ON vendor_bank_details(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_bank_details_is_primary ON vendor_bank_details(is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_subcontractor_bank_details_subcontractor_id ON subcontractor_bank_details(subcontractor_id);
CREATE INDEX IF NOT EXISTS idx_consultant_bank_details_consultant_id ON consultant_bank_details(consultant_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_agency_bank_details_recruitment_agency_id ON recruitment_agency_bank_details(recruitment_agency_id);

-- ============================================================================
-- SECTION 10: TRIGGERS (set_updated_at on all 29 tables)
-- ============================================================================

-- Main entity triggers
CREATE TRIGGER set_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_vendors_updated_at BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_subcontractors_updated_at BEFORE UPDATE ON subcontractors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_consultants_updated_at BEFORE UPDATE ON consultants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_government_authorities_updated_at BEFORE UPDATE ON government_authorities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_recruitment_agencies_updated_at BEFORE UPDATE ON recruitment_agencies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Contact table triggers
CREATE TRIGGER set_customer_contacts_updated_at BEFORE UPDATE ON customer_contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_vendor_contacts_updated_at BEFORE UPDATE ON vendor_contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_subcontractor_contacts_updated_at BEFORE UPDATE ON subcontractor_contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_consultant_contacts_updated_at BEFORE UPDATE ON consultant_contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_government_authority_contacts_updated_at BEFORE UPDATE ON government_authority_contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_recruitment_agency_contacts_updated_at BEFORE UPDATE ON recruitment_agency_contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Address table triggers
CREATE TRIGGER set_customer_addresses_updated_at BEFORE UPDATE ON customer_addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_vendor_addresses_updated_at BEFORE UPDATE ON vendor_addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_subcontractor_addresses_updated_at BEFORE UPDATE ON subcontractor_addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_consultant_addresses_updated_at BEFORE UPDATE ON consultant_addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_government_authority_addresses_updated_at BEFORE UPDATE ON government_authority_addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_recruitment_agency_addresses_updated_at BEFORE UPDATE ON recruitment_agency_addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Document table triggers
CREATE TRIGGER set_customer_documents_updated_at BEFORE UPDATE ON customer_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_vendor_documents_updated_at BEFORE UPDATE ON vendor_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_subcontractor_documents_updated_at BEFORE UPDATE ON subcontractor_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_consultant_documents_updated_at BEFORE UPDATE ON consultant_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_government_authority_documents_updated_at BEFORE UPDATE ON government_authority_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_recruitment_agency_documents_updated_at BEFORE UPDATE ON recruitment_agency_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Bank details triggers
CREATE TRIGGER set_customer_bank_details_updated_at BEFORE UPDATE ON customer_bank_details
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_vendor_bank_details_updated_at BEFORE UPDATE ON vendor_bank_details
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_subcontractor_bank_details_updated_at BEFORE UPDATE ON subcontractor_bank_details
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_consultant_bank_details_updated_at BEFORE UPDATE ON consultant_bank_details
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_recruitment_agency_bank_details_updated_at BEFORE UPDATE ON recruitment_agency_bank_details
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- SECTION 11: RLS POLICIES (Enable RLS + Policies for all 29 tables)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultants ENABLE ROW LEVEL SECURITY;
ALTER TABLE government_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruitment_agencies ENABLE ROW LEVEL SECURITY;

ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontractor_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultant_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE government_authority_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruitment_agency_contacts ENABLE ROW LEVEL SECURITY;

ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontractor_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultant_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE government_authority_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruitment_agency_addresses ENABLE ROW LEVEL SECURITY;

ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontractor_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultant_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE government_authority_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruitment_agency_documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE customer_bank_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_bank_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontractor_bank_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultant_bank_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruitment_agency_bank_details ENABLE ROW LEVEL SECURITY;

-- RLS Policies for customers
DROP POLICY IF EXISTS customers_select_policy ON customers;
CREATE POLICY customers_select_policy ON customers FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS customers_insert_policy ON customers;
CREATE POLICY customers_insert_policy ON customers FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS customers_update_policy ON customers;
CREATE POLICY customers_update_policy ON customers FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  );

DROP POLICY IF EXISTS customers_delete_policy ON customers;
CREATE POLICY customers_delete_policy ON customers FOR DELETE
  USING (current_user_has_role('system_admin'));

-- Vendors policies
DROP POLICY IF EXISTS vendors_select_policy ON vendors;
CREATE POLICY vendors_select_policy ON vendors FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS vendors_insert_policy ON vendors;
CREATE POLICY vendors_insert_policy ON vendors FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS vendors_update_policy ON vendors;
CREATE POLICY vendors_update_policy ON vendors FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  );

DROP POLICY IF EXISTS vendors_delete_policy ON vendors;
CREATE POLICY vendors_delete_policy ON vendors FOR DELETE
  USING (current_user_has_role('system_admin'));

-- Subcontractors policies
DROP POLICY IF EXISTS subcontractors_select_policy ON subcontractors;
CREATE POLICY subcontractors_select_policy ON subcontractors FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS subcontractors_insert_policy ON subcontractors;
CREATE POLICY subcontractors_insert_policy ON subcontractors FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS subcontractors_update_policy ON subcontractors;
CREATE POLICY subcontractors_update_policy ON subcontractors FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  );

DROP POLICY IF EXISTS subcontractors_delete_policy ON subcontractors;
CREATE POLICY subcontractors_delete_policy ON subcontractors FOR DELETE
  USING (current_user_has_role('system_admin'));

-- Consultants policies
DROP POLICY IF EXISTS consultants_select_policy ON consultants;
CREATE POLICY consultants_select_policy ON consultants FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS consultants_insert_policy ON consultants;
CREATE POLICY consultants_insert_policy ON consultants FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS consultants_update_policy ON consultants;
CREATE POLICY consultants_update_policy ON consultants FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  );

DROP POLICY IF EXISTS consultants_delete_policy ON consultants;
CREATE POLICY consultants_delete_policy ON consultants FOR DELETE
  USING (current_user_has_role('system_admin'));

-- Government authorities policies
DROP POLICY IF EXISTS government_authorities_select_policy ON government_authorities;
CREATE POLICY government_authorities_select_policy ON government_authorities FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS government_authorities_insert_policy ON government_authorities;
CREATE POLICY government_authorities_insert_policy ON government_authorities FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS government_authorities_update_policy ON government_authorities;
CREATE POLICY government_authorities_update_policy ON government_authorities FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  );

DROP POLICY IF EXISTS government_authorities_delete_policy ON government_authorities;
CREATE POLICY government_authorities_delete_policy ON government_authorities FOR DELETE
  USING (current_user_has_role('system_admin'));

-- Recruitment agencies policies
DROP POLICY IF EXISTS recruitment_agencies_select_policy ON recruitment_agencies;
CREATE POLICY recruitment_agencies_select_policy ON recruitment_agencies FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS recruitment_agencies_insert_policy ON recruitment_agencies;
CREATE POLICY recruitment_agencies_insert_policy ON recruitment_agencies FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS recruitment_agencies_update_policy ON recruitment_agencies;
CREATE POLICY recruitment_agencies_update_policy ON recruitment_agencies FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  );

DROP POLICY IF EXISTS recruitment_agencies_delete_policy ON recruitment_agencies;
CREATE POLICY recruitment_agencies_delete_policy ON recruitment_agencies FOR DELETE
  USING (current_user_has_role('system_admin'));

-- Contact table policies

DROP POLICY IF EXISTS customer_contacts_select_policy ON customer_contacts;
CREATE POLICY customer_contacts_select_policy ON customer_contacts FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS customer_contacts_insert_policy ON customer_contacts;
CREATE POLICY customer_contacts_insert_policy ON customer_contacts FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS customer_contacts_update_policy ON customer_contacts;
CREATE POLICY customer_contacts_update_policy ON customer_contacts FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS customer_contacts_delete_policy ON customer_contacts;
CREATE POLICY customer_contacts_delete_policy ON customer_contacts FOR DELETE
  USING (current_user_has_role('system_admin'));

DROP POLICY IF EXISTS vendor_contacts_select_policy ON vendor_contacts;
CREATE POLICY vendor_contacts_select_policy ON vendor_contacts FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS vendor_contacts_insert_policy ON vendor_contacts;
CREATE POLICY vendor_contacts_insert_policy ON vendor_contacts FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS vendor_contacts_update_policy ON vendor_contacts;
CREATE POLICY vendor_contacts_update_policy ON vendor_contacts FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS vendor_contacts_delete_policy ON vendor_contacts;
CREATE POLICY vendor_contacts_delete_policy ON vendor_contacts FOR DELETE
  USING (current_user_has_role('system_admin'));

DROP POLICY IF EXISTS subcontractor_contacts_select_policy ON subcontractor_contacts;
CREATE POLICY subcontractor_contacts_select_policy ON subcontractor_contacts FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS subcontractor_contacts_insert_policy ON subcontractor_contacts;
CREATE POLICY subcontractor_contacts_insert_policy ON subcontractor_contacts FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS subcontractor_contacts_update_policy ON subcontractor_contacts;
CREATE POLICY subcontractor_contacts_update_policy ON subcontractor_contacts FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS subcontractor_contacts_delete_policy ON subcontractor_contacts;
CREATE POLICY subcontractor_contacts_delete_policy ON subcontractor_contacts FOR DELETE
  USING (current_user_has_role('system_admin'));

DROP POLICY IF EXISTS consultant_contacts_select_policy ON consultant_contacts;
CREATE POLICY consultant_contacts_select_policy ON consultant_contacts FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS consultant_contacts_insert_policy ON consultant_contacts;
CREATE POLICY consultant_contacts_insert_policy ON consultant_contacts FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS consultant_contacts_update_policy ON consultant_contacts;
CREATE POLICY consultant_contacts_update_policy ON consultant_contacts FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS consultant_contacts_delete_policy ON consultant_contacts;
CREATE POLICY consultant_contacts_delete_policy ON consultant_contacts FOR DELETE
  USING (current_user_has_role('system_admin'));

DROP POLICY IF EXISTS government_authority_contacts_select_policy ON government_authority_contacts;
CREATE POLICY government_authority_contacts_select_policy ON government_authority_contacts FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS government_authority_contacts_insert_policy ON government_authority_contacts;
CREATE POLICY government_authority_contacts_insert_policy ON government_authority_contacts FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS government_authority_contacts_update_policy ON government_authority_contacts;
CREATE POLICY government_authority_contacts_update_policy ON government_authority_contacts FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS government_authority_contacts_delete_policy ON government_authority_contacts;
CREATE POLICY government_authority_contacts_delete_policy ON government_authority_contacts FOR DELETE
  USING (current_user_has_role('system_admin'));

DROP POLICY IF EXISTS recruitment_agency_contacts_select_policy ON recruitment_agency_contacts;
CREATE POLICY recruitment_agency_contacts_select_policy ON recruitment_agency_contacts FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS recruitment_agency_contacts_insert_policy ON recruitment_agency_contacts;
CREATE POLICY recruitment_agency_contacts_insert_policy ON recruitment_agency_contacts FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS recruitment_agency_contacts_update_policy ON recruitment_agency_contacts;
CREATE POLICY recruitment_agency_contacts_update_policy ON recruitment_agency_contacts FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS recruitment_agency_contacts_delete_policy ON recruitment_agency_contacts;
CREATE POLICY recruitment_agency_contacts_delete_policy ON recruitment_agency_contacts FOR DELETE
  USING (current_user_has_role('system_admin'));

-- Address table policies

DROP POLICY IF EXISTS customer_addresses_select_policy ON customer_addresses;
CREATE POLICY customer_addresses_select_policy ON customer_addresses FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS customer_addresses_insert_policy ON customer_addresses;
CREATE POLICY customer_addresses_insert_policy ON customer_addresses FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS customer_addresses_update_policy ON customer_addresses;
CREATE POLICY customer_addresses_update_policy ON customer_addresses FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS customer_addresses_delete_policy ON customer_addresses;
CREATE POLICY customer_addresses_delete_policy ON customer_addresses FOR DELETE
  USING (current_user_has_role('system_admin'));

DROP POLICY IF EXISTS vendor_addresses_select_policy ON vendor_addresses;
CREATE POLICY vendor_addresses_select_policy ON vendor_addresses FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS vendor_addresses_insert_policy ON vendor_addresses;
CREATE POLICY vendor_addresses_insert_policy ON vendor_addresses FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS vendor_addresses_update_policy ON vendor_addresses;
CREATE POLICY vendor_addresses_update_policy ON vendor_addresses FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS vendor_addresses_delete_policy ON vendor_addresses;
CREATE POLICY vendor_addresses_delete_policy ON vendor_addresses FOR DELETE
  USING (current_user_has_role('system_admin'));

DROP POLICY IF EXISTS subcontractor_addresses_select_policy ON subcontractor_addresses;
CREATE POLICY subcontractor_addresses_select_policy ON subcontractor_addresses FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS subcontractor_addresses_insert_policy ON subcontractor_addresses;
CREATE POLICY subcontractor_addresses_insert_policy ON subcontractor_addresses FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS subcontractor_addresses_update_policy ON subcontractor_addresses;
CREATE POLICY subcontractor_addresses_update_policy ON subcontractor_addresses FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS subcontractor_addresses_delete_policy ON subcontractor_addresses;
CREATE POLICY subcontractor_addresses_delete_policy ON subcontractor_addresses FOR DELETE
  USING (current_user_has_role('system_admin'));

DROP POLICY IF EXISTS consultant_addresses_select_policy ON consultant_addresses;
CREATE POLICY consultant_addresses_select_policy ON consultant_addresses FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS consultant_addresses_insert_policy ON consultant_addresses;
CREATE POLICY consultant_addresses_insert_policy ON consultant_addresses FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS consultant_addresses_update_policy ON consultant_addresses;
CREATE POLICY consultant_addresses_update_policy ON consultant_addresses FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS consultant_addresses_delete_policy ON consultant_addresses;
CREATE POLICY consultant_addresses_delete_policy ON consultant_addresses FOR DELETE
  USING (current_user_has_role('system_admin'));

DROP POLICY IF EXISTS government_authority_addresses_select_policy ON government_authority_addresses;
CREATE POLICY government_authority_addresses_select_policy ON government_authority_addresses FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS government_authority_addresses_insert_policy ON government_authority_addresses;
CREATE POLICY government_authority_addresses_insert_policy ON government_authority_addresses FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS government_authority_addresses_update_policy ON government_authority_addresses;
CREATE POLICY government_authority_addresses_update_policy ON government_authority_addresses FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS government_authority_addresses_delete_policy ON government_authority_addresses;
CREATE POLICY government_authority_addresses_delete_policy ON government_authority_addresses FOR DELETE
  USING (current_user_has_role('system_admin'));

DROP POLICY IF EXISTS recruitment_agency_addresses_select_policy ON recruitment_agency_addresses;
CREATE POLICY recruitment_agency_addresses_select_policy ON recruitment_agency_addresses FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS recruitment_agency_addresses_insert_policy ON recruitment_agency_addresses;
CREATE POLICY recruitment_agency_addresses_insert_policy ON recruitment_agency_addresses FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS recruitment_agency_addresses_update_policy ON recruitment_agency_addresses;
CREATE POLICY recruitment_agency_addresses_update_policy ON recruitment_agency_addresses FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS recruitment_agency_addresses_delete_policy ON recruitment_agency_addresses;
CREATE POLICY recruitment_agency_addresses_delete_policy ON recruitment_agency_addresses FOR DELETE
  USING (current_user_has_role('system_admin'));

-- Document table policies

DROP POLICY IF EXISTS customer_documents_select_policy ON customer_documents;
CREATE POLICY customer_documents_select_policy ON customer_documents FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS customer_documents_insert_policy ON customer_documents;
CREATE POLICY customer_documents_insert_policy ON customer_documents FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS customer_documents_update_policy ON customer_documents;
CREATE POLICY customer_documents_update_policy ON customer_documents FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS customer_documents_delete_policy ON customer_documents;
CREATE POLICY customer_documents_delete_policy ON customer_documents FOR DELETE
  USING (current_user_has_role('system_admin'));

DROP POLICY IF EXISTS vendor_documents_select_policy ON vendor_documents;
CREATE POLICY vendor_documents_select_policy ON vendor_documents FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS vendor_documents_insert_policy ON vendor_documents;
CREATE POLICY vendor_documents_insert_policy ON vendor_documents FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS vendor_documents_update_policy ON vendor_documents;
CREATE POLICY vendor_documents_update_policy ON vendor_documents FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS vendor_documents_delete_policy ON vendor_documents;
CREATE POLICY vendor_documents_delete_policy ON vendor_documents FOR DELETE
  USING (current_user_has_role('system_admin'));

DROP POLICY IF EXISTS subcontractor_documents_select_policy ON subcontractor_documents;
CREATE POLICY subcontractor_documents_select_policy ON subcontractor_documents FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS subcontractor_documents_insert_policy ON subcontractor_documents;
CREATE POLICY subcontractor_documents_insert_policy ON subcontractor_documents FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS subcontractor_documents_update_policy ON subcontractor_documents;
CREATE POLICY subcontractor_documents_update_policy ON subcontractor_documents FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS subcontractor_documents_delete_policy ON subcontractor_documents;
CREATE POLICY subcontractor_documents_delete_policy ON subcontractor_documents FOR DELETE
  USING (current_user_has_role('system_admin'));

DROP POLICY IF EXISTS consultant_documents_select_policy ON consultant_documents;
CREATE POLICY consultant_documents_select_policy ON consultant_documents FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS consultant_documents_insert_policy ON consultant_documents;
CREATE POLICY consultant_documents_insert_policy ON consultant_documents FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS consultant_documents_update_policy ON consultant_documents;
CREATE POLICY consultant_documents_update_policy ON consultant_documents FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS consultant_documents_delete_policy ON consultant_documents;
CREATE POLICY consultant_documents_delete_policy ON consultant_documents FOR DELETE
  USING (current_user_has_role('system_admin'));

DROP POLICY IF EXISTS government_authority_documents_select_policy ON government_authority_documents;
CREATE POLICY government_authority_documents_select_policy ON government_authority_documents FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS government_authority_documents_insert_policy ON government_authority_documents;
CREATE POLICY government_authority_documents_insert_policy ON government_authority_documents FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS government_authority_documents_update_policy ON government_authority_documents;
CREATE POLICY government_authority_documents_update_policy ON government_authority_documents FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS government_authority_documents_delete_policy ON government_authority_documents;
CREATE POLICY government_authority_documents_delete_policy ON government_authority_documents FOR DELETE
  USING (current_user_has_role('system_admin'));

DROP POLICY IF EXISTS recruitment_agency_documents_select_policy ON recruitment_agency_documents;
CREATE POLICY recruitment_agency_documents_select_policy ON recruitment_agency_documents FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS recruitment_agency_documents_insert_policy ON recruitment_agency_documents;
CREATE POLICY recruitment_agency_documents_insert_policy ON recruitment_agency_documents FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS recruitment_agency_documents_update_policy ON recruitment_agency_documents;
CREATE POLICY recruitment_agency_documents_update_policy ON recruitment_agency_documents FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS recruitment_agency_documents_delete_policy ON recruitment_agency_documents;
CREATE POLICY recruitment_agency_documents_delete_policy ON recruitment_agency_documents FOR DELETE
  USING (current_user_has_role('system_admin'));

-- Bank detail table policies

DROP POLICY IF EXISTS customer_bank_details_select_policy ON customer_bank_details;
CREATE POLICY customer_bank_details_select_policy ON customer_bank_details FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS customer_bank_details_insert_policy ON customer_bank_details;
CREATE POLICY customer_bank_details_insert_policy ON customer_bank_details FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS customer_bank_details_update_policy ON customer_bank_details;
CREATE POLICY customer_bank_details_update_policy ON customer_bank_details FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS customer_bank_details_delete_policy ON customer_bank_details;
CREATE POLICY customer_bank_details_delete_policy ON customer_bank_details FOR DELETE
  USING (current_user_has_role('system_admin'));

DROP POLICY IF EXISTS vendor_bank_details_select_policy ON vendor_bank_details;
CREATE POLICY vendor_bank_details_select_policy ON vendor_bank_details FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS vendor_bank_details_insert_policy ON vendor_bank_details;
CREATE POLICY vendor_bank_details_insert_policy ON vendor_bank_details FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS vendor_bank_details_update_policy ON vendor_bank_details;
CREATE POLICY vendor_bank_details_update_policy ON vendor_bank_details FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS vendor_bank_details_delete_policy ON vendor_bank_details;
CREATE POLICY vendor_bank_details_delete_policy ON vendor_bank_details FOR DELETE
  USING (current_user_has_role('system_admin'));

DROP POLICY IF EXISTS subcontractor_bank_details_select_policy ON subcontractor_bank_details;
CREATE POLICY subcontractor_bank_details_select_policy ON subcontractor_bank_details FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS subcontractor_bank_details_insert_policy ON subcontractor_bank_details;
CREATE POLICY subcontractor_bank_details_insert_policy ON subcontractor_bank_details FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS subcontractor_bank_details_update_policy ON subcontractor_bank_details;
CREATE POLICY subcontractor_bank_details_update_policy ON subcontractor_bank_details FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS subcontractor_bank_details_delete_policy ON subcontractor_bank_details;
CREATE POLICY subcontractor_bank_details_delete_policy ON subcontractor_bank_details FOR DELETE
  USING (current_user_has_role('system_admin'));

DROP POLICY IF EXISTS consultant_bank_details_select_policy ON consultant_bank_details;
CREATE POLICY consultant_bank_details_select_policy ON consultant_bank_details FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS consultant_bank_details_insert_policy ON consultant_bank_details;
CREATE POLICY consultant_bank_details_insert_policy ON consultant_bank_details FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS consultant_bank_details_update_policy ON consultant_bank_details;
CREATE POLICY consultant_bank_details_update_policy ON consultant_bank_details FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS consultant_bank_details_delete_policy ON consultant_bank_details;
CREATE POLICY consultant_bank_details_delete_policy ON consultant_bank_details FOR DELETE
  USING (current_user_has_role('system_admin'));

DROP POLICY IF EXISTS recruitment_agency_bank_details_select_policy ON recruitment_agency_bank_details;
CREATE POLICY recruitment_agency_bank_details_select_policy ON recruitment_agency_bank_details FOR SELECT
  USING (is_active = true OR current_user_has_permission('master_data.party_master.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS recruitment_agency_bank_details_insert_policy ON recruitment_agency_bank_details;
CREATE POLICY recruitment_agency_bank_details_insert_policy ON recruitment_agency_bank_details FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS recruitment_agency_bank_details_update_policy ON recruitment_agency_bank_details;
CREATE POLICY recruitment_agency_bank_details_update_policy ON recruitment_agency_bank_details FOR UPDATE
  USING (
    (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'))
    AND (is_locked = false OR current_user_has_role('system_admin'))
    AND (is_system = false OR current_user_has_role('system_admin'))
  )
  WITH CHECK (current_user_has_permission('master_data.party_master.manage') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS recruitment_agency_bank_details_delete_policy ON recruitment_agency_bank_details;
CREATE POLICY recruitment_agency_bank_details_delete_policy ON recruitment_agency_bank_details FOR DELETE
  USING (current_user_has_role('system_admin'));

-- ============================================================================
-- SECTION 12: NUMBERING SYSTEM INTEGRATION
-- ============================================================================

-- Insert numbering document types for party entities
INSERT INTO numbering_document_types (document_type_code, document_type_name_en, document_type_name_ar, default_prefix, default_padding, description)
VALUES
('CUSTOMER', 'Customer Code', 'رمز العميل', 'CUST', 6, 'Customer master data code'),
('VENDOR', 'Vendor Code', 'رمز المورد', 'VEND', 6, 'Vendor master data code'),
('SUBCONTRACTOR', 'Subcontractor Code', 'رمز المقاول من الباطن', 'SUBC', 6, 'Subcontractor master data code'),
('CONSULTANT', 'Consultant Code', 'رمز الاستشاري', 'CONS', 6, 'Consultant master data code'),
('GOVERNMENT_AUTHORITY', 'Government Authority Code', 'رمز الجهة الحكومية', 'AUTH', 6, 'Government authority master data code'),
('RECRUITMENT_AGENCY', 'Recruitment Agency Code', 'رمز وكالة التوظيف', 'AGCY', 6, 'Recruitment agency master data code')
ON CONFLICT (document_type_code) DO NOTHING;

-- Create numbering rules for each entity (group-level default rules)
INSERT INTO numbering_rules (
  rule_code, rule_name_en, rule_name_ar, document_type_code, 
  entity_level, prefix, suffix, padding, separator, 
  is_active, is_default
)
VALUES
('CUSTOMER_GROUP_DEFAULT', 'Customer Code - Group Default', 'رمز العميل - افتراضي المجموعة', 'CUSTOMER', 
 'GROUP', 'CUST', null, 6, '-', 
 true, true),
('VENDOR_GROUP_DEFAULT', 'Vendor Code - Group Default', 'رمز المورد - افتراضي المجموعة', 'VENDOR', 
 'GROUP', 'VEND', null, 6, '-', 
 true, true),
('SUBCONTRACTOR_GROUP_DEFAULT', 'Subcontractor Code - Group Default', 'رمز المقاول من الباطن - افتراضي المجموعة', 'SUBCONTRACTOR', 
 'GROUP', 'SUBC', null, 6, '-', 
 true, true),
('CONSULTANT_GROUP_DEFAULT', 'Consultant Code - Group Default', 'رمز الاستشاري - افتراضي المجموعة', 'CONSULTANT', 
 'GROUP', 'CONS', null, 6, '-', 
 true, true),
('AUTHORITY_GROUP_DEFAULT', 'Government Authority Code - Group Default', 'رمز الجهة الحكومية - افتراضي المجموعة', 'GOVERNMENT_AUTHORITY', 
 'GROUP', 'AUTH', null, 6, '-', 
 true, true),
('AGENCY_GROUP_DEFAULT', 'Recruitment Agency Code - Group Default', 'رمز وكالة التوظيف - افتراضي المجموعة', 'RECRUITMENT_AGENCY', 
 'GROUP', 'AGCY', null, 6, '-', 
 true, true)
ON CONFLICT (rule_code) DO NOTHING;

-- ============================================================================
-- SECTION 13: VERIFICATION QUERIES (AS COMMENTS)
-- ============================================================================

/*
-- Verification queries to run after migration (for manual testing):

-- 1. Verify all 29 tables created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'customers', 'vendors', 'subcontractors', 'consultants', 'government_authorities', 'recruitment_agencies',
    'customer_contacts', 'vendor_contacts', 'subcontractor_contacts', 'consultant_contacts', 'government_authority_contacts', 'recruitment_agency_contacts',
    'customer_addresses', 'vendor_addresses', 'subcontractor_addresses', 'consultant_addresses', 'government_authority_addresses', 'recruitment_agency_addresses',
    'customer_documents', 'vendor_documents', 'subcontractor_documents', 'consultant_documents', 'government_authority_documents', 'recruitment_agency_documents',
    'customer_bank_details', 'vendor_bank_details', 'subcontractor_bank_details', 'consultant_bank_details', 'recruitment_agency_bank_details'
  )
ORDER BY table_name;

-- 2. Verify lookup categories created (should be 22)
SELECT category_code, category_name_en 
FROM global_lookup_categories 
WHERE module_code = 'PARTIES'
ORDER BY sort_order;

-- 3. Verify lookup values created (should be ~130)
SELECT category_code, COUNT(*) as value_count
FROM global_lookup_values
WHERE category_code IN (
  'PARTY_STATUS_TYPES', 'CUSTOMER_TYPES', 'CUSTOMER_SEGMENTS', 'VENDOR_TYPES', 'VENDOR_CATEGORIES',
  'SUPPLIER_CATEGORIES', 'SUBCONTRACTOR_TYPES', 'SUBCONTRACTOR_CATEGORIES', 'CONSULTANT_TYPES', 'CONSULTANT_CATEGORIES',
  'GOVERNMENT_AUTHORITY_TYPES', 'GOVERNMENT_AUTHORITY_CATEGORIES', 'JURISDICTION_LEVEL_TYPES', 
  'RECRUITMENT_AGENCY_TYPES', 'RECRUITMENT_AGENCY_CATEGORIES', 'INDUSTRY_TYPES', 'CRM_LEAD_SOURCES',
  'CONTACT_TYPES', 'COMMUNICATION_PREFERENCE_TYPES', 'ADDRESS_TYPES', 'PARTY_DOCUMENT_TYPES', 'BANK_ACCOUNT_TYPES'
)
GROUP BY category_code
ORDER BY category_code;

-- 4. Verify permissions created (should be 4)
SELECT permission_code, permission_name_en
FROM permissions
WHERE module_code = 'PARTIES'
ORDER BY sort_order;

-- 5. Verify RLS enabled on all 29 tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'customers', 'vendors', 'subcontractors', 'consultants', 'government_authorities', 'recruitment_agencies',
    'customer_contacts', 'vendor_contacts', 'subcontractor_contacts', 'consultant_contacts', 'government_authority_contacts', 'recruitment_agency_contacts',
    'customer_addresses', 'vendor_addresses', 'subcontractor_addresses', 'consultant_addresses', 'government_authority_addresses', 'recruitment_agency_addresses',
    'customer_documents', 'vendor_documents', 'subcontractor_documents', 'consultant_documents', 'government_authority_documents', 'recruitment_agency_documents',
    'customer_bank_details', 'vendor_bank_details', 'subcontractor_bank_details', 'consultant_bank_details', 'recruitment_agency_bank_details'
  )
  AND rowsecurity = true;

-- 6. Verify numbering document types created (should be 6)
SELECT document_type_code, document_type_name_en, default_prefix
FROM numbering_document_types
WHERE document_type_code IN ('CUSTOMER', 'VENDOR', 'SUBCONTRACTOR', 'CONSULTANT', 'GOVERNMENT_AUTHORITY', 'RECRUITMENT_AGENCY');

-- 7. Verify numbering rules created (should be 6)
SELECT rule_code, rule_name_en, document_type_code, prefix
FROM numbering_rules
WHERE document_type_code IN ('CUSTOMER', 'VENDOR', 'SUBCONTRACTOR', 'CONSULTANT', 'GOVERNMENT_AUTHORITY', 'RECRUITMENT_AGENCY')
  AND is_default = true;

*/

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

-- Migration Complete: 29 tables, 22 lookup categories, ~130 lookup values,
-- 4 grouped permissions, ~174 RLS policies, numbering system integration

-- ============================================================================
-- IMPORTANT: THIS SQL FILE IS FOR REVIEW ONLY
-- It has NOT been applied to the database.
-- Sameer/Dina review and approval required before application.
-- ============================================================================
