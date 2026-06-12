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

