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

