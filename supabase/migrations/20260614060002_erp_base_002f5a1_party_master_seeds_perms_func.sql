-- ERP BASE 002F.5A.1 — Party Master Database Foundation
-- Part 3 of 3: Seed data, Numbering rules, Permissions, Role mappings, Duplicate function
-- Source: ERP_BASE_002F_5A_V3_PARTY_MASTER_DRAFT_MIGRATION_REVIEW_ONLY_SUPABASE_VERIFIED.sql
-- Applied: 2026-06-14


-- =============================================================================
-- SECTION 11: SEED DATA
-- =============================================================================

-- 11.1 party_types
INSERT INTO party_types (type_code, type_name, type_name_ar, is_system, is_active, sort_order) VALUES
  ('CUSTOMER',              'Customer',                    'Ø¹Ù…ÙŠÙ„',                   true,  true, 1),
  ('VENDOR',                'Vendor',                      'Ù…ÙˆØ±Ø¯',                   true,  true, 2),
  ('SUBCONTRACTOR',         'Subcontractor',               'Ù…Ù‚Ø§ÙˆÙ„ Ù…Ù† Ø§Ù„Ø¨Ø§Ø·Ù†',         true,  true, 3),
  ('CONSULTANT',            'Consultant',                  'Ø§Ø³ØªØ´Ø§Ø±ÙŠ',                 true,  true, 4),
  ('RECRUITMENT_AGENCY',    'Recruitment Agency',          'ÙˆÙƒØ§Ù„Ø© ØªÙˆØ¸ÙŠÙ',             true,  true, 5),
  ('GOVERNMENT_AUTHORITY',  'Government Authority',        'Ø¬Ù‡Ø© Ø­ÙƒÙˆÙ…ÙŠØ©',              true,  true, 6),
  ('BANK',                  'Bank',                        'Ø¨Ù†Ùƒ',                    true,  true, 7),
  ('INSURANCE_COMPANY',     'Insurance Company',           'Ø´Ø±ÙƒØ© ØªØ£Ù…ÙŠÙ†',              true,  true, 8),
  ('LICENSE_ISSUER',        'License Issuer',              'Ø¬Ù‡Ø© Ø¥ØµØ¯Ø§Ø± Ø§Ù„ØªØ±Ø®ÙŠØµ',       true,  true, 9),
  ('FREE_ZONE_AUTHORITY',   'Free Zone Authority',         'Ø³Ù„Ø·Ø© Ø§Ù„Ù…Ù†Ø·Ù‚Ø© Ø§Ù„Ø­Ø±Ø©',      true,  true, 10),
  ('SCRAP_BUYER',           'Scrap Buyer',                 'Ù…Ø´ØªØ±ÙŠ Ø®Ø±Ø¯Ø©',              false, true, 11),
  ('SCRAP_SELLER',          'Scrap Seller',                'Ø¨Ø§Ø¦Ø¹ Ø®Ø±Ø¯Ø©',               false, true, 12),
  ('TRANSPORT_SUPPLIER',    'Transport Supplier',          'Ù…ÙˆØ±Ø¯ Ù†Ù‚Ù„',                false, true, 13),
  ('EQUIPMENT_SUPPLIER',    'Equipment Supplier',          'Ù…ÙˆØ±Ø¯ Ù…Ø¹Ø¯Ø§Øª',              false, true, 14),
  ('FUEL_SUPPLIER',         'Fuel Supplier',               'Ù…ÙˆØ±Ø¯ ÙˆÙ‚ÙˆØ¯',               false, true, 15),
  ('WORKSHOP_SUPPLIER',     'Workshop Supplier',           'Ù…ÙˆØ±Ø¯ ÙˆØ±Ø´Ø©',               false, true, 16),
  ('SPARE_PARTS_SUPPLIER',  'Spare Parts Supplier',        'Ù…ÙˆØ±Ø¯ Ù‚Ø·Ø¹ ØºÙŠØ§Ø±',           false, true, 17),
  ('LAB_TESTING_COMPANY',   'Lab Testing Company',         'Ø´Ø±ÙƒØ© Ø§Ø®ØªØ¨Ø§Ø±Ø§Øª Ù…Ø®Ø¨Ø±ÙŠØ©',    false, true, 18),
  ('WASTE_DISPOSAL_FACILITY','Waste Disposal Facility',   'Ù…Ù†Ø´Ø£Ø© Ù…Ø¹Ø§Ù„Ø¬Ø© Ù†ÙØ§ÙŠØ§Øª',     false, true, 19),
  ('TRAINING_PROVIDER',     'Training Provider',           'Ù…Ø²ÙˆØ¯ ØªØ¯Ø±ÙŠØ¨',              false, true, 20),
  ('MANPOWER_SUPPLIER',     'Manpower Supplier',           'Ù…ÙˆØ±Ø¯ Ø¹Ù…Ø§Ù„Ø©',              false, true, 21),
  ('OWNER_LANDLORD',        'Owner / Landlord',            'Ù…Ø§Ù„Ùƒ / Ù…Ø¤Ø¬Ø±',             false, true, 22),
  ('JOINT_VENTURE_PARTNER', 'Joint Venture Partner',       'Ø´Ø±ÙŠÙƒ Ù…Ø´Ø±ÙˆØ¹ Ù…Ø´ØªØ±Ùƒ',        false, true, 23)
ON CONFLICT (type_code) DO UPDATE SET type_name = EXCLUDED.type_name, is_active = EXCLUDED.is_active, updated_at = now();

