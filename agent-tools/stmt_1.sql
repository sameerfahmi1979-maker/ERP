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