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