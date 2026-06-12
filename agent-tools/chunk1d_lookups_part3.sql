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