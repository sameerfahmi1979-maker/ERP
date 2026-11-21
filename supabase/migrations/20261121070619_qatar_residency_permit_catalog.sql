BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';

DO $catalog$
DECLARE
  hr_category bigint;
  permit_type bigint;
BEGIN
  SELECT id INTO STRICT hr_category
  FROM public.dms_document_categories
  WHERE category_code = 'HR' AND is_active AND deleted_at IS NULL
  FOR KEY SHARE;

  IF EXISTS (
    SELECT 1 FROM public.dms_document_types
    WHERE upper(type_code) = 'FOREIGN_IMMIGRATION_CREDENTIAL'
  ) THEN
    RAISE EXCEPTION 'Existing foreign immigration type requires reconciliation';
  END IF;

  INSERT INTO public.dms_document_types (
    type_code, name_en, name_ar, category_id, description,
    requires_expiry_tracking, default_confidentiality, requires_approval,
    allowed_entity_types, is_system, is_active, is_renewable
  )
  VALUES (
    'FOREIGN_IMMIGRATION_CREDENTIAL', 'Qatar Residency Permit', 'رخصة إقامة قطرية', hr_category,
    'State of Qatar bilingual Residency Permit with work residency on the reverse. Front Expiry is the permit expiry. Passport Expiry belongs to the quoted passport. Issued residence credential, distinct from entry and visit visas.',
    true, 'hr', true, ARRAY['employee']::text[], false, true, false
  )
  RETURNING id INTO permit_type;

  INSERT INTO public.dms_metadata_definitions (
    document_type_id, field_code, field_label_en, field_label_ar,
    field_type, is_required, is_ai_extractable, ai_field_hint,
    sort_order, show_in_review, show_in_detail, show_in_list, show_in_upload_review,
    is_searchable, is_filterable
  )
  SELECT permit_type, code, label_en, label_ar, value_type, required, true, hint,
    ordinal, true, true, false, true, false, false
  FROM (VALUES
    (1, 'issuer_country', 'Issuing country', 'دولة الإصدار', 'text', true,
      'Use QA only from the heading State of Qatar. Holder nationality is a separate field.'),
    (2, 'credential_kind', 'Credential kind', 'نوع الوثيقة', 'text', true,
      'Use residence_permit only for the printed Qatar Residency Permit heading.'),
    (3, 'printed_title', 'Printed document title', 'عنوان الوثيقة', 'text', true,
      'Read the state and permit title on the front.'),
    (4, 'holder_name_printed_en', 'Holder Name (English)', 'اسم حامل البطاقة بالإنجليزية', 'text', true,
      'Use the full printed Name on the front. Preserve all printed components.'),
    (5, 'holder_name_printed_ar', 'Holder Name (Arabic)', 'اسم حامل البطاقة بالعربية', 'text', false,
      'Use the front Arabic name as printed, even when shorter than the English name.'),
    (6, 'qatar_personal_id', 'Qatar Personal ID', 'الرقم الشخصي', 'text', true,
      'Use the value by ID.No on the front. Keep the complete printed digits as text.'),
    (7, 'permit_card_serial', 'Permit Card Serial', 'الرقم المسلسل', 'text', true,
      'Use the full Serial No on the reverse, including any digits shared with the Qatar Personal ID.'),
    (8, 'permit_expiry_date', 'Permit Expiry', 'تاريخ انتهاء الإقامة', 'date', true,
      'Use the front field Expiry. Read DD/MM/YYYY and return ISO YYYY-MM-DD.'),
    (9, 'supporting_passport_expiry_date', 'Passport Expiry', 'تاريخ انتهاء الجواز', 'date', true,
      'Use Passport Expiry on the reverse. Read DD/MM/YYYY and return ISO YYYY-MM-DD.'),
    (10, 'supporting_passport_number', 'Supporting Passport Number', 'رقم جواز السفر', 'text', false,
      'Use Passport Number on the reverse. Preserve letters and leading zeros.'),
    (11, 'residency_type_raw', 'Printed Residency Type', 'نوع الرخصة كما طبع', 'text', true,
      'Use the exact text printed beside Residency Type on the reverse.'),
    (12, 'residency_type', 'Residency Type', 'نوع الرخصة', 'text', true,
      'Use work for the explicit printed Arabic value عمل.'),
    (13, 'printed_employer_ar', 'Printed Qatar Employer', 'المستقدم', 'text', false,
      'Preserve the reverse Employer wording. Current ERP sponsorship uses separate evidence.'),
    (14, 'date_of_birth', 'Date of Birth', 'تاريخ الميلاد', 'date', false,
      'Use D.O.B. on the front. Read DD/MM/YYYY and return ISO YYYY-MM-DD.'),
    (15, 'nationality', 'Holder Nationality', 'الجنسية', 'text', false,
      'Use the nationality printed on the front. Keep it separate from the issuing country.'),
    (16, 'occupation_raw', 'Printed Occupation', 'المهنة', 'text', false,
      'Preserve the printed wording next to Occupation.'),
    (17, 'issuing_authority_raw', 'Printed Issuing Authority', 'جهة الإصدار', 'text', false,
      'Use the authority name visible on the original. Preserve it as source evidence.'),
    (18, 'issuing_official_title', 'Issuing Official Title', 'صفة المسؤول الموقّع', 'text', false,
      'Use the title printed beside the issuing sign-off on the reverse.'),
    (19, 'holder_signature_present', 'Holder Signature Visible', 'وجود توقيع حامل البطاقة', 'boolean', false,
      'Capture the presence of a visible holder signature. This records visual evidence.')
  ) AS field(ordinal, code, label_en, label_ar, value_type, required, hint);
END
$catalog$;

COMMIT;
