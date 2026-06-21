-- ============================================================================
-- ERP DMS.METADATA.1 — HR compliance document type metadata definitions
-- Migration: 20260620170000_erp_dms_metadata_hr_compliance_seed.sql
-- Scope:
--   Seed dms_metadata_definitions for HR intake / compliance document types
--   that were registered in DMS.2 but never given metadata fields:
--   VISA, MEDICAL_INSURANCE, LABOUR_CARD, LABOR_CARD_AR, DRIVING_LICENSE
-- Aligned with:
--   - employee_identity_documents / employee_medical_insurances columns
--   - src/lib/dms/standard-file-name.ts DOC_NO / owner field priorities
--   - src/lib/hr/compliance/dms-to-identity-map.ts extraction keys
-- ============================================================================

-- ── VISA (UAE residence visa / residency permit) ─────────────────────────────
INSERT INTO dms_metadata_definitions
  (document_type_id, field_code, field_label_en, field_label_ar, field_type, is_required, is_ai_extractable, ai_field_hint, sort_order)
SELECT dt.id, f.field_code, f.label_en, f.label_ar, f.field_type, f.required, f.ai_ext, f.hint, f.sort
FROM dms_document_types dt,
(VALUES
  ('visa_holder_name',   'Visa Holder Name',      'اسم حامل التأشيرة',       'text', true,  true, 'Full name of the visa holder as printed on the visa sticker or entry permit', 1),
  ('full_name_en',       'Full Name (English)',   'الاسم الكامل (إنجليزي)',  'text', false, true, 'English name if different from visa_holder_name',                               2),
  ('full_name_ar',       'Full Name (Arabic)',    'الاسم الكامل (عربي)',     'text', false, true, 'Arabic name as printed on the visa',                                           3),
  ('emirates_id_number', 'Emirates ID Number',    'رقم الهوية الإماراتية',   'text', false, true, '15-digit Emirates ID if printed (784-XXXX-XXXXXXX-X)',                          4),
  ('passport_number',    'Passport Number',       'رقم جواز السفر',          'text', false, true, 'Passport number referenced on the visa',                                        5),
  ('nationality',        'Nationality',           'الجنسية',                 'text', false, true, 'Nationality of the visa holder',                                                6),
  ('uid_number',         'UID Number',            'الرقم الموحد',            'text', false, true, 'UAE Unified Number (UID) if shown',                                             7),
  ('visa_file_number',   'Visa File Number',      'رقم ملف التأشيرة',        'text', true,  true, 'Visa file number — primary reference on UAE residence visas',                   8),
  ('visa_number',        'Visa Number',           'رقم التأشيرة',            'text', false, true, 'Visa number if distinct from file number',                                      9),
  ('sponsor_name',       'Sponsor Name',          'اسم الكفيل',              'text', false, true, 'Employer or sponsor company/person name',                                      10),
  ('profession',         'Profession',            'المسمى الوظيفي',          'text', false, true, 'Profession / occupation on the visa',                                          11),
  ('issue_date',         'Issue Date',            'تاريخ الإصدار',           'date', false, true, 'Visa issue date',                                                              12),
  ('expiry_date',        'Expiry Date',           'تاريخ الانتهاء',          'date', true,  true, 'Visa expiry / valid-until date',                                               13),
  ('issuing_authority',  'Issuing Authority',     'جهة الإصدار',             'text', false, true, 'Issuing authority (GDRFA, ICP, MOHRE, etc.)',                                14),
  ('place_of_issue',     'Place of Issue',        'مكان الإصدار',            'text', false, true, 'Emirate or city where the visa was issued',                                    15)
) AS f(field_code, label_en, label_ar, field_type, required, ai_ext, hint, sort)
WHERE dt.type_code = 'VISA'
  AND dt.deleted_at IS NULL