-- 11.2 party_natures
INSERT INTO party_natures (nature_code, name_en, name_ar, is_system, is_active, sort_order) VALUES
  ('LLC',                  'Limited Liability Company',    'Ø´Ø±ÙƒØ© Ø°Ø§Øª Ù…Ø³Ø¤ÙˆÙ„ÙŠØ© Ù…Ø­Ø¯ÙˆØ¯Ø©',  true, true, 1),
  ('PLC',                  'Public Listed Company',        'Ø´Ø±ÙƒØ© Ù…Ø¯Ø±Ø¬Ø© ÙÙŠ Ø§Ù„Ø¨ÙˆØ±ØµØ©',    true, true, 2),
  ('INDIVIDUAL',           'Individual / Sole Person',     'ÙØ±Ø¯ / Ø´Ø®Øµ Ø·Ø¨ÙŠØ¹ÙŠ',          true, true, 3),
  ('SOLE_PROPRIETORSHIP',  'Sole Proprietorship',          'Ù…Ø¤Ø³Ø³Ø© ÙØ±Ø¯ÙŠØ©',              true, true, 4),
  ('PARTNERSHIP',          'Partnership',                  'Ø´Ø±Ø§ÙƒØ©',                    true, true, 5),
  ('GOVERNMENT',           'Government Entity',            'Ø¬Ù‡Ø© Ø­ÙƒÙˆÙ…ÙŠØ©',               true, true, 6),
  ('FREE_ZONE_ENTITY',     'Free Zone Entity',             'ÙƒÙŠØ§Ù† Ù…Ù†Ø·Ù‚Ø© Ø­Ø±Ø©',           true, true, 7),
  ('BRANCH',               'Branch Office',                'ÙØ±Ø¹',                      true, true, 8),
  ('REPRESENTATIVE_OFFICE','Representative Office',        'Ù…ÙƒØªØ¨ ØªÙ…Ø«ÙŠÙ„',               true, true, 9),
  ('JOINT_VENTURE',        'Joint Venture',                'Ù…Ø´Ø±ÙˆØ¹ Ù…Ø´ØªØ±Ùƒ',              true, true, 10),
  ('TRUST',                'Trust',                        'ØµÙ†Ø¯ÙˆÙ‚ Ø§Ø¦ØªÙ…Ø§Ù†ÙŠ',            true, true, 11),
  ('OTHER',                'Other',                        'Ø£Ø®Ø±Ù‰',                     false,true, 99)
ON CONFLICT (nature_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.3 party_statuses
INSERT INTO party_statuses (status_code, name_en, is_system, sort_order) VALUES
  ('DRAFT',       'Draft',       true, 1),
  ('ACTIVE',      'Active',      true, 2),
  ('INACTIVE',    'Inactive',    true, 3),
  ('SUSPENDED',   'Suspended',   true, 4),
  ('BLACKLISTED', 'Blacklisted', true, 5),
  ('ARCHIVED',    'Archived',    true, 6)
ON CONFLICT (status_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.4 party_license_types (12 types)
INSERT INTO party_license_types (license_type_code, name_en, is_system, sort_order) VALUES
  ('COMMERCIAL',      'Commercial License',           true, 1),
  ('PROFESSIONAL',    'Professional License',         true, 2),
  ('INDUSTRIAL',      'Industrial License',           true, 3),
  ('TOURISM',         'Tourism License',              false, 4),
  ('EDUCATIONAL',     'Educational License',          false, 5),
  ('HEALTHCARE',      'Healthcare License',           false, 6),
  ('TRANSPORT',       'Transport License',            false, 7),
  ('CONTRACTING',     'Contracting License',          true, 8),
  ('MANPOWER',        'Manpower Recruitment License', false, 9),
  ('FREE_ZONE',       'Free Zone License',            true, 10),
  ('IMPORT_EXPORT',   'Import / Export License',      false, 11),
  ('OTHER',           'Other',                        false, 99)
ON CONFLICT (license_type_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.5 party_license_statuses
INSERT INTO party_license_statuses (license_status_code, name_en, is_system, sort_order) VALUES
  ('ACTIVE',          'Active',           true, 1),
  ('EXPIRED',         'Expired',          true, 2),
  ('SUSPENDED',       'Suspended',        true, 3),
  ('CANCELLED',       'Cancelled',        true, 4),
  ('PENDING_RENEWAL', 'Pending Renewal',  true, 5),
  ('UNDER_REVIEW',    'Under Review',     false, 6)
ON CONFLICT (license_status_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.6 party_tax_statuses
INSERT INTO party_tax_statuses (tax_status_code, name_en, is_system, sort_order) VALUES
  ('REGISTERED',     'Registered',             true, 1),
  ('PENDING',        'Pending Registration',   false, 2),
  ('EXEMPTED',       'Exempted',               false, 3),
  ('DEREGISTERED',   'De-registered',          true, 4),
  ('NOT_APPLICABLE', 'Not Applicable',         true, 5)
ON CONFLICT (tax_status_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.7 party_contact_roles
INSERT INTO party_contact_roles (contact_role_code, name_en, is_system, sort_order) VALUES
  ('PRIMARY_CONTACT', 'Primary Contact',  true, 1),
  ('ACCOUNTS',        'Accounts Contact', true, 2),
  ('SALES',           'Sales Contact',    true, 3),
  ('OPERATIONS',      'Operations Contact',true, 4),
  ('HSE',             'HSE Contact',      true, 5),
  ('DOCUMENTS',       'Documents Contact',true, 6),
  ('TECHNICAL',       'Technical Contact',false, 7),
  ('MANAGEMENT',      'Management',       false, 8),
  ('OTHER',           'Other',            false, 99)
ON CONFLICT (contact_role_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.8 party_contact_departments
INSERT INTO party_contact_departments (contact_department_code, name_en, is_system, sort_order) VALUES
  ('FINANCE',     'Finance',              false, 1),
  ('ACCOUNTS',    'Accounts',             false, 2),
  ('SALES',       'Sales',               false, 3),
  ('OPERATIONS',  'Operations',          false, 4),
  ('HR',          'Human Resources',     false, 5),
  ('HSE',         'HSE',                 false, 6),
  ('LEGAL',       'Legal',               false, 7),
  ('IT',          'Information Technology', false, 8),
  ('MANAGEMENT',  'Management',          false, 9),
  ('PROCUREMENT', 'Procurement',         false, 10),
  ('PROJECTS',    'Projects',            false, 11),
  ('OTHER',       'Other',               false, 99)
ON CONFLICT (contact_department_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.9 party_address_types
INSERT INTO party_address_types (address_type_code, name_en, is_system, sort_order) VALUES
  ('REGISTERED',  'Registered Address', true, 1),
  ('HEAD_OFFICE', 'Head Office',        true, 2),
  ('BRANCH',      'Branch Office',      false, 3),
  ('BILLING',     'Billing Address',    true, 4),
  ('SHIPPING',    'Shipping Address',   true, 5),
  ('WAREHOUSE',   'Warehouse',          false, 6),
  ('SITE',        'Site Address',       false, 7),
  ('OTHER',       'Other',              false, 99)
ON CONFLICT (address_type_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.10 party_document_types
INSERT INTO party_document_types (document_type_code, name_en, is_system, sort_order) VALUES
  ('TRADE_LICENSE',         'Trade License',              true, 1),
  ('MOA',                   'Memorandum of Association',  true, 2),
  ('AOA',                   'Articles of Association',    false, 3),
  ('TRN_CERTIFICATE',       'TRN Certificate',            true, 4),
  ('VAT_CERTIFICATE',       'VAT Certificate',            false, 5),
  ('INSURANCE_CERTIFICATE', 'Insurance Certificate',      true, 6),
  ('BANK_GUARANTEE',        'Bank Guarantee',             false, 7),
  ('POWER_OF_ATTORNEY',     'Power of Attorney',          false, 8),
  ('PASSPORT_COPY',         'Passport Copy',              false, 9),
  ('EMIRATES_ID',           'Emirates ID',                false, 10),
  ('ISO_CERTIFICATE',       'ISO Certificate',            false, 11),
  ('PREQUALIFICATION',      'Prequalification Document',  false, 12),
  ('CONTRACT',              'Contract',                   false, 13),
  ('OTHER',                 'Other',                      false, 99)
ON CONFLICT (document_type_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.11 party_document_statuses
INSERT INTO party_document_statuses (document_status_code, name_en, is_system, sort_order) VALUES
  ('PENDING_UPLOAD', 'Pending Upload', true,  1),
  ('UPLOADED',       'Uploaded',       true,  2),
  ('UNDER_REVIEW',   'Under Review',   false, 3),
  ('APPROVED',       'Approved',       true,  4),
  ('REJECTED',       'Rejected',       true,  5),
  ('EXPIRED',        'Expired',        true,  6)
ON CONFLICT (document_status_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.12 party_compliance_statuses
INSERT INTO party_compliance_statuses (compliance_status_code, name_en, is_system, sort_order) VALUES
  ('NOT_REVIEWED', 'Not Reviewed',  true,  1),
  ('IN_PROGRESS',  'In Progress',   false, 2),
  ('APPROVED',     'Approved',      true,  3),
  ('REJECTED',     'Rejected',      true,  4),
  ('SUSPENDED',    'Suspended',     true,  5),
  ('EXPIRED',      'Expired',       true,  6)
ON CONFLICT (compliance_status_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.13 party_approval_statuses
INSERT INTO party_approval_statuses (approval_status_code, name_en, is_system, sort_order) VALUES
  ('PENDING',                 'Pending',                true, 1),
  ('APPROVED',                'Approved',               true, 2),
  ('CONDITIONALLY_APPROVED',  'Conditionally Approved', false, 3),
  ('REJECTED',                'Rejected',               true, 4),
  ('SUSPENDED',               'Suspended',              true, 5),
  ('EXPIRED',                 'Expired',                true, 6)
ON CONFLICT (approval_status_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.14 party_blacklist_statuses
INSERT INTO party_blacklist_statuses (blacklist_status_code, name_en, is_system, sort_order) VALUES
  ('NOT_BLACKLISTED',     'Not Blacklisted',            true, 1),
  ('UNDER_INVESTIGATION', 'Under Investigation',         false, 2),
  ('BLACKLISTED',         'Blacklisted',                 true, 3),
  ('REMOVED',             'Removed from Blacklist',      true, 4)
ON CONFLICT (blacklist_status_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.15 party_risk_ratings
INSERT INTO party_risk_ratings (risk_rating_code, name_en, is_system, sort_order) VALUES
  ('LOW',       'Low Risk',       true, 1),
  ('MEDIUM',    'Medium Risk',    true, 2),
  ('HIGH',      'High Risk',      true, 3),
  ('VERY_HIGH', 'Very High Risk', true, 4),
  ('CRITICAL',  'Critical Risk',  true, 5)
ON CONFLICT (risk_rating_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.16 party_credit_ratings
INSERT INTO party_credit_ratings (credit_rating_code, name_en, is_system, sort_order) VALUES
  ('EXCELLENT',    'Excellent (AAA)', true, 1),
  ('GOOD',         'Good (AA)',       true, 2),
  ('SATISFACTORY', 'Satisfactory (A)',true, 3),
  ('ADEQUATE',     'Adequate (BBB)',  false,4),
  ('MARGINAL',     'Marginal (BB)',   false,5),
  ('POOR',         'Poor (B)',        true, 6),
  ('DEFAULT',      'Default',         true, 7),
  ('NOT_RATED',    'Not Rated',       true, 8)
ON CONFLICT (credit_rating_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.17 party_note_types
INSERT INTO party_note_types (note_type_code, name_en, is_system, sort_order) VALUES
  ('GENERAL',         'General Note',    true, 1),
  ('FOLLOW_UP',       'Follow-up',       true, 2),
  ('COMPLAINT',       'Complaint',       false,3),
  ('ESCALATION',      'Escalation',      false,4),
  ('FINANCIAL_NOTE',  'Financial Note',  false,5),
  ('COMPLIANCE_NOTE', 'Compliance Note', false,6),
  ('LEGAL_NOTE',      'Legal Note',      false,7),
  ('INTERNAL',        'Internal Note',   true, 8)
ON CONFLICT (note_type_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.18 payment_methods
INSERT INTO payment_methods (method_code, name_en, is_system, sort_order) VALUES
  ('BANK_TRANSFER', 'Bank Transfer',          true,  1),
  ('CHEQUE',        'Cheque',                 true,  2),
  ('CASH',          'Cash',                   true,  3),
  ('CREDIT_CARD',   'Credit Card',            false, 4),
  ('DIRECT_DEBIT',  'Direct Debit',           false, 5),
  ('PDC',           'Post-Dated Cheque',      false, 6),
  ('LC',            'Letter of Credit',       false, 7),
  ('BG',            'Bank Guarantee',         false, 8),
  ('NETTING',       'Inter-company Netting',  false, 9),
  ('OTHER',         'Other',                  false, 99)
ON CONFLICT (method_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.19 customer_categories
INSERT INTO customer_categories (category_code, name_en, is_system, sort_order) VALUES
  ('CORPORATE','Corporate',true,1),('SME','SME',true,2),('INDIVIDUAL','Individual',true,3),
  ('GOVERNMENT','Government',true,4),('NON_PROFIT','Non-Profit',false,5),('OTHER','Other',false,99)
ON CONFLICT (category_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.20 customer_statuses
INSERT INTO customer_statuses (status_code, name_en, is_system, sort_order) VALUES
  ('PROSPECT','Prospect',true,1),('ACTIVE','Active',true,2),('DORMANT','Dormant',false,3),
  ('BLOCKED','Blocked',true,4),('CLOSED','Closed',true,5)
ON CONFLICT (status_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.21 invoice_methods
INSERT INTO invoice_methods (method_code, name_en, is_system, sort_order) VALUES
  ('EMAIL','Email',true,1),('PORTAL','Portal',false,2),('PRINTED_COPY','Printed Copy',false,3),
  ('EDI','EDI',false,4),('FAX','Fax',false,5),('COURIER','Courier',false,6),('HAND_DELIVERY','Hand Delivery',false,7)
ON CONFLICT (method_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.22 vendor_categories
INSERT INTO vendor_categories (category_code, name_en, is_system, sort_order) VALUES
  ('MATERIALS_SUPPLIER','Materials Supplier',true,1),('SERVICE_PROVIDER','Service Provider',true,2),
  ('EQUIPMENT_SUPPLIER','Equipment Supplier',true,3),('FUEL_SUPPLIER','Fuel Supplier',true,4),
  ('IT_SUPPLIER','IT Supplier',false,5),('TRANSPORT_SUPPLIER','Transport Supplier',false,6),
  ('FOOD_SUPPLIER','Food Supplier',false,7),('MANPOWER_AGENCY','Manpower Agency',false,8),('OTHER','Other',false,99)
ON CONFLICT (category_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.23 vendor_ratings
INSERT INTO vendor_ratings (rating_code, name_en, is_system, sort_order) VALUES
  ('PREFERRED','Preferred',true,1),('APPROVED','Approved',true,2),
  ('CONDITIONAL','Conditional',true,3),('PROBATIONARY','Probationary',false,4),('BLACKLISTED','Blacklisted',true,5)
ON CONFLICT (rating_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.24 procurement_categories
INSERT INTO procurement_categories (category_code, name_en, is_system, sort_order) VALUES
  ('CIVIL_WORKS','Civil Works',true,1),('MECHANICAL','Mechanical',true,2),('ELECTRICAL','Electrical',true,3),
  ('IT_SERVICES','IT Services',false,4),('PROFESSIONAL_SERVICES','Professional Services',false,5),
  ('TRANSPORT','Transport',false,6),('FUEL_LUBRICANTS','Fuel & Lubricants',true,7),
  ('SPARE_PARTS','Spare Parts',false,8),('SAFETY_EQUIPMENT','Safety Equipment',false,9),
  ('FOOD_CATERING','Food & Catering',false,10),('CLEANING_SERVICES','Cleaning Services',false,11),('OTHER','Other',false,99)
ON CONFLICT (category_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.25 subcontractor_categories
INSERT INTO subcontractor_categories (category_code, name_en, is_system, sort_order) VALUES
  ('CIVIL_SUBCONTRACTOR','Civil Subcontractor',true,1),('MECHANICAL_SUBCONTRACTOR','Mechanical',true,2),
  ('ELECTRICAL_SUBCONTRACTOR','Electrical',true,3),('HVAC','HVAC',false,4),('PLUMBING','Plumbing',false,5),
  ('PAINTING','Painting',false,6),('CLEANING','Cleaning',false,7),('DEMOLITION','Demolition',false,8),
  ('SCAFFOLDING','Scaffolding',false,9),('OTHER','Other',false,99)
ON CONFLICT (category_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.26 work_categories
INSERT INTO work_categories (category_code, name_en, is_system, sort_order) VALUES
  ('BUILDING_WORKS','Building Works',true,1),('INFRASTRUCTURE','Infrastructure',true,2),
  ('FIT_OUT','Fit-out',false,3),('MAINTENANCE','Maintenance',true,4),
  ('SPECIALIST_WORKS','Specialist Works',false,5),('OTHER','Other',false,99)
ON CONFLICT (category_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.27 consultant_types
INSERT INTO consultant_types (type_code, name_en, is_system, sort_order) VALUES
  ('ENGINEERING_CONSULTANT','Engineering Consultant',true,1),('MANAGEMENT_CONSULTANT','Management Consultant',false,2),
  ('LEGAL_CONSULTANT','Legal Consultant',false,3),('FINANCIAL_CONSULTANT','Financial Consultant',false,4),
  ('IT_CONSULTANT','IT Consultant',false,5),('HSE_CONSULTANT','HSE Consultant',false,6),
  ('MEDICAL_CONSULTANT','Medical Consultant',false,7),('OTHER','Other',false,99)
ON CONFLICT (type_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.28 consultant_specializations
INSERT INTO consultant_specializations (specialization_code, name_en, is_system, sort_order) VALUES
  ('STRUCTURAL','Structural',true,1),('CIVIL','Civil',true,2),('MEP','MEP',true,3),
  ('ARCHITECTURE','Architecture',false,4),('COST_ESTIMATING','Cost Estimating',false,5),
  ('PROJECT_MANAGEMENT','Project Management',false,6),('ERP_IT','ERP / IT',false,7),
  ('LEGAL_CORPORATE','Legal â€“ Corporate',false,8),('LEGAL_EMPLOYMENT','Legal â€“ Employment',false,9),
  ('ENVIRONMENTAL','Environmental',false,10),('OTHER','Other',false,99)
ON CONFLICT (specialization_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.29 recruitment_categories
INSERT INTO recruitment_categories (category_code, name_en, is_system, sort_order) VALUES
  ('SKILLED_LABOR','Skilled Labor',true,1),('UNSKILLED_LABOR','Unskilled Labor',true,2),
  ('PROFESSIONAL','Professional',true,3),('TECHNICAL','Technical',false,4),
  ('MANAGEMENT','Management',false,5),('DOMESTIC_WORKER','Domestic Worker',false,6),('OTHER','Other',false,99)
ON CONFLICT (category_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.30 authority_types
INSERT INTO authority_types (authority_code, name_en, is_system, sort_order) VALUES
  ('MUNICIPALITY','Municipality',true,1),('FREE_ZONE_AUTHORITY','Free Zone Authority',true,2),
  ('FEDERAL_MINISTRY','Federal Ministry',true,3),('REGULATORY_BODY','Regulatory Body',false,4),
  ('CHAMBER_OF_COMMERCE','Chamber of Commerce',false,5),('LICENSE_DEPARTMENT','License Department',true,6),
  ('COURT_AUTHORITY','Court Authority',false,7),('CUSTOMS','Customs',false,8),
  ('IMMIGRATION','Immigration',false,9),('OTHER','Other',false,99)
ON CONFLICT (authority_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.31 industry_sectors
INSERT INTO industry_sectors (sector_code, name_en, is_system, sort_order) VALUES
  ('CONSTRUCTION','Construction',true,1),('OIL_GAS','Oil & Gas',true,2),
  ('MANUFACTURING','Manufacturing',false,3),('RETAIL','Retail',false,4),
  ('LOGISTICS','Logistics',false,5),('HEALTHCARE','Healthcare',false,6),
  ('EDUCATION','Education',false,7),('REAL_ESTATE','Real Estate',false,8),
  ('IT_TECHNOLOGY','IT & Technology',false,9),('FINANCIAL_SERVICES','Financial Services',false,10),
  ('HOSPITALITY','Hospitality',false,11),('MEDIA','Media',false,12),
  ('AUTOMOTIVE','Automotive',false,13),('AGRICULTURE','Agriculture',false,14),('OTHER','Other',false,99)
ON CONFLICT (sector_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.32 sales_regions
INSERT INTO sales_regions (region_code, name_en, is_system, sort_order) VALUES
  ('ABU_DHABI','Abu Dhabi',true,1),('DUBAI','Dubai',true,2),('SHARJAH','Sharjah',true,3),
  ('AJMAN','Ajman',true,4),('UMM_AL_QUWAIN','Umm Al Quwain',true,5),
  ('RAS_AL_KHAIMAH','Ras Al Khaimah',true,6),('FUJAIRAH','Fujairah',true,7),
  ('NORTHERN_EMIRATES','Northern Emirates',true,8),('ALL_UAE','All UAE',true,9),
  ('GCC','GCC',false,10),('INTERNATIONAL','International',false,11)
ON CONFLICT (region_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.33 party_service_categories_master (42 categories)
INSERT INTO party_service_categories_master (category_code, category_name_en, is_system, sort_order) VALUES
  ('CIVIL_CONSTRUCTION','Civil Construction',true,1),('MECHANICAL_WORKS','Mechanical Works',true,2),
  ('ELECTRICAL_WORKS','Electrical Works',true,3),('HVAC_WORKS','HVAC Works',false,4),
  ('PLUMBING_WORKS','Plumbing Works',false,5),('PAINTING_WORKS','Painting Works',false,6),
  ('FLOORING_WORKS','Flooring Works',false,7),('JOINERY_WORKS','Joinery Works',false,8),
  ('GLAZING_WORKS','Glazing Works',false,9),('SCAFFOLDING','Scaffolding',false,10),
  ('DEMOLITION','Demolition',false,11),('ROAD_INFRASTRUCTURE','Road Infrastructure',true,12),
  ('WATERPROOFING','Waterproofing',false,13),('INSULATION_WORKS','Insulation Works',false,14),
  ('LANDSCAPING','Landscaping',false,15),('SWIMMING_POOL','Swimming Pool',false,16),
  ('DIESEL_SUPPLY','Diesel Supply',true,17),('PETROL_SUPPLY','Petrol Supply',true,18),
  ('LUBRICANTS_SUPPLY','Lubricants Supply',false,19),('FUEL_LOGISTICS','Fuel Logistics',false,20),
  ('SPARE_PARTS_SUPPLY','Spare Parts Supply',true,21),('EQUIPMENT_RENTAL','Equipment Rental',true,22),
  ('VEHICLE_RENTAL','Vehicle Rental',false,23),('WORKSHOP_REPAIR','Workshop & Repair',false,24),
  ('TRANSPORT_LOGISTICS','Transport & Logistics',true,25),('WASTE_DISPOSAL','Waste Disposal',true,26),
  ('SCRAP_BUYING','Scrap Buying',true,27),('SCRAP_SELLING','Scrap Selling',true,28),
  ('MANPOWER_SUPPLY','Manpower Supply',true,29),('CLEANING_SERVICES','Cleaning Services',false,30),
  ('SECURITY_SERVICES','Security Services',false,31),('CATERING_SERVICES','Catering Services',false,32),
  ('COURIER_SERVICES','Courier Services',false,33),('IT_HARDWARE','IT Hardware',false,34),
  ('IT_SOFTWARE','IT Software',false,35),('IT_SERVICES','IT Services',false,36),
  ('LAB_TESTING','Lab Testing',false,37),('SAFETY_EQUIPMENT','Safety Equipment',false,38),
  ('PROTECTIVE_CLOTHING','Protective Clothing',false,39),('MEDICAL_SUPPLIES','Medical Supplies',false,40),
  ('TRAINING_SERVICES','Training Services',false,41),('OTHER_SERVICES','Other Services',false,99)
ON CONFLICT (category_code) DO UPDATE SET category_name_en = EXCLUDED.category_name_en, updated_at = now();

-- 11.34 party_relationship_types (13 types)
INSERT INTO party_relationship_types (relationship_code, name_en, is_system, sort_order) VALUES
  ('SUBSIDIARY','Subsidiary',true,1),('PARENT_COMPANY','Parent Company',true,2),
  ('SISTER_COMPANY','Sister Company',true,3),('BRANCH_OF','Branch of',true,4),
  ('JOINT_VENTURE_PARTNER','Joint Venture Partner',true,5),('AGENT','Agent',false,6),
  ('DISTRIBUTOR','Distributor',false,7),('ASSOCIATED_COMPANY','Associated Company',false,8),
  ('SOLE_DISTRIBUTOR','Sole Distributor',false,9),('FRANCHISE','Franchise',false,10),
  ('STRATEGIC_PARTNER','Strategic Partner',false,11),('CLIENT_OF','Client of',false,12),
  ('SUPPLIER_OF','Supplier of',false,13)
ON CONFLICT (relationship_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- =============================================================================
-- SECTION 12: NUMBERING RULES
-- =============================================================================

INSERT INTO global_numbering_rules
  (rule_code, rule_name, description, module_code, module_name, document_type_code,
   document_type_name, document_prefix, separator, format_template, sequence_length,
   padding_character, starting_sequence_number, current_sequence_number, next_sequence_number,
   reset_policy, reserve_on_draft, reserve_on_submit, allow_manual_override, allow_gaps,
   is_active, is_locked, notes)
VALUES
  ('MASTER_PARTY',         'Party Reference Number',         'Unified party master',       'MASTER_DATA','Master Data','PARTY',   'Party',   'PTY',      '-','{DOC}-{SEQ6}',6,'0',1,0,1,'NEVER',false,true,false,true,true,false,'Replaces MASTER_CUSTOMER, MASTER_VENDOR etc.'),
  ('MASTER_PARTY_CONTACT', 'Party Contact Reference',        'Party contact record',       'MASTER_DATA','Master Data','CONTACT', 'Contact', 'PTY-CON',  '-','{DOC}-{SEQ6}',6,'0',1,0,1,'NEVER',false,true,false,true,true,false,NULL),
  ('MASTER_PARTY_ADDRESS', 'Party Address Reference',        'Party address record',       'MASTER_DATA','Master Data','ADDRESS', 'Address', 'PTY-ADDR', '-','{DOC}-{SEQ6}',6,'0',1,0,1,'NEVER',false,true,false,true,true,false,NULL),
  ('MASTER_PARTY_BANK',    'Party Bank Detail Reference',    'Party bank detail',          'MASTER_DATA','Master Data','BANK',    'Bank',    'PTY-BANK', '-','{DOC}-{SEQ6}',6,'0',1,0,1,'NEVER',false,true,false,true,true,false,NULL),
  ('MASTER_PARTY_LICENSE', 'Party License Reference',        'Party license record',       'MASTER_DATA','Master Data','LICENSE', 'License', 'PTY-LIC',  '-','{DOC}-{SEQ6}',6,'0',1,0,1,'NEVER',false,true,false,true,true,false,NULL),
  ('MASTER_PARTY_TAX',     'Party Tax Registration Ref.',    'Party tax registration',     'MASTER_DATA','Master Data','TAX',     'Tax Reg', 'PTY-TAX',  '-','{DOC}-{SEQ6}',6,'0',1,0,1,'NEVER',false,true,false,true,true,false,NULL),
  ('MASTER_PARTY_DOCUMENT','Party Document Reference',       'Party document record',      'MASTER_DATA','Master Data','DOCUMENT','Document','PTY-DOC',  '-','{DOC}-{SEQ6}',6,'0',1,0,1,'NEVER',false,true,false,true,true,false,NULL),
  ('MASTER_PARTY_NOTE',    'Party Note Reference',           'Party note record',          'MASTER_DATA','Master Data','NOTE',    'Note',    'PTY-NOTE', '-','{DOC}-{SEQ6}',6,'0',1,0,1,'NEVER',false,true,false,true,true,false,NULL)
ON CONFLICT (rule_code) DO UPDATE SET
  document_prefix       = EXCLUDED.document_prefix,
  format_template       = EXCLUDED.format_template,
  is_active             = EXCLUDED.is_active,
  updated_at            = now();

-- =============================================================================
-- SECTION 13: PERMISSIONS (24 codes)
-- =============================================================================

-- SUPABASE_VERIFIED FIX: added action_code column (NOT NULL in live permissions table)
-- action_code = last segment of permission_code
INSERT INTO permissions (permission_code, permission_name, description, module_code, action_code, is_active)
VALUES
  ('master_data.parties.view',               'View Parties',                   'View party records',                       'MASTER_DATA', 'view',               true),
  ('master_data.parties.create',             'Create Parties',                 'Create new party records',                 'MASTER_DATA', 'create',             true),
  ('master_data.parties.edit',               'Edit Parties',                   'Edit existing party records',              'MASTER_DATA', 'edit',               true),
  ('master_data.parties.delete',             'Delete Parties',                 'Delete party records',                     'MASTER_DATA', 'delete',             true),
  ('master_data.parties.deactivate',         'Deactivate Parties',             'Deactivate/reactivate parties',            'MASTER_DATA', 'deactivate',         true),
  ('master_data.parties.export',             'Export Parties',                 'Export party data to CSV/Excel',           'MASTER_DATA', 'export',             true),
  ('master_data.parties.manage_types',       'Manage Party Types',             'Create/edit party type master records',    'MASTER_DATA', 'manage_types',       true),
  ('master_data.parties.manage_services',    'Manage Party Services',          'Manage service category assignments',      'MASTER_DATA', 'manage_services',    true),
  ('master_data.parties.manage_relationships','Manage Relationships',          'Create/edit party relationships',          'MASTER_DATA', 'manage_relationships',true),
  ('master_data.parties.manage_licenses',    'Manage Licenses',                'Create/edit party licenses',               'MASTER_DATA', 'manage_licenses',    true),
  ('master_data.parties.manage_tax',         'Manage Tax Registrations',       'Create/edit tax registrations',            'MASTER_DATA', 'manage_tax',         true),
  ('master_data.parties.manage_contacts',    'Manage Contacts',                'Create/edit party contacts',               'MASTER_DATA', 'manage_contacts',    true),
  ('master_data.parties.manage_addresses',   'Manage Addresses',               'Create/edit party addresses',              'MASTER_DATA', 'manage_addresses',   true),
  ('master_data.parties.manage_bank_details','Manage Bank Details',            'Create/edit/view party bank details',      'MASTER_DATA', 'manage_bank_details',true),
  ('master_data.parties.view_bank_details',  'View Bank Details',              'View bank details (read-only)',            'MASTER_DATA', 'view_bank_details',  true),
  ('master_data.parties.verify_bank_details','Verify Bank Details',            'Verify/approve bank details',              'MASTER_DATA', 'verify_bank_details',true),
  ('master_data.parties.manage_documents',   'Manage Documents',               'Upload/edit party documents',              'MASTER_DATA', 'manage_documents',   true),
  ('master_data.parties.manage_compliance',  'Manage Compliance',              'Edit compliance profile and holds',        'MASTER_DATA', 'manage_compliance',  true),
  ('master_data.parties.approve',            'Approve Parties',                'Approve party vendor/customer status',     'MASTER_DATA', 'approve',            true),
  ('master_data.parties.blacklist',          'Blacklist Parties',              'Set blacklist status',                     'MASTER_DATA', 'blacklist',          true),
  ('master_data.parties.override_duplicate', 'Override Duplicate Warning',     'Override duplicate detection block',       'MASTER_DATA', 'override_duplicate', true),
  ('master_data.parties.lock',               'Lock Party Record',              'Lock/unlock party for editing',            'MASTER_DATA', 'lock',               true),
  ('master_data.parties.view_audit',         'View Party Audit Log',           'View audit trail for parties',             'MASTER_DATA', 'view_audit',         true),
  ('master_data.parties.print',              'Print Party Record',             'Print party details',                      'MASTER_DATA', 'print',              true)
ON CONFLICT (permission_code) DO UPDATE SET
  permission_name = EXCLUDED.permission_name,
  description     = EXCLUDED.description,
  action_code     = EXCLUDED.action_code,
  is_active       = EXCLUDED.is_active,
  updated_at      = now();

-- =============================================================================
-- SECTION 14: ROLE-PERMISSION MAPPING
-- Note: sales_manager role may not yet exist â€” treated as planned.
-- Verify role existence before inserting.
-- =============================================================================

-- system_admin: ALL 24 permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'system_admin'
  AND p.permission_code LIKE 'master_data.parties.%'
ON CONFLICT DO NOTHING;

-- group_admin: all except delete, lock
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.permission_code IN (
  'master_data.parties.view','master_data.parties.create','master_data.parties.edit',
  'master_data.parties.deactivate','master_data.parties.export','master_data.parties.manage_types',
  'master_data.parties.manage_services','master_data.parties.manage_relationships',
  'master_data.parties.manage_licenses','master_data.parties.manage_tax','master_data.parties.manage_contacts',
  'master_data.parties.manage_addresses','master_data.parties.manage_bank_details',
  'master_data.parties.view_bank_details','master_data.parties.verify_bank_details',
  'master_data.parties.manage_documents','master_data.parties.manage_compliance',
  'master_data.parties.approve','master_data.parties.blacklist','master_data.parties.override_duplicate',
  'master_data.parties.view_audit','master_data.parties.print'
)
WHERE r.role_code = 'group_admin'
ON CONFLICT DO NOTHING;

-- company_admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.permission_code IN (
  'master_data.parties.view','master_data.parties.create','master_data.parties.edit',
  'master_data.parties.deactivate','master_data.parties.export','master_data.parties.manage_types',
  'master_data.parties.manage_services','master_data.parties.manage_licenses',
  'master_data.parties.manage_tax','master_data.parties.manage_contacts','master_data.parties.manage_addresses',
  'master_data.parties.manage_bank_details','master_data.parties.view_bank_details',
  'master_data.parties.manage_documents','master_data.parties.manage_compliance',
  'master_data.parties.approve','master_data.parties.view_audit','master_data.parties.print'
)
WHERE r.role_code = 'company_admin'
ON CONFLICT DO NOTHING;

-- branch_admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.permission_code IN (
  'master_data.parties.view','master_data.parties.create','master_data.parties.edit',
  'master_data.parties.deactivate','master_data.parties.export','master_data.parties.manage_contacts',
  'master_data.parties.manage_addresses','master_data.parties.view_audit','master_data.parties.print'
)
WHERE r.role_code = 'branch_admin'
ON CONFLICT DO NOTHING;

-- finance_manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.permission_code IN (
  'master_data.parties.view','master_data.parties.manage_tax','master_data.parties.manage_bank_details',
  'master_data.parties.view_bank_details','master_data.parties.verify_bank_details',
  'master_data.parties.manage_compliance','master_data.parties.approve','master_data.parties.export',
  'master_data.parties.view_audit'
)
WHERE r.role_code = 'finance_manager'
ON CONFLICT DO NOTHING;

-- procurement_manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.permission_code IN (
  'master_data.parties.view','master_data.parties.create','master_data.parties.edit',
  'master_data.parties.manage_contacts','master_data.parties.manage_addresses',
  'master_data.parties.manage_licenses','master_data.parties.manage_documents',
  'master_data.parties.export','master_data.parties.print','master_data.parties.view_audit'
)
WHERE r.role_code = 'procurement_manager'
ON CONFLICT DO NOTHING;

-- sales_manager (INSERT ONLY IF ROLE EXISTS â€” verify first)
-- REVIEW: Uncomment when sales_manager role is created.
-- INSERT INTO role_permissions (role_id, permission_id)
-- SELECT r.id, p.id
-- FROM roles r JOIN permissions p ON p.permission_code IN (
--   'master_data.parties.view','master_data.parties.create','master_data.parties.edit',
--   'master_data.parties.manage_contacts','master_data.parties.manage_addresses',
--   'master_data.parties.export','master_data.parties.print'
-- )
-- WHERE r.role_code = 'sales_manager'
-- ON CONFLICT DO NOTHING;

-- hr_manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.permission_code IN (
  'master_data.parties.view','master_data.parties.manage_contacts',
  'master_data.parties.manage_documents','master_data.parties.export'
)
WHERE r.role_code = 'hr_manager'
ON CONFLICT DO NOTHING;

-- hse_manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.permission_code IN (
  'master_data.parties.view','master_data.parties.manage_compliance',
  'master_data.parties.manage_documents','master_data.parties.manage_licenses'
)
WHERE r.role_code = 'hse_manager'
ON CONFLICT DO NOTHING;

-- read_only_user (SUPABASE_VERIFIED fix: live role code is 'read_only_user', not 'viewer')
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.permission_code IN (
  'master_data.parties.view','master_data.parties.export','master_data.parties.print'
)
WHERE r.role_code = 'read_only_user'
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SECTION 15: DUPLICATE DETECTION FUNCTION (review only)
-- =============================================================================

CREATE OR REPLACE FUNCTION detect_possible_party_duplicates(
  p_legal_name_en     TEXT    DEFAULT NULL,
  p_trade_name_en     TEXT    DEFAULT NULL,
  p_main_email        TEXT    DEFAULT NULL,
  p_main_mobile       TEXT    DEFAULT NULL,
  p_main_phone        TEXT    DEFAULT NULL,
  p_trn               TEXT    DEFAULT NULL,
  p_license_number    TEXT    DEFAULT NULL,
  p_iban              TEXT    DEFAULT NULL,
  p_website           TEXT    DEFAULT NULL,
  p_exclude_party_id  BIGINT  DEFAULT NULL
)
RETURNS TABLE (
  party_id        BIGINT,
  party_code      TEXT,
  display_name    TEXT,
  match_type      TEXT,
  match_score     NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  -- Exact TRN match (blocking level)
  SELECT p.id, p.party_code, p.display_name,
         'EXACT_TRN' AS match_type, 1.0 AS match_score
  FROM parties p
  JOIN party_tax_registrations tr ON tr.party_id = p.id
  WHERE tr.tax_registration_number = p_trn
    AND tr.is_active = true
    AND p.is_active = true
    AND (p_exclude_party_id IS NULL OR p.id != p_exclude_party_id)
    AND p_trn IS NOT NULL

  UNION ALL

  -- Exact license number match (blocking level)
  SELECT p.id, p.party_code, p.display_name,
         'EXACT_LICENSE' AS match_type, 1.0 AS match_score
  FROM parties p
  JOIN party_licenses lic ON lic.party_id = p.id
  WHERE lic.license_number = p_license_number
    AND lic.is_active = true
    AND p.is_active = true
    AND (p_exclude_party_id IS NULL OR p.id != p_exclude_party_id)
    AND p_license_number IS NOT NULL

  UNION ALL

  -- Exact IBAN (warning level)
  SELECT p.id, p.party_code, p.display_name,
         'EXACT_IBAN' AS match_type, 0.9 AS match_score
  FROM parties p
  JOIN party_bank_details bd ON bd.party_id = p.id
  WHERE bd.iban = p_iban
    AND bd.is_active = true
    AND p.is_active = true
    AND (p_exclude_party_id IS NULL OR p.id != p_exclude_party_id)
    AND p_iban IS NOT NULL

  UNION ALL

  -- Exact email (warning level)
  SELECT p.id, p.party_code, p.display_name,
         'EXACT_EMAIL' AS match_type, 0.85 AS match_score
  FROM parties p
  WHERE lower(p.main_email) = lower(p_main_email)
    AND p.is_active = true
    AND (p_exclude_party_id IS NULL OR p.id != p_exclude_party_id)
    AND p_main_email IS NOT NULL

  UNION ALL

  -- Exact mobile (warning level)
  SELECT p.id, p.party_code, p.display_name,
         'EXACT_MOBILE' AS match_type, 0.85 AS match_score
  FROM parties p
  WHERE p.main_mobile = p_main_mobile
    AND p.is_active = true
    AND (p_exclude_party_id IS NULL OR p.id != p_exclude_party_id)
    AND p_main_mobile IS NOT NULL

  UNION ALL

  -- Exact phone (warning level)
  SELECT p.id, p.party_code, p.display_name,
         'EXACT_PHONE' AS match_type, 0.8 AS match_score
  FROM parties p
  WHERE p.main_phone = p_main_phone
    AND p.is_active = true
    AND (p_exclude_party_id IS NULL OR p.id != p_exclude_party_id)
    AND p_main_phone IS NOT NULL

  UNION ALL

  -- Similar legal name using pg_trgm â€” REVIEW ONLY: requires extension
  -- Uncomment after pg_trgm is enabled:
  -- SELECT p.id, p.party_code, p.display_name,
  --        'SIMILAR_LEGAL_NAME' AS match_type,
  --        similarity(lower(p.legal_name_en), lower(p_legal_name_en)) AS match_score
  -- FROM parties p
  -- WHERE similarity(lower(p.legal_name_en), lower(p_legal_name_en)) > 0.45
  --   AND p.is_active = true
  --   AND (p_exclude_party_id IS NULL OR p.id != p_exclude_party_id)
  --   AND p_legal_name_en IS NOT NULL

  -- Exact legal name fallback (no extension needed)
  SELECT p.id, p.party_code, p.display_name,
         'EXACT_LEGAL_NAME' AS match_type, 1.0 AS match_score
  FROM parties p
  WHERE lower(p.legal_name_en) = lower(p_legal_name_en)
    AND p.is_active = true
    AND (p_exclude_party_id IS NULL OR p.id != p_exclude_party_id)
    AND p_legal_name_en IS NOT NULL

  UNION ALL

  -- Exact trade name fallback
  SELECT p.id, p.party_code, p.display_name,
         'EXACT_TRADE_NAME' AS match_type, 0.9 AS match_score
  FROM parties p
  WHERE lower(p.trade_name_en) = lower(p_trade_name_en)
    AND p.is_active = true
    AND (p_exclude_party_id IS NULL OR p.id != p_exclude_party_id)
    AND p_trade_name_en IS NOT NULL;
$$;
