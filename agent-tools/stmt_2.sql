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