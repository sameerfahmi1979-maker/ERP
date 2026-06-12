INSERT INTO global_lookup_categories (
  category_code, category_name_en, category_name_ar, description, 
  module_code, is_system, is_locked, sort_order
) VALUES
-- PARTY_STATUS_TYPES
('PARTY_STATUS_TYPES', 'Party Status Types', 'أنواع حالة الطرف', 
 'Common status values for all party entities', 
 'PARTIES', true, true, 10),

-- CUSTOMER_TYPES
('CUSTOMER_TYPES', 'Customer Types', 'أنواع العملاء', 
 'Customer classification types (REV1 expanded for government/utility/industrial customers)', 
 'PARTIES', true, false, 20),

-- CUSTOMER_SEGMENTS
('CUSTOMER_SEGMENTS', 'Customer Segments', 'شرائح العملاء', 
 'Customer segmentation for CRM and sales strategy', 
 'PARTIES', false, false, 30),

-- VENDOR_TYPES
('VENDOR_TYPES', 'Vendor Types', 'أنواع الموردين', 
 'Vendor classification types (REV1 expanded for transporters/logistics/waste disposal)', 
 'PARTIES', true, false, 40),

-- VENDOR_CATEGORIES
('VENDOR_CATEGORIES', 'Vendor Categories', 'فئات الموردين', 
 'Vendor categorization for procurement', 
 'PARTIES', false, false, 50),

-- SUPPLIER_CATEGORIES
('SUPPLIER_CATEGORIES', 'Supplier Categories', 'فئات الموردين', 
 'Supplier categorization for material/equipment suppliers', 
 'PARTIES', false, false, 60),

-- SUBCONTRACTOR_TYPES
('SUBCONTRACTOR_TYPES', 'Subcontractor Types', 'أنواع المقاولين من الباطن', 
 'Subcontractor classification types (REV1 expanded for transport subcontractors)', 
 'PARTIES', true, false, 70),

-- SUBCONTRACTOR_CATEGORIES
('SUBCONTRACTOR_CATEGORIES', 'Subcontractor Categories', 'فئات المقاولين من الباطن', 
 'Subcontractor categorization for project management', 
 'PARTIES', false, false, 80),

-- CONSULTANT_TYPES
('CONSULTANT_TYPES', 'Consultant Types', 'أنواع الاستشاريين', 
 'Consultant classification types (REV1 expanded for audit consultants)', 
 'PARTIES', true, false, 90),

-- CONSULTANT_CATEGORIES
('CONSULTANT_CATEGORIES', 'Consultant Categories', 'فئات الاستشاريين', 
 'Consultant categorization for professional services', 
 'PARTIES', false, false, 100),

-- GOVERNMENT_AUTHORITY_TYPES
('GOVERNMENT_AUTHORITY_TYPES', 'Government Authority Types', 'أنواع الجهات الحكومية', 
 'Government authority classification (REV1 expanded for license/permit issuers, utility/transport authorities)', 
 'PARTIES', true, false, 110),

-- GOVERNMENT_AUTHORITY_CATEGORIES
('GOVERNMENT_AUTHORITY_CATEGORIES', 'Government Authority Categories', 'فئات الجهات الحكومية', 
 'Government authority categorization for compliance', 
 'PARTIES', false, false, 120),

-- JURISDICTION_LEVEL_TYPES
('JURISDICTION_LEVEL_TYPES', 'Jurisdiction Level Types', 'أنواع مستويات الاختصاص', 
 'Jurisdiction levels for government authorities', 
 'PARTIES', true, false, 130),

-- RECRUITMENT_AGENCY_TYPES
('RECRUITMENT_AGENCY_TYPES', 'Recruitment Agency Types', 'أنواع وكالات التوظيف',
 'Recruitment agency classification types',
 'PARTIES', true, false, 140),

-- ICV_STATUS_TYPES
('ICV_STATUS_TYPES', 'ICV Certificate Status Types', 'أنواع حالة شهادة ICV',
 'ICV (In-Country Value) certificate status types',
 'COMPLIANCE', true, false, 150),

-- RECRUITMENT_AGENCY_CATEGORIES
('RECRUITMENT_AGENCY_CATEGORIES', 'Recruitment Agency Categories', 'فئات وكالات التوظيف', 
 'Recruitment agency categorization for HR', 
 'PARTIES', false, false, 150),

-- INDUSTRY_TYPES
('INDUSTRY_TYPES', 'Industry Types', 'أنواع الصناعات', 
 'Industry classification for customers and business analysis', 
 'PARTIES', false, false, 160),

-- CRM_LEAD_SOURCES
('CRM_LEAD_SOURCES', 'CRM Lead Sources', 'مصادر العملاء المحتملين', 
 'Lead sources for CRM and sales tracking', 
 'PARTIES', false, false, 170),

-- CONTACT_TYPES
('CONTACT_TYPES', 'Contact Types', 'أنواع جهات الاتصال', 
 'Contact person types for relationship management', 
 'PARTIES', false, false, 180),

-- COMMUNICATION_PREFERENCE_TYPES
('COMMUNICATION_PREFERENCE_TYPES', 'Communication Preference Types', 'أنواع تفضيلات الاتصال', 
 'Preferred communication methods for contacts', 
 'PARTIES', false, false, 190),

-- ADDRESS_TYPES
('ADDRESS_TYPES', 'Address Types', 'أنواع العناوين', 
 'Address types for party entities', 
 'PARTIES', false, false, 200),

-- PARTY_DOCUMENT_TYPES
('PARTY_DOCUMENT_TYPES', 'Party Document Types', 'أنواع مستندات الطرف', 
 'Document types for party entities', 
 'PARTIES', false, false, 210),

-- BANK_ACCOUNT_TYPES
('BANK_ACCOUNT_TYPES', 'Bank Account Types', 'أنواع الحسابات المصرفية', 
 'Bank account types for payment processing', 
 'PARTIES', false, false, 220)

ON CONFLICT (category_code) 
DO UPDATE SET 
  category_name_en = EXCLUDED.category_name_en,
  category_name_ar = EXCLUDED.category_name_ar,
  description = EXCLUDED.description,
  module_code = EXCLUDED.module_code,
  updated_at = now();
