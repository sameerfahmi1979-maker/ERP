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