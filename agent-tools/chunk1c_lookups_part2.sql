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