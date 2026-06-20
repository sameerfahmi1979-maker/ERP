-- ============================================================================
-- ERP DMS ARABIC FIX.1 — Arabic Language Enhancement
-- Date: 2026-06-17
-- Scope:
--   FIX 3: Trigram index on content_text for Arabic fuzzy search
--   FIX 4: Arabic label column on dms_metadata_definitions + seed common labels
--   FIX 6: Arabic document types in dms_document_types
-- ============================================================================

-- ============================================================================
-- FIX 3: pg_trgm extension + Arabic-friendly trigram index on content_text
-- ============================================================================

-- Enable pg_trgm if not already enabled (safe to re-run)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index for Arabic fuzzy search on content_text
-- Allows: WHERE content_text ILIKE '%محمد%' and similarity-based search
CREATE INDEX IF NOT EXISTS idx_dms_document_content_trgm
  ON public.dms_document_content
  USING gin (content_text gin_trgm_ops);

-- Also add trigram index on dms_documents.title and ai_summary for Arabic title search
CREATE INDEX IF NOT EXISTS idx_dms_documents_title_trgm
  ON public.dms_documents
  USING gin (title gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dms_documents_ai_summary_trgm
  ON public.dms_documents
  USING gin (ai_summary gin_trgm_ops)
  WHERE deleted_at IS NULL AND ai_summary IS NOT NULL;

-- ============================================================================
-- FIX 4: Arabic label column on dms_metadata_definitions
-- ============================================================================

ALTER TABLE public.dms_metadata_definitions
  ADD COLUMN IF NOT EXISTS label_ar TEXT;

COMMENT ON COLUMN public.dms_metadata_definitions.label_ar IS
  'Arabic label for this metadata field. Used in bilingual DMS UI.';

-- Seed Arabic labels for common metadata fields (update where field_code matches)
UPDATE public.dms_metadata_definitions SET label_ar = 'رقم الهوية'            WHERE field_code = 'id_number';
UPDATE public.dms_metadata_definitions SET label_ar = 'تاريخ الانتهاء'        WHERE field_code = 'expiry_date';
UPDATE public.dms_metadata_definitions SET label_ar = 'تاريخ الإصدار'         WHERE field_code = 'issue_date';
UPDATE public.dms_metadata_definitions SET label_ar = 'الاسم الكامل'           WHERE field_code = 'full_name';
UPDATE public.dms_metadata_definitions SET label_ar = 'الرقم المرجعي'          WHERE field_code = 'reference_number';
UPDATE public.dms_metadata_definitions SET label_ar = 'رقم الجواز'             WHERE field_code = 'passport_number';
UPDATE public.dms_metadata_definitions SET label_ar = 'الجنسية'                WHERE field_code = 'nationality';
UPDATE public.dms_metadata_definitions SET label_ar = 'تاريخ الميلاد'          WHERE field_code = 'date_of_birth';
UPDATE public.dms_metadata_definitions SET label_ar = 'الجنس'                  WHERE field_code = 'gender';
UPDATE public.dms_metadata_definitions SET label_ar = 'رقم التسجيل الضريبي'   WHERE field_code = 'trn';
UPDATE public.dms_metadata_definitions SET label_ar = 'رقم الرخصة'             WHERE field_code = 'license_number';
UPDATE public.dms_metadata_definitions SET label_ar = 'النشاط التجاري'         WHERE field_code = 'business_activity';
UPDATE public.dms_metadata_definitions SET label_ar = 'رقم الترخيص'            WHERE field_code = 'license_no';
UPDATE public.dms_metadata_definitions SET label_ar = 'اسم الشركة'             WHERE field_code = 'company_name';
UPDATE public.dms_metadata_definitions SET label_ar = 'العنوان'                WHERE field_code = 'address';
UPDATE public.dms_metadata_definitions SET label_ar = 'رقم الهاتف'             WHERE field_code = 'phone_number';
UPDATE public.dms_metadata_definitions SET label_ar = 'البريد الإلكتروني'      WHERE field_code = 'email';
UPDATE public.dms_metadata_definitions SET label_ar = 'قيمة العقد'             WHERE field_code = 'contract_value';
UPDATE public.dms_metadata_definitions SET label_ar = 'مبلغ الفاتورة'          WHERE field_code = 'invoice_amount';
UPDATE public.dms_metadata_definitions SET label_ar = 'رقم الفاتورة'           WHERE field_code = 'invoice_number';
UPDATE public.dms_metadata_definitions SET label_ar = 'اسم المريض'             WHERE field_code = 'patient_name';
UPDATE public.dms_metadata_definitions SET label_ar = 'نتيجة الفحص'            WHERE field_code = 'medical_result';
UPDATE public.dms_metadata_definitions SET label_ar = 'المسمى الوظيفي'          WHERE field_code = 'job_title';
UPDATE public.dms_metadata_definitions SET label_ar = 'صاحب العمل'              WHERE field_code = 'employer_name';
UPDATE public.dms_metadata_definitions SET label_ar = 'رقم الوثيقة'             WHERE field_code = 'document_number';

-- ============================================================================
-- FIX 6: Arabic / bilingual UAE document types
-- ============================================================================

-- Add name_ar column to dms_document_types if not present
ALTER TABLE public.dms_document_types
  ADD COLUMN IF NOT EXISTS name_ar TEXT;

COMMENT ON COLUMN public.dms_document_types.name_ar IS
  'Arabic display name for this document type.';

-- Update existing types with Arabic names
UPDATE public.dms_document_types SET name_ar = 'بطاقة الهوية الإماراتية'      WHERE type_code = 'EMIRATES_ID';
UPDATE public.dms_document_types SET name_ar = 'جواز سفر'                     WHERE type_code = 'PASSPORT';
UPDATE public.dms_document_types SET name_ar = 'رخصة تجارية'                  WHERE type_code = 'TRADE_LICENSE';
UPDATE public.dms_document_types SET name_ar = 'تأشيرة / إقامة'               WHERE type_code = 'VISA_RESIDENCE';
UPDATE public.dms_document_types SET name_ar = 'فاتورة ضريبية'                 WHERE type_code = 'TAX_INVOICE';
UPDATE public.dms_document_types SET name_ar = 'عقد'                          WHERE type_code = 'CONTRACT';
UPDATE public.dms_document_types SET name_ar = 'شهادة'                        WHERE type_code = 'CERTIFICATE';
UPDATE public.dms_document_types SET name_ar = 'عقد إيجار'                    WHERE type_code = 'TENANCY_CONTRACT';
UPDATE public.dms_document_types SET name_ar = 'تقرير طبي'                    WHERE type_code = 'MEDICAL_REPORT';
UPDATE public.dms_document_types SET name_ar = 'وكالة قانونية'                WHERE type_code = 'POWER_OF_ATTORNEY';
UPDATE public.dms_document_types SET name_ar = 'شهادة ضريبية'                 WHERE type_code = 'VAT_CERTIFICATE';
UPDATE public.dms_document_types SET name_ar = 'شهادة الرقم الضريبي'          WHERE type_code = 'TRN_CERTIFICATE';
UPDATE public.dms_document_types SET name_ar = 'تقرير فني'                    WHERE type_code = 'TECHNICAL_REPORT';
UPDATE public.dms_document_types SET name_ar = 'تقرير التفتيش'                WHERE type_code = 'INSPECTION_REPORT';
UPDATE public.dms_document_types SET name_ar = 'وثيقة تأمين'                  WHERE type_code = 'INSURANCE_POLICY';
UPDATE public.dms_document_types SET name_ar = 'شهادة صحية / لياقة'           WHERE type_code = 'MEDICAL_FITNESS';
UPDATE public.dms_document_types SET name_ar = 'تصريح عمل'                    WHERE type_code = 'WORK_PERMIT';
UPDATE public.dms_document_types SET name_ar = 'عقد توريد'                    WHERE type_code = 'SUPPLY_CONTRACT';

-- Insert new Arabic-specific document types (only if they don't exist)
DO $$
DECLARE
  default_category_id BIGINT;
BEGIN
  -- Get a sensible default category (HR or first active category)
  SELECT id INTO default_category_id
  FROM public.dms_document_categories
  WHERE is_active = true
  ORDER BY sort_order ASC, id ASC
  LIMIT 1;

  IF default_category_id IS NULL THEN
    SELECT id INTO default_category_id FROM public.dms_document_categories LIMIT 1;
  END IF;

  -- Insert Arabic-specific types that may not exist
  INSERT INTO public.dms_document_types (
    type_code, name_en, name_ar, category_id,
    requires_expiry_tracking, is_active, sort_order,
    created_at, updated_at
  )
  VALUES
    ('LABOR_CONTRACT_AR',     'Labor Contract (Arabic)',          'عقد عمل',                   default_category_id, false, true, 900, now(), now()),
    ('SALARY_CERTIFICATE_AR', 'Salary Certificate',               'شهادة راتب',                default_category_id, false, true, 901, now(), now()),
    ('BANK_STATEMENT_AR',     'Bank Statement',                   'كشف حساب بنكي',             default_category_id, false, true, 902, now(), now()),
    ('COMMERCIAL_REGISTER_AR','Commercial Register',              'السجل التجاري',             default_category_id, false, true, 903, now(), now()),
    ('EJARI_CONTRACT',        'EJARI / Tenancy Registration',     'عقد إيجار مسجل (إيجاري)',   default_category_id, true,  true, 904, now(), now()),
    ('LABOR_CARD_AR',         'Labor Card / Work Permit Card',    'بطاقة العمل',               default_category_id, true,  true, 905, now(), now()),
    ('ESTABLISHMENT_CARD',    'Establishment Immigration Card',   'بطاقة المنشأة',             default_category_id, true,  true, 906, now(), now()),
    ('COMPANY_PROFILE_AR',    'Company Profile (Arabic)',         'ملف الشركة',                default_category_id, false, true, 907, now(), now()),
    ('MEMORANDUM_ASSOC_AR',   'Memorandum of Association',        'عقد التأسيس / النظام الأساسي',default_category_id, false, true, 908, now(), now()),
    ('HSE_PERMIT_AR',         'HSE Work Permit',                  'تصريح السلامة',             default_category_id, true,  true, 909, now(), now())
  ON CONFLICT (type_code) DO UPDATE SET
    name_ar  = EXCLUDED.name_ar,
    updated_at = now();

END $$;