ON CONFLICT (document_type_id, field_code) DO UPDATE SET
  field_label_en = EXCLUDED.field_label_en,
  field_label_ar = EXCLUDED.field_label_ar,
  field_type = EXCLUDED.field_type,
  is_required = EXCLUDED.is_required,
  is_ai_extractable = EXCLUDED.is_ai_extractable,
  ai_field_hint = EXCLUDED.ai_field_hint,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  deleted_at = NULL,
  updated_at = now();

-- ── MEDICAL_INSURANCE (UAE health insurance card / policy) ───────────────────
INSERT INTO dms_metadata_definitions
  (document_type_id, field_code, field_label_en, field_label_ar, field_type, is_required, is_ai_extractable, ai_field_hint, sort_order)
SELECT dt.id, f.field_code, f.label_en, f.label_ar, f.field_type, f.required, f.ai_ext, f.hint, f.sort
FROM dms_document_types dt,
(VALUES
  ('member_name',            'Member Name',              'اسم المؤمن عليه',         'text',   true,  true, 'Name of the insured member / cardholder',                              1),
  ('insurance_card_number',  'Insurance Card Number',    'رقم بطاقة التأمين',       'text',   true,  true, 'Health insurance card / member ID number (primary reference)',         2),
  ('policy_number',          'Policy Number',            'رقم الوثيقة',             'text',   true,  true, 'Group or individual policy number',                                    3),
  ('insurance_provider',     'Insurance Provider',       'شركة التأمين',            'text',   true,  true, 'Insurance company name (e.g. Daman, ADNIC, Orient)',                   4),
  ('tpa',                    'TPA',                      'المسؤول عن المطالبات',    'text',   false, true, 'Third Party Administrator if shown separately from insurer',           5),
  ('network_class',          'Network Class',            'فئة الشبكة',              'text',   false, true, 'Network tier or plan class (Gold, Silver, Enhanced, etc.)',           6),
  ('issue_date',             'Issue Date',               'تاريخ الإصدار',           'date',   false, true, 'Policy / card effective or issue date',                                7),
  ('expiry_date',            'Expiry Date',              'تاريخ الانتهاء',          'date',   true,  true, 'Policy / card expiry date',                                            8),
  ('dependent_count_covered','Dependents Covered',       'عدد المعالين',            'number', false, true, 'Number of dependents covered if stated on the card',                   9),
  ('employee_covered',       'Employee Covered',         'تغطية الموظف',            'boolean',false, true, 'Whether the principal employee is covered',                           10)
) AS f(field_code, label_en, label_ar, field_type, required, ai_ext, hint, sort)
WHERE dt.type_code = 'MEDICAL_INSURANCE'
  AND dt.deleted_at IS NULL
ON CONFLICT (document_type_id, field_code) DO UPDATE SET
  field_label_en = EXCLUDED.field_label_en,
  field_label_ar = EXCLUDED.field_label_ar,
  field_type = EXCLUDED.field_type,
  is_required = EXCLUDED.is_required,
  is_ai_extractable = EXCLUDED.is_ai_extractable,
  ai_field_hint = EXCLUDED.ai_field_hint,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  deleted_at = NULL,
  updated_at = now();

-- ── LABOUR_CARD (MOHRE labour card / work permit card) ───────────────────────
INSERT INTO dms_metadata_definitions
  (document_type_id, field_code, field_label_en, field_label_ar, field_type, is_required, is_ai_extractable, ai_field_hint, sort_order)
SELECT dt.id, f.field_code, f.label_en, f.label_ar, f.field_type, f.required, f.ai_ext, f.hint, f.sort
FROM dms_document_types dt,
(VALUES
  ('full_name_en',        'Full Name (English)',   'الاسم الكامل (إنجليزي)',  'text', true,  true, 'Employee name as printed on the labour card',                         1),
  ('full_name_ar',        'Full Name (Arabic)',    'الاسم الكامل (عربي)',     'text', false, true, 'Arabic name on the labour card',                                      2),
  ('labour_card_number',  'Labour Card Number',    'رقم بطاقة العمل',         'text', true,  true, 'MOHRE labour card number — primary reference',                        3),
  ('work_permit_number',  'Work Permit Number',    'رقم تصريح العمل',         'text', false, true, 'Work permit number if distinct from labour card number',              4),
  ('mohre_person_code',   'MOHRE Person Code',     'رمز الشخص لدى وزارة العمل','text', false, true, 'MOHRE person / establishment person code',                           5),
  ('emirates_id_number',  'Emirates ID Number',    'رقم الهوية الإماراتية',   'text', false, true, 'Emirates ID if printed on the card',                                  6),
  ('nationality',         'Nationality',           'الجنسية',                 'text', false, true, 'Nationality of the employee',                                         7),
  ('employer_name',       'Employer Name',         'اسم صاحب العمل',          'text', false, true, 'Employer / sponsor company name',                                     8),
  ('profession',          'Profession',            'المسمى الوظيفي',          'text', false, true, 'Job title / profession on the labour card',                           9),
  ('issue_date',          'Issue Date',            'تاريخ الإصدار',           'date', false, true, 'Labour card issue date',                                             10),
  ('expiry_date',         'Expiry Date',           'تاريخ الانتهاء',          'date', true,  true, 'Labour card expiry date',                                            11),
  ('issuing_authority',   'Issuing Authority',     'جهة الإصدار',             'text', false, true, 'Issuing authority (typically MOHRE)',                                12)
) AS f(field_code, label_en, label_ar, field_type, required, ai_ext, hint, sort)
WHERE dt.type_code = 'LABOUR_CARD'
  AND dt.deleted_at IS NULL
ON CONFLICT (document_type_id, field_code) DO UPDATE SET
  field_label_en = EXCLUDED.field_label_en,
  field_label_ar = EXCLUDED.field_label_ar,
  field_type = EXCLUDED.field_type,
  is_required = EXCLUDED.is_required,
  is_ai_extractable = EXCLUDED.is_ai_extractable,
  ai_field_hint = EXCLUDED.ai_field_hint,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  deleted_at = NULL,
  updated_at = now();

-- ── LABOR_CARD_AR (Arabic-labelled labour card type — same field set) ────────
INSERT INTO dms_metadata_definitions
  (document_type_id, field_code, field_label_en, field_label_ar, field_type, is_required, is_ai_extractable, ai_field_hint, sort_order)
SELECT dt.id, f.field_code, f.label_en, f.label_ar, f.field_type, f.required, f.ai_ext, f.hint, f.sort
FROM dms_document_types dt,
(VALUES
  ('full_name_en',        'Full Name (English)',   'الاسم الكامل (إنجليزي)',  'text', true,  true, 'Employee name as printed on the labour card',                         1),
  ('full_name_ar',        'Full Name (Arabic)',    'الاسم الكامل (عربي)',     'text', false, true, 'Arabic name on the labour card',                                      2),
  ('labour_card_number',  'Labour Card Number',    'رقم بطاقة العمل',         'text', true,  true, 'MOHRE labour card number — primary reference',                        3),
  ('work_permit_number',  'Work Permit Number',    'رقم تصريح العمل',         'text', false, true, 'Work permit number if distinct from labour card number',              4),
  ('mohre_person_code',   'MOHRE Person Code',     'رمز الشخص لدى وزارة العمل','text', false, true, 'MOHRE person / establishment person code',                           5),
  ('emirates_id_number',  'Emirates ID Number',    'رقم الهوية الإماراتية',   'text', false, true, 'Emirates ID if printed on the card',                                  6),
  ('nationality',         'Nationality',           'الجنسية',                 'text', false, true, 'Nationality of the employee',                                         7),
  ('employer_name',       'Employer Name',         'اسم صاحب العمل',          'text', false, true, 'Employer / sponsor company name',                                     8),
  ('profession',          'Profession',            'المسمى الوظيفي',          'text', false, true, 'Job title / profession on the labour card',                           9),
  ('issue_date',          'Issue Date',            'تاريخ الإصدار',           'date', false, true, 'Labour card issue date',                                             10),
  ('expiry_date',         'Expiry Date',           'تاريخ الانتهاء',          'date', true,  true, 'Labour card expiry date',                                            11),
  ('issuing_authority',   'Issuing Authority',     'جهة الإصدار',             'text', false, true, 'Issuing authority (typically MOHRE)',                                12)
) AS f(field_code, label_en, label_ar, field_type, required, ai_ext, hint, sort)
WHERE dt.type_code = 'LABOR_CARD_AR'
  AND dt.deleted_at IS NULL
ON CONFLICT (document_type_id, field_code) DO UPDATE SET
  field_label_en = EXCLUDED.field_label_en,
  field_label_ar = EXCLUDED.field_label_ar,
  field_type = EXCLUDED.field_type,
  is_required = EXCLUDED.is_required,
  is_ai_extractable = EXCLUDED.is_ai_extractable,
  ai_field_hint = EXCLUDED.ai_field_hint,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  deleted_at = NULL,
  updated_at = now();

-- ── DRIVING_LICENSE (UAE driving licence) ────────────────────────────────────
INSERT INTO dms_metadata_definitions
  (document_type_id, field_code, field_label_en, field_label_ar, field_type, is_required, is_ai_extractable, ai_field_hint, sort_order)
SELECT dt.id, f.field_code, f.label_en, f.label_ar, f.field_type, f.required, f.ai_ext, f.hint, f.sort
FROM dms_document_types dt,
(VALUES
  ('full_name_en',          'Full Name (English)',     'الاسم الكامل (إنجليزي)',  'text', true,  true, 'License holder name in English',                                      1),
  ('full_name_ar',          'Full Name (Arabic)',      'الاسم الكامل (عربي)',     'text', false, true, 'License holder name in Arabic',                                       2),
  ('license_number',        'License Number',          'رقم الرخصة',              'text', true,  true, 'Driving licence number — primary reference',                          3),
  ('traffic_file_number',   'Traffic File Number',     'رقم الملف المروري',       'text', false, true, 'UAE traffic file number if shown',                                    4),
  ('emirates_id_number',    'Emirates ID Number',      'رقم الهوية الإماراتية',   'text', false, true, 'Emirates ID if printed on the licence',                               5),
  ('nationality',           'Nationality',             'الجنسية',                 'text', false, true, 'Nationality of the licence holder',                                   6),
  ('date_of_birth',         'Date of Birth',           'تاريخ الميلاد',           'date', false, true, 'Date of birth as on the licence',                                     7),
  ('license_category',      'License Category',        'فئة الرخصة',              'text', false, true, 'Vehicle categories permitted (e.g. Light Vehicle, Heavy)',            8),
  ('issue_date',            'Issue Date',              'تاريخ الإصدار',           'date', false, true, 'Licence issue date',                                                  9),
  ('expiry_date',           'Expiry Date',             'تاريخ الانتهاء',          'date', true,  true, 'Licence expiry date',                                                10),
  ('issuing_authority',     'Issuing Authority',       'جهة الإصدار',             'text', false, true, 'Issuing traffic department / emirate RTA',                           11),
  ('place_of_issue',        'Place of Issue',          'مكان الإصدار',            'text', false, true, 'Emirate or city where the licence was issued',                       12)
) AS f(field_code, label_en, label_ar, field_type, required, ai_ext, hint, sort)
WHERE dt.type_code = 'DRIVING_LICENSE'
  AND dt.deleted_at IS NULL
ON CONFLICT (document_type_id, field_code) DO UPDATE SET
  field_label_en = EXCLUDED.field_label_en,
  field_label_ar = EXCLUDED.field_label_ar,
  field_type = EXCLUDED.field_type,
  is_required = EXCLUDED.is_required,
  is_ai_extractable = EXCLUDED.is_ai_extractable,
  ai_field_hint = EXCLUDED.ai_field_hint,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  deleted_at = NULL,
  updated_at = now();
