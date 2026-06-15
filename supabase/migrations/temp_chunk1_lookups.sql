-- Insert lookup categories (idempotent)
INSERT INTO global_lookup_categories (
  category_code, category_name_en, category_name_ar, description, 
  module_code, is_system, is_locked, sort_order
) VALUES
-- PARTY_STATUS_TYPES
('PARTY_STATUS_TYPES', 'Party Status Types', 'Ø£Ù†ÙˆØ§Ø¹ Ø­Ø§Ù„Ø© Ø§Ù„Ø·Ø±Ù', 
 'Common status values for all party entities', 
 'PARTIES', true, true, 10),

-- CUSTOMER_TYPES
('CUSTOMER_TYPES', 'Customer Types', 'Ø£Ù†ÙˆØ§Ø¹ Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡', 
 'Customer classification types (REV1 expanded for government/utility/industrial customers)', 
 'PARTIES', true, false, 20),

-- CUSTOMER_SEGMENTS
('CUSTOMER_SEGMENTS', 'Customer Segments', 'Ø´Ø±Ø§Ø¦Ø­ Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡', 
 'Customer segmentation for CRM and sales strategy', 
 'PARTIES', false, false, 30),

-- VENDOR_TYPES
('VENDOR_TYPES', 'Vendor Types', 'Ø£Ù†ÙˆØ§Ø¹ Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†', 
 'Vendor classification types (REV1 expanded for transporters/logistics/waste disposal)', 
 'PARTIES', true, false, 40),

-- VENDOR_CATEGORIES
('VENDOR_CATEGORIES', 'Vendor Categories', 'ÙØ¦Ø§Øª Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†', 
 'Vendor categorization for procurement', 
 'PARTIES', false, false, 50),

-- SUPPLIER_CATEGORIES
('SUPPLIER_CATEGORIES', 'Supplier Categories', 'ÙØ¦Ø§Øª Ø§Ù„Ù…ÙˆØ±Ø¯ÙŠÙ†', 
 'Supplier categorization for material/equipment suppliers', 
 'PARTIES', false, false, 60),

-- SUBCONTRACTOR_TYPES
('SUBCONTRACTOR_TYPES', 'Subcontractor Types', 'Ø£Ù†ÙˆØ§Ø¹ Ø§Ù„Ù…Ù‚Ø§ÙˆÙ„ÙŠÙ† Ù…Ù† Ø§Ù„Ø¨Ø§Ø·Ù†', 
 'Subcontractor classification types (REV1 expanded for transport subcontractors)', 
 'PARTIES', true, false, 70),

-- SUBCONTRACTOR_CATEGORIES
('SUBCONTRACTOR_CATEGORIES', 'Subcontractor Categories', 'ÙØ¦Ø§Øª Ø§Ù„Ù…Ù‚Ø§ÙˆÙ„ÙŠÙ† Ù…Ù† Ø§Ù„Ø¨Ø§Ø·Ù†', 
 'Subcontractor categorization for project management', 
 'PARTIES', false, false, 80),

-- CONSULTANT_TYPES
('CONSULTANT_TYPES', 'Consultant Types', 'Ø£Ù†ÙˆØ§Ø¹ Ø§Ù„Ø§Ø³ØªØ´Ø§Ø±ÙŠÙŠÙ†', 
 'Consultant classification types (REV1 expanded for audit consultants)', 
 'PARTIES', true, false, 90),

-- CONSULTANT_CATEGORIES
('CONSULTANT_CATEGORIES', 'Consultant Categories', 'ÙØ¦Ø§Øª Ø§Ù„Ø§Ø³ØªØ´Ø§Ø±ÙŠÙŠÙ†', 
 'Consultant categorization for professional services', 
 'PARTIES', false, false, 100),

-- GOVERNMENT_AUTHORITY_TYPES
('GOVERNMENT_AUTHORITY_TYPES', 'Government Authority Types', 'Ø£Ù†ÙˆØ§Ø¹ Ø§Ù„Ø¬Ù‡Ø§Øª Ø§Ù„Ø­ÙƒÙˆÙ…ÙŠØ©', 
 'Government authority classification (REV1 expanded for license/permit issuers, utility/transport authorities)', 
 'PARTIES', true, false, 110),

-- GOVERNMENT_AUTHORITY_CATEGORIES
('GOVERNMENT_AUTHORITY_CATEGORIES', 'Government Authority Categories', 'ÙØ¦Ø§Øª Ø§Ù„Ø¬Ù‡Ø§Øª Ø§Ù„Ø­ÙƒÙˆÙ…ÙŠØ©', 
 'Government authority categorization for compliance', 
 'PARTIES', false, false, 120),

-- JURISDICTION_LEVEL_TYPES
('JURISDICTION_LEVEL_TYPES', 'Jurisdiction Level Types', 'Ø£Ù†ÙˆØ§Ø¹ Ù…Ø³ØªÙˆÙŠØ§Øª Ø§Ù„Ø§Ø®ØªØµØ§Øµ', 
 'Jurisdiction levels for government authorities', 
 'PARTIES', true, false, 130),

-- RECRUITMENT_AGENCY_TYPES
('RECRUITMENT_AGENCY_TYPES', 'Recruitment Agency Types', 'Ø£Ù†ÙˆØ§Ø¹ ÙˆÙƒØ§Ù„Ø§Øª Ø§Ù„ØªÙˆØ¸ÙŠÙ',
 'Recruitment agency classification types',
 'PARTIES', true, false, 140),

-- ICV_STATUS_TYPES
('ICV_STATUS_TYPES', 'ICV Certificate Status Types', 'Ø£Ù†ÙˆØ§Ø¹ Ø­Ø§Ù„Ø© Ø´Ù‡Ø§Ø¯Ø© ICV',
 'ICV (In-Country Value) certificate status types',
 'COMPLIANCE', true, false, 150),

-- RECRUITMENT_AGENCY_CATEGORIES
('RECRUITMENT_AGENCY_CATEGORIES', 'Recruitment Agency Categories', 'ÙØ¦Ø§Øª ÙˆÙƒØ§Ù„Ø§Øª Ø§Ù„ØªÙˆØ¸ÙŠÙ', 
 'Recruitment agency categorization for HR', 
 'PARTIES', false, false, 150),

-- INDUSTRY_TYPES
('INDUSTRY_TYPES', 'Industry Types', 'Ø£Ù†ÙˆØ§Ø¹ Ø§Ù„ØµÙ†Ø§Ø¹Ø§Øª', 
 'Industry classification for customers and business analysis', 
 'PARTIES', false, false, 160),

-- CRM_LEAD_SOURCES
('CRM_LEAD_SOURCES', 'CRM Lead Sources', 'Ù…ØµØ§Ø¯Ø± Ø§Ù„Ø¹Ù…Ù„Ø§Ø¡ Ø§Ù„Ù…Ø­ØªÙ…Ù„ÙŠÙ†', 
 'Lead sources for CRM and sales tracking', 
 'PARTIES', false, false, 170),

-- CONTACT_TYPES
('CONTACT_TYPES', 'Contact Types', 'Ø£Ù†ÙˆØ§Ø¹ Ø¬Ù‡Ø§Øª Ø§Ù„Ø§ØªØµØ§Ù„', 
 'Contact person types for relationship management', 
 'PARTIES', false, false, 180),

-- COMMUNICATION_PREFERENCE_TYPES
('COMMUNICATION_PREFERENCE_TYPES', 'Communication Preference Types', 'Ø£Ù†ÙˆØ§Ø¹ ØªÙØ¶ÙŠÙ„Ø§Øª Ø§Ù„Ø§ØªØµØ§Ù„', 
 'Preferred communication methods for contacts', 
 'PARTIES', false, false, 190),

-- ADDRESS_TYPES
('ADDRESS_TYPES', 'Address Types', 'Ø£Ù†ÙˆØ§Ø¹ Ø§Ù„Ø¹Ù†Ø§ÙˆÙŠÙ†', 
 'Address types for party entities', 
 'PARTIES', false, false, 200),

-- PARTY_DOCUMENT_TYPES
('PARTY_DOCUMENT_TYPES', 'Party Document Types', 'Ø£Ù†ÙˆØ§Ø¹ Ù…Ø³ØªÙ†Ø¯Ø§Øª Ø§Ù„Ø·Ø±Ù', 
 'Document types for party entities', 
 'PARTIES', false, false, 210),

-- BANK_ACCOUNT_TYPES
('BANK_ACCOUNT_TYPES', 'Bank Account Types', 'Ø£Ù†ÙˆØ§Ø¹ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ù…ØµØ±ÙÙŠØ©', 
 'Bank account types for payment processing', 
 'PARTIES', false, false, 220)

ON CONFLICT (category_code) 
DO UPDATE SET 
  category_name_en = EXCLUDED.category_name_en,
  category_name_ar = EXCLUDED.category_name_ar,
  description = EXCLUDED.description,
  module_code = EXCLUDED.module_code,
  updated_at = now();

-- ============================================================================
-- SECTION 2: LOOKUP VALUES (~130 Values)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PARTY_STATUS_TYPES (5 values)
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('PARTY_STATUS_TYPES', 'ACTIVE', 'Active', 'Ù†Ø´Ø·', 'Active party', 'green', true, true, true, 10),
('PARTY_STATUS_TYPES', 'INACTIVE', 'Inactive', 'ØºÙŠØ± Ù†Ø´Ø·', 'Inactive party', 'gray', true, false, false, 20),
('PARTY_STATUS_TYPES', 'BLACKLISTED', 'Blacklisted', 'Ø§Ù„Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø³ÙˆØ¯Ø§Ø¡', 'Blacklisted party', 'red', true, false, false, 30),
('PARTY_STATUS_TYPES', 'ON_HOLD', 'On Hold', 'Ù…Ø¹Ù„Ù‚', 'Party on hold', 'yellow', true, false, false, 40),
('PARTY_STATUS_TYPES', 'UNDER_REVIEW', 'Under Review', 'Ù‚ÙŠØ¯ Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø©', 'Party under review', 'orange', true, false, false, 50)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  badge_variant = EXCLUDED.badge_variant,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- CUSTOMER_TYPES (12 values) â€” REV1 EXPANDED
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('CUSTOMER_TYPES', 'NORMAL_CUSTOMER', 'Normal Customer', 'Ø¹Ù…ÙŠÙ„ Ø¹Ø§Ø¯ÙŠ', 'Normal customer', 'blue', true, false, true, 10),
('CUSTOMER_TYPES', 'GOVERNMENT_CUSTOMER', 'Government Customer', 'Ø¹Ù…ÙŠÙ„ Ø­ÙƒÙˆÙ…ÙŠ', 'Government customer (e.g., municipalities, government entities)', 'purple', true, false, false, 20),
('CUSTOMER_TYPES', 'SEMI_GOVERNMENT_CUSTOMER', 'Semi-Government Customer', 'Ø¹Ù…ÙŠÙ„ Ø´Ø¨Ù‡ Ø­ÙƒÙˆÙ…ÙŠ', 'Semi-government customer (e.g., Dubai Holding entities)', 'purple', true, false, false, 30),
('CUSTOMER_TYPES', 'UTILITY_COMPANY', 'Utility Company', 'Ø´Ø±ÙƒØ© Ø§Ù„Ù…Ø±Ø§ÙÙ‚', 'Utility company (e.g., TAQA, EWEC, DEWA)', 'orange', true, false, false, 40),
('CUSTOMER_TYPES', 'WATER_POWER_PLANT', 'Water & Power Plant', 'Ù…Ø­Ø·Ø© Ø§Ù„Ù…ÙŠØ§Ù‡ ÙˆØ§Ù„Ø·Ø§Ù‚Ø©', 'Water desalination plant or power generation facility', 'cyan', true, false, false, 50),
('CUSTOMER_TYPES', 'INDUSTRIAL_CUSTOMER', 'Industrial Customer', 'Ø¹Ù…ÙŠÙ„ ØµÙ†Ø§Ø¹ÙŠ', 'Industrial customer (e.g., manufacturing facilities, factories)', 'brown', true, false, false, 60),
('CUSTOMER_TYPES', 'COMMERCIAL_CUSTOMER', 'Commercial Customer', 'Ø¹Ù…ÙŠÙ„ ØªØ¬Ø§Ø±ÙŠ', 'Commercial customer (e.g., retail, hospitality, commercial real estate)', 'pink', true, false, false, 70),
('CUSTOMER_TYPES', 'MAIN_CONTRACTOR', 'Main Contractor', 'Ø§Ù„Ù…Ù‚Ø§ÙˆÙ„ Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠ', 'Main contractor', 'purple', true, false, false, 80),
('CUSTOMER_TYPES', 'EPC_CONTRACTOR', 'EPC Contractor', 'Ù…Ù‚Ø§ÙˆÙ„ EPC', 'EPC contractor', 'purple', true, false, false, 90),
('CUSTOMER_TYPES', 'SCRAP_BUYER', 'Scrap Buyer', 'Ù…Ø´ØªØ±ÙŠ Ø§Ù„Ø®Ø±Ø¯Ø©', 'Scrap buyer', 'green', true, false, false, 100),
('CUSTOMER_TYPES', 'SCRAP_SUPPLIER', 'Scrap Supplier', 'Ù…ÙˆØ±Ø¯ Ø§Ù„Ø®Ø±Ø¯Ø©', 'Scrap supplier', 'orange', true, false, false, 110),
('CUSTOMER_TYPES', 'PARTNER_CUSTOMER', 'Partner Customer', 'Ø¹Ù…ÙŠÙ„ Ø´Ø±ÙŠÙƒ', 'Partner customer', 'gold', true, false, false, 120)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  badge_variant = EXCLUDED.badge_variant,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- CUSTOMER_SEGMENTS (10 values)
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('CUSTOMER_SEGMENTS', 'ENTERPRISE', 'Enterprise', 'Ù…Ø¤Ø³Ø³Ø© ÙƒØ¨ÙŠØ±Ø©', 'Enterprise customer', 'purple', false, false, false, 10),
('CUSTOMER_SEGMENTS', 'SME', 'SME', 'Ø´Ø±ÙƒØ© ØµØºÙŠØ±Ø© ÙˆÙ…ØªÙˆØ³Ø·Ø©', 'Small and medium enterprise', 'blue', false, false, false, 20),
('CUSTOMER_SEGMENTS', 'GOVERNMENT', 'Government', 'Ø­ÙƒÙˆÙ…ÙŠ', 'Government sector', 'purple', false, false, false, 30),
('CUSTOMER_SEGMENTS', 'INDUSTRIAL', 'Industrial', 'ØµÙ†Ø§Ø¹ÙŠ', 'Industrial sector', 'brown', false, false, false, 40),
('CUSTOMER_SEGMENTS', 'COMMERCIAL', 'Commercial', 'ØªØ¬Ø§Ø±ÙŠ', 'Commercial sector', 'pink', false, false, false, 50),
('CUSTOMER_SEGMENTS', 'CONSTRUCTION', 'Construction', 'Ø¥Ù†Ø´Ø§Ø¡Ø§Øª', 'Construction sector', 'orange', false, false, false, 60),
('CUSTOMER_SEGMENTS', 'LOGISTICS', 'Logistics', 'Ù„ÙˆØ¬Ø³ØªÙŠØ§Øª', 'Logistics sector', 'cyan', false, false, false, 70),
('CUSTOMER_SEGMENTS', 'RETAIL', 'Retail', 'ØªØ¬Ø²Ø¦Ø©', 'Retail sector', 'green', false, false, false, 80),
('CUSTOMER_SEGMENTS', 'HOSPITALITY', 'Hospitality', 'Ø¶ÙŠØ§ÙØ©', 'Hospitality sector', 'yellow', false, false, false, 90),
('CUSTOMER_SEGMENTS', 'OTHER', 'Other', 'Ø£Ø®Ø±Ù‰', 'Other segment', 'gray', false, false, false, 100)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- VENDOR_TYPES (15 values) â€” REV1 EXPANDED
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('VENDOR_TYPES', 'SUPPLIER', 'Supplier', 'Ù…ÙˆØ±Ø¯', 'General supplier', 'blue', true, false, true, 10),
('VENDOR_TYPES', 'MATERIAL_SUPPLIER', 'Material Supplier', 'Ù…ÙˆØ±Ø¯ Ø§Ù„Ù…ÙˆØ§Ø¯', 'Material supplier', 'green', true, false, false, 20),
('VENDOR_TYPES', 'EQUIPMENT_SUPPLIER', 'Equipment Supplier', 'Ù…ÙˆØ±Ø¯ Ø§Ù„Ù…Ø¹Ø¯Ø§Øª', 'Equipment supplier', 'orange', true, false, false, 30),
('VENDOR_TYPES', 'SERVICE_PROVIDER', 'Service Provider', 'Ù…Ø²ÙˆØ¯ Ø§Ù„Ø®Ø¯Ù…Ø©', 'Service provider', 'purple', true, false, false, 40),
('VENDOR_TYPES', 'TRANSPORTER', 'Transporter', 'Ù†Ø§Ù‚Ù„', 'Transport service vendor (general transport services)', 'cyan', true, false, false, 50),
('VENDOR_TYPES', 'TRANSPORT_SERVICE_PROVIDER', 'Transport Service Provider', 'Ù…Ø²ÙˆØ¯ Ø®Ø¯Ù…Ø© Ø§Ù„Ù†Ù‚Ù„', 'Specialized transport service provider', 'cyan', true, false, false, 60),
('VENDOR_TYPES', 'LOGISTICS_SERVICE_PROVIDER', 'Logistics Service Provider', 'Ù…Ø²ÙˆØ¯ Ø®Ø¯Ù…Ø© Ù„ÙˆØ¬Ø³ØªÙŠØ©', '3PL logistics service provider', 'cyan', true, false, false, 70),
('VENDOR_TYPES', 'PRIVATE_WASTE_DISPOSAL_FACILITY', 'Private Waste Disposal Facility', 'Ù…Ø±ÙÙ‚ Ø§Ù„ØªØ®Ù„Øµ Ù…Ù† Ø§Ù„Ù†ÙØ§ÙŠØ§Øª Ø§Ù„Ø®Ø§ØµØ©', 'Private waste treatment/disposal company', 'green', true, false, false, 80),
('VENDOR_TYPES', 'WASTE_DISPOSAL_SERVICE_PROVIDER', 'Waste Disposal Service Provider', 'Ù…Ø²ÙˆØ¯ Ø®Ø¯Ù…Ø© Ø§Ù„ØªØ®Ù„Øµ Ù…Ù† Ø§Ù„Ù†ÙØ§ÙŠØ§Øª', 'Waste management service vendor', 'green', true, false, false, 90),
('VENDOR_TYPES', 'INSURANCE_COMPANY', 'Insurance Company', 'Ø´Ø±ÙƒØ© ØªØ£Ù…ÙŠÙ†', 'Insurance company', 'yellow', true, false, false, 100),
('VENDOR_TYPES', 'PROPERTY_LESSOR', 'Property Lessor', 'Ù…Ø¤Ø¬Ø± Ø§Ù„Ø¹Ù‚Ø§Ø±Ø§Øª', 'Property lessor', 'brown', true, false, false, 110),
('VENDOR_TYPES', 'VEHICLE_LESSOR', 'Vehicle Lessor', 'Ù…Ø¤Ø¬Ø± Ø§Ù„Ù…Ø±ÙƒØ¨Ø§Øª', 'Vehicle lessor', 'brown', true, false, false, 120),
('VENDOR_TYPES', 'EQUIPMENT_LESSOR', 'Equipment Lessor', 'Ù…Ø¤Ø¬Ø± Ø§Ù„Ù…Ø¹Ø¯Ø§Øª', 'Equipment lessor', 'brown', true, false, false, 130),
('VENDOR_TYPES', 'CAMP_ACCOMMODATION_LESSOR', 'Camp/Accommodation Lessor', 'Ù…Ø¤Ø¬Ø± Ø§Ù„Ù…Ø®ÙŠÙ…Ø§Øª/Ø§Ù„Ø¥Ù‚Ø§Ù…Ø©', 'Camp/accommodation lessor', 'brown', true, false, false, 140),
('VENDOR_TYPES', 'UTILITY_PROVIDER', 'Utility Provider', 'Ù…Ø²ÙˆØ¯ Ø§Ù„Ù…Ø±Ø§ÙÙ‚', 'Utility provider', 'gray', true, false, false, 150)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  badge_variant = EXCLUDED.badge_variant,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- VENDOR_CATEGORIES (8 values)
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('VENDOR_CATEGORIES', 'PREFERRED', 'Preferred Vendor', 'Ù…ÙˆØ±Ø¯ Ù…ÙØ¶Ù„', 'Preferred vendor', 'green', false, false, false, 10),
('VENDOR_CATEGORIES', 'APPROVED', 'Approved Vendor', 'Ù…ÙˆØ±Ø¯ Ù…Ø¹ØªÙ…Ø¯', 'Approved vendor', 'blue', false, false, false, 20),
('VENDOR_CATEGORIES', 'TRIAL', 'Trial Vendor', 'Ù…ÙˆØ±Ø¯ ØªØ¬Ø±ÙŠØ¨ÙŠ', 'Trial vendor', 'yellow', false, false, false, 30),
('VENDOR_CATEGORIES', 'LOCAL', 'Local Vendor', 'Ù…ÙˆØ±Ø¯ Ù…Ø­Ù„ÙŠ', 'Local UAE vendor', 'cyan', false, false, false, 40),
('VENDOR_CATEGORIES', 'INTERNATIONAL', 'International Vendor', 'Ù…ÙˆØ±Ø¯ Ø¯ÙˆÙ„ÙŠ', 'International vendor', 'purple', false, false, false, 50),
('VENDOR_CATEGORIES', 'STRATEGIC', 'Strategic Vendor', 'Ù…ÙˆØ±Ø¯ Ø§Ø³ØªØ±Ø§ØªÙŠØ¬ÙŠ', 'Strategic vendor', 'gold', false, false, false, 60),
('VENDOR_CATEGORIES', 'ONE_TIME', 'One-Time Vendor', 'Ù…ÙˆØ±Ø¯ Ù„Ù…Ø±Ø© ÙˆØ§Ø­Ø¯Ø©', 'One-time vendor', 'gray', false, false, false, 70),
('VENDOR_CATEGORIES', 'BLOCKED', 'Blocked Vendor', 'Ù…ÙˆØ±Ø¯ Ù…Ø­Ø¸ÙˆØ±', 'Blocked vendor', 'red', false, false, false, 80)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- SUPPLIER_CATEGORIES (6 values)
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('SUPPLIER_CATEGORIES', 'RAW_MATERIALS', 'Raw Materials', 'Ø§Ù„Ù…ÙˆØ§Ø¯ Ø§Ù„Ø®Ø§Ù…', 'Raw materials supplier', 'green', false, false, false, 10),
('SUPPLIER_CATEGORIES', 'SPARE_PARTS', 'Spare Parts', 'Ù‚Ø·Ø¹ Ø§Ù„ØºÙŠØ§Ø±', 'Spare parts supplier', 'orange', false, false, false, 20),
('SUPPLIER_CATEGORIES', 'CONSUMABLES', 'Consumables', 'Ø§Ù„Ù…ÙˆØ§Ø¯ Ø§Ù„Ø§Ø³ØªÙ‡Ù„Ø§ÙƒÙŠØ©', 'Consumables supplier', 'blue', false, false, false, 30),
('SUPPLIER_CATEGORIES', 'MACHINERY', 'Machinery', 'Ø§Ù„Ø¢Ù„Ø§Øª', 'Machinery supplier', 'purple', false, false, false, 40),
('SUPPLIER_CATEGORIES', 'CHEMICALS', 'Chemicals', 'Ø§Ù„Ù…ÙˆØ§Ø¯ Ø§Ù„ÙƒÙŠÙ…ÙŠØ§Ø¦ÙŠØ©', 'Chemicals supplier', 'yellow', false, false, false, 50),
('SUPPLIER_CATEGORIES', 'PACKAGING', 'Packaging', 'Ø§Ù„ØªØºÙ„ÙŠÙ', 'Packaging supplier', 'pink', false, false, false, 60)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- SUBCONTRACTOR_TYPES (8 values) â€” REV1 EXPANDED
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('SUBCONTRACTOR_TYPES', 'CIVIL_SUBCONTRACTOR', 'Civil Subcontractor', 'Ù…Ù‚Ø§ÙˆÙ„ Ù…Ø¯Ù†ÙŠ Ù…Ù† Ø§Ù„Ø¨Ø§Ø·Ù†', 'Civil subcontractor', 'blue', true, false, true, 10),
('SUBCONTRACTOR_TYPES', 'MANPOWER_SUBCONTRACTOR', 'Manpower Subcontractor', 'Ù…Ù‚Ø§ÙˆÙ„ Ø¹Ù…Ø§Ù„Ø© Ù…Ù† Ø§Ù„Ø¨Ø§Ø·Ù†', 'Manpower subcontractor', 'green', true, false, false, 20),
('SUBCONTRACTOR_TYPES', 'TRANSPORTER', 'Transporter', 'Ù†Ø§Ù‚Ù„', 'Transporter subcontractor (project execution)', 'orange', true, false, false, 30),
('SUBCONTRACTOR_TYPES', 'TRANSPORT_SUBCONTRACTOR', 'Transport Subcontractor', 'Ù…Ù‚Ø§ÙˆÙ„ Ù†Ù‚Ù„ Ù…Ù† Ø§Ù„Ø¨Ø§Ø·Ù†', 'Transport subcontractor (subcontracted for project execution)', 'orange', true, false, false, 40),
('SUBCONTRACTOR_TYPES', 'DEMOLITION_SUBCONTRACTOR', 'Demolition Subcontractor', 'Ù…Ù‚Ø§ÙˆÙ„ Ù‡Ø¯Ù… Ù…Ù† Ø§Ù„Ø¨Ø§Ø·Ù†', 'Demolition subcontractor', 'red', true, false, false, 50),
('SUBCONTRACTOR_TYPES', 'EQUIPMENT_SUBCONTRACTOR', 'Equipment Subcontractor', 'Ù…Ù‚Ø§ÙˆÙ„ Ù…Ø¹Ø¯Ø§Øª Ù…Ù† Ø§Ù„Ø¨Ø§Ø·Ù†', 'Equipment subcontractor', 'purple', true, false, false, 60),
('SUBCONTRACTOR_TYPES', 'SPECIALIZED_SUBCONTRACTOR', 'Specialized Subcontractor', 'Ù…Ù‚Ø§ÙˆÙ„ Ù…ØªØ®ØµØµ Ù…Ù† Ø§Ù„Ø¨Ø§Ø·Ù†', 'Specialized subcontractor (painting, electrical, HVAC, etc.)', 'cyan', true, false, false, 70),
('SUBCONTRACTOR_TYPES', 'PARTNER_SUBCONTRACTOR', 'Partner Subcontractor', 'Ù…Ù‚Ø§ÙˆÙ„ Ø´Ø±ÙŠÙƒ Ù…Ù† Ø§Ù„Ø¨Ø§Ø·Ù†', 'Partner subcontractor', 'gold', true, false, false, 80)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  badge_variant = EXCLUDED.badge_variant,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- SUBCONTRACTOR_CATEGORIES (6 values)
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('SUBCONTRACTOR_CATEGORIES', 'PREFERRED', 'Preferred Subcontractor', 'Ù…Ù‚Ø§ÙˆÙ„ Ù…Ù† Ø§Ù„Ø¨Ø§Ø·Ù† Ù…ÙØ¶Ù„', 'Preferred subcontractor', 'green', false, false, false, 10),
('SUBCONTRACTOR_CATEGORIES', 'APPROVED', 'Approved Subcontractor', 'Ù…Ù‚Ø§ÙˆÙ„ Ù…Ù† Ø§Ù„Ø¨Ø§Ø·Ù† Ù…Ø¹ØªÙ…Ø¯', 'Approved subcontractor', 'blue', false, false, false, 20),
('SUBCONTRACTOR_CATEGORIES', 'TRIAL', 'Trial Subcontractor', 'Ù…Ù‚Ø§ÙˆÙ„ Ù…Ù† Ø§Ù„Ø¨Ø§Ø·Ù† ØªØ¬Ø±ÙŠØ¨ÙŠ', 'Trial subcontractor', 'yellow', false, false, false, 30),
('SUBCONTRACTOR_CATEGORIES', 'LOCAL', 'Local Subcontractor', 'Ù…Ù‚Ø§ÙˆÙ„ Ù…Ù† Ø§Ù„Ø¨Ø§Ø·Ù† Ù…Ø­Ù„ÙŠ', 'Local UAE subcontractor', 'cyan', false, false, false, 40),
('SUBCONTRACTOR_CATEGORIES', 'INTERNATIONAL', 'International Subcontractor', 'Ù…Ù‚Ø§ÙˆÙ„ Ù…Ù† Ø§Ù„Ø¨Ø§Ø·Ù† Ø¯ÙˆÙ„ÙŠ', 'International subcontractor', 'purple', false, false, false, 50),
('SUBCONTRACTOR_CATEGORIES', 'BLOCKED', 'Blocked Subcontractor', 'Ù…Ù‚Ø§ÙˆÙ„ Ù…Ù† Ø§Ù„Ø¨Ø§Ø·Ù† Ù…Ø­Ø¸ÙˆØ±', 'Blocked subcontractor', 'red', false, false, false, 60)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- CONSULTANT_TYPES (6 values) â€” REV1 EXPANDED
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('CONSULTANT_TYPES', 'ENGINEERING_CONSULTANT', 'Engineering Consultant', 'Ø§Ø³ØªØ´Ø§Ø±ÙŠ Ù‡Ù†Ø¯Ø³ÙŠ', 'Engineering consultant', 'blue', true, false, true, 10),
('CONSULTANT_TYPES', 'HSE_CONSULTANT', 'HSE Consultant', 'Ø§Ø³ØªØ´Ø§Ø±ÙŠ Ø§Ù„ØµØ­Ø© ÙˆØ§Ù„Ø³Ù„Ø§Ù…Ø© ÙˆØ§Ù„Ø¨ÙŠØ¦Ø©', 'HSE consultant', 'red', true, false, false, 20),
('CONSULTANT_TYPES', 'LEGAL_CONSULTANT', 'Legal Consultant', 'Ø§Ø³ØªØ´Ø§Ø±ÙŠ Ù‚Ø§Ù†ÙˆÙ†ÙŠ', 'Legal consultant', 'purple', true, false, false, 30),
('CONSULTANT_TYPES', 'TECHNICAL_CONSULTANT', 'Technical Consultant', 'Ø§Ø³ØªØ´Ø§Ø±ÙŠ ÙÙ†ÙŠ', 'Technical consultant', 'green', true, false, false, 40),
('CONSULTANT_TYPES', 'ENVIRONMENTAL_CONSULTANT', 'Environmental Consultant', 'Ø§Ø³ØªØ´Ø§Ø±ÙŠ Ø¨ÙŠØ¦ÙŠ', 'Environmental consultant', 'green', true, false, false, 50),
('CONSULTANT_TYPES', 'AUDIT_CONSULTANT', 'Audit Consultant', 'Ø§Ø³ØªØ´Ø§Ø±ÙŠ ØªØ¯Ù‚ÙŠÙ‚', 'Audit consultant (financial, operational, compliance)', 'orange', true, false, false, 60)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  badge_variant = EXCLUDED.badge_variant,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- CONSULTANT_CATEGORIES (4 values)
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('CONSULTANT_CATEGORIES', 'RETAINER', 'Retainer Consultant', 'Ø§Ø³ØªØ´Ø§Ø±ÙŠ Ù…Ø­ØªÙØ¸ Ø¨Ù‡', 'Retainer consultant', 'green', false, false, false, 10),
('CONSULTANT_CATEGORIES', 'PROJECT_BASED', 'Project-Based Consultant', 'Ø§Ø³ØªØ´Ø§Ø±ÙŠ Ø¹Ù„Ù‰ Ø£Ø³Ø§Ø³ Ø§Ù„Ù…Ø´Ø±ÙˆØ¹', 'Project-based consultant', 'blue', false, false, false, 20),
('CONSULTANT_CATEGORIES', 'ADHOC', 'Ad-Hoc Consultant', 'Ø§Ø³ØªØ´Ø§Ø±ÙŠ Ù…Ø®ØµØµ', 'Ad-hoc consultant', 'yellow', false, false, false, 30),
('CONSULTANT_CATEGORIES', 'STRATEGIC', 'Strategic Consultant', 'Ø§Ø³ØªØ´Ø§Ø±ÙŠ Ø§Ø³ØªØ±Ø§ØªÙŠØ¬ÙŠ', 'Strategic consultant', 'purple', false, false, false, 40)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- GOVERNMENT_AUTHORITY_TYPES (15 values) â€” REV1 EXPANDED
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('GOVERNMENT_AUTHORITY_TYPES', 'LICENSE_ISSUER', 'License Issuer', 'Ù…ØµØ¯Ø± Ø§Ù„Ø±Ø®ØµØ©', 'License issuer (e.g., Dubai Economic Department)', 'blue', true, false, false, 10),
('GOVERNMENT_AUTHORITY_TYPES', 'PERMIT_ISSUER', 'Permit Issuer', 'Ù…ØµØ¯Ø± Ø§Ù„ØªØµØ±ÙŠØ­', 'Permit issuer (e.g., CICPA, environmental permits)', 'blue', true, false, false, 20),
('GOVERNMENT_AUTHORITY_TYPES', 'REGULATOR', 'Regulator', 'Ø§Ù„Ù…Ù†Ø¸Ù…', 'Regulator', 'gray', true, false, true, 30),
('GOVERNMENT_AUTHORITY_TYPES', 'MUNICIPALITY', 'Municipality', 'Ø§Ù„Ø¨Ù„Ø¯ÙŠØ©', 'Municipality', 'blue', true, false, false, 40),
('GOVERNMENT_AUTHORITY_TYPES', 'POLICE', 'Police', 'Ø§Ù„Ø´Ø±Ø·Ø©', 'Police', 'red', true, false, false, 50),
('GOVERNMENT_AUTHORITY_TYPES', 'CIVIL_DEFENSE', 'Civil Defense', 'Ø§Ù„Ø¯ÙØ§Ø¹ Ø§Ù„Ù…Ø¯Ù†ÙŠ', 'Civil defense', 'red', true, false, false, 60),
('GOVERNMENT_AUTHORITY_TYPES', 'ENVIRONMENTAL_AUTHORITY', 'Environmental Authority', 'Ø§Ù„Ù‡ÙŠØ¦Ø© Ø§Ù„Ø¨ÙŠØ¦ÙŠØ©', 'Environmental authority', 'green', true, false, false, 70),
('GOVERNMENT_AUTHORITY_TYPES', 'FREE_ZONE_AUTHORITY', 'Free Zone Authority', 'Ù‡ÙŠØ¦Ø© Ø§Ù„Ù…Ù†Ø·Ù‚Ø© Ø§Ù„Ø­Ø±Ø©', 'Free zone authority', 'purple', true, false, false, 80),
('GOVERNMENT_AUTHORITY_TYPES', 'PORT_AUTHORITY', 'Port Authority', 'Ø³Ù„Ø·Ø© Ø§Ù„Ù…ÙŠÙ†Ø§Ø¡', 'Port authority', 'cyan', true, false, false, 90),
('GOVERNMENT_AUTHORITY_TYPES', 'CUSTOMS_AUTHORITY', 'Customs Authority', 'Ø³Ù„Ø·Ø© Ø§Ù„Ø¬Ù…Ø§Ø±Ùƒ', 'Customs authority', 'cyan', true, false, false, 100),
('GOVERNMENT_AUTHORITY_TYPES', 'PORT_CUSTOMS_AUTHORITY', 'Port & Customs Authority', 'Ø³Ù„Ø·Ø© Ø§Ù„Ù…ÙŠÙ†Ø§Ø¡ ÙˆØ§Ù„Ø¬Ù…Ø§Ø±Ùƒ', 'Combined port and customs authority', 'cyan', true, false, false, 110),
('GOVERNMENT_AUTHORITY_TYPES', 'UTILITY_AUTHORITY', 'Utility Authority', 'Ø³Ù„Ø·Ø© Ø§Ù„Ù…Ø±Ø§ÙÙ‚', 'Utility authority', 'orange', true, false, false, 120),
('GOVERNMENT_AUTHORITY_TYPES', 'TRANSPORT_AUTHORITY', 'Transport Authority', 'Ø³Ù„Ø·Ø© Ø§Ù„Ù†Ù‚Ù„', 'Transport authority (e.g., Dubai RTA, Abu Dhabi DOT)', 'orange', true, false, false, 130),
('GOVERNMENT_AUTHORITY_TYPES', 'WASTE_DISPOSAL_FACILITY', 'Waste Disposal Facility', 'Ù…Ø±ÙÙ‚ Ø§Ù„ØªØ®Ù„Øµ Ù…Ù† Ø§Ù„Ù†ÙØ§ÙŠØ§Øª', 'Government waste disposal facility', 'green', true, false, false, 140),
('GOVERNMENT_AUTHORITY_TYPES', 'GOVERNMENT_WASTE_DISPOSAL_AUTHORITY', 'Govt Waste Disposal Authority', 'Ø³Ù„Ø·Ø© Ø§Ù„ØªØ®Ù„Øµ Ù…Ù† Ø§Ù„Ù†ÙØ§ÙŠØ§Øª Ø§Ù„Ø­ÙƒÙˆÙ…ÙŠØ©', 'Government waste disposal authority', 'green', true, false, false, 150),
('GOVERNMENT_AUTHORITY_TYPES', 'MINISTRY', 'Ministry', 'Ø§Ù„ÙˆØ²Ø§Ø±Ø©', 'Ministry', 'purple', true, false, false, 160)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  badge_variant = EXCLUDED.badge_variant,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- GOVERNMENT_AUTHORITY_CATEGORIES (4 values)
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('GOVERNMENT_AUTHORITY_CATEGORIES', 'FEDERAL', 'Federal Authority', 'Ø¬Ù‡Ø© Ø§ØªØ­Ø§Ø¯ÙŠØ©', 'Federal authority', 'purple', false, false, false, 10),
('GOVERNMENT_AUTHORITY_CATEGORIES', 'EMIRATE', 'Emirate Authority', 'Ø¬Ù‡Ø© Ø¥Ù…Ø§Ø±Ø©', 'Emirate authority', 'blue', false, false, false, 20),
('GOVERNMENT_AUTHORITY_CATEGORIES', 'LOCAL', 'Local Authority', 'Ø¬Ù‡Ø© Ù…Ø­Ù„ÙŠØ©', 'Local authority', 'cyan', false, false, false, 30),
('GOVERNMENT_AUTHORITY_CATEGORIES', 'FREE_ZONE', 'Free Zone Authority', 'Ø¬Ù‡Ø© Ù…Ù†Ø·Ù‚Ø© Ø­Ø±Ø©', 'Free zone authority', 'purple', false, false, false, 40)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- JURISDICTION_LEVEL_TYPES (4 values)
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('JURISDICTION_LEVEL_TYPES', 'FEDERAL', 'Federal', 'Ø§ØªØ­Ø§Ø¯ÙŠ', 'Federal jurisdiction', 'purple', true, false, false, 10),
('JURISDICTION_LEVEL_TYPES', 'EMIRATE', 'Emirate', 'Ø¥Ù…Ø§Ø±Ø©', 'Emirate jurisdiction', 'blue', true, false, false, 20),
('JURISDICTION_LEVEL_TYPES', 'MUNICIPALITY', 'Municipality', 'Ø¨Ù„Ø¯ÙŠØ©', 'Municipality jurisdiction', 'cyan', true, false, false, 30),
('JURISDICTION_LEVEL_TYPES', 'FREE_ZONE', 'Free Zone', 'Ù…Ù†Ø·Ù‚Ø© Ø­Ø±Ø©', 'Free zone jurisdiction', 'purple', true, false, false, 40)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- RECRUITMENT_AGENCY_TYPES (4 values)
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('RECRUITMENT_AGENCY_TYPES', 'LOCAL_RECRUITMENT_AGENCY', 'Local Recruitment Agency', 'ÙˆÙƒØ§Ù„Ø© ØªÙˆØ¸ÙŠÙ Ù…Ø­Ù„ÙŠØ©', 'Local UAE recruitment agency', 'blue', true, false, false, 10),
('RECRUITMENT_AGENCY_TYPES', 'OVERSEAS_RECRUITMENT_AGENCY', 'Overseas Recruitment Agency', 'ÙˆÙƒØ§Ù„Ø© ØªÙˆØ¸ÙŠÙ Ø®Ø§Ø±Ø¬ÙŠØ©', 'Overseas recruitment agency', 'purple', true, false, false, 20),
('RECRUITMENT_AGENCY_TYPES', 'MANPOWER_SUPPLY_AGENCY', 'Manpower Supply Agency', 'ÙˆÙƒØ§Ù„Ø© ØªÙˆØ±ÙŠØ¯ Ø§Ù„Ù‚ÙˆÙ‰ Ø§Ù„Ø¹Ø§Ù…Ù„Ø©', 'Manpower supply agency', 'green', true, false, false, 30),
('RECRUITMENT_AGENCY_TYPES', 'EXECUTIVE_SEARCH_AGENCY', 'Executive Search Agency', 'ÙˆÙƒØ§Ù„Ø© Ø§Ù„Ø¨Ø­Ø« Ø§Ù„ØªÙ†ÙÙŠØ°ÙŠ', 'Executive search agency', 'gold', true, false, false, 40)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- ICV_STATUS_TYPES (6 values)
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('ICV_STATUS_TYPES', 'VALID', 'Valid', 'ØµØ§Ù„Ø­', 'ICV certificate is valid', 'green', true, false, false, 10),
('ICV_STATUS_TYPES', 'EXPIRED', 'Expired', 'Ù…Ù†ØªÙ‡ÙŠ Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ©', 'ICV certificate has expired', 'red', true, false, false, 20),
('ICV_STATUS_TYPES', 'UNDER_RENEWAL', 'Under Renewal', 'Ù‚ÙŠØ¯ Ø§Ù„ØªØ¬Ø¯ÙŠØ¯', 'ICV certificate is under renewal', 'orange', true, false, false, 30),
('ICV_STATUS_TYPES', 'NOT_AVAILABLE', 'Not Available', 'ØºÙŠØ± Ù…ØªÙˆÙØ±', 'ICV certificate is not available', 'gray', true, false, true, 40),
('ICV_STATUS_TYPES', 'NOT_REQUIRED', 'Not Required', 'ØºÙŠØ± Ù…Ø·Ù„ÙˆØ¨', 'ICV certificate is not required', 'blue', true, false, false, 50),
('ICV_STATUS_TYPES', 'PENDING_SUBMISSION', 'Pending Submission', 'Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„ØªÙ‚Ø¯ÙŠÙ…', 'ICV certificate/details are pending submission', 'yellow', true, false, false, 60)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- RECRUITMENT_AGENCY_CATEGORIES (4 values)
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('RECRUITMENT_AGENCY_CATEGORIES', 'PREFERRED', 'Preferred Agency', 'ÙˆÙƒØ§Ù„Ø© Ù…ÙØ¶Ù„Ø©', 'Preferred recruitment agency', 'green', false, false, false, 10),
('RECRUITMENT_AGENCY_CATEGORIES', 'APPROVED', 'Approved Agency', 'ÙˆÙƒØ§Ù„Ø© Ù…Ø¹ØªÙ…Ø¯Ø©', 'Approved recruitment agency', 'blue', false, false, false, 20),
('RECRUITMENT_AGENCY_CATEGORIES', 'TRIAL', 'Trial Agency', 'ÙˆÙƒØ§Ù„Ø© ØªØ¬Ø±ÙŠØ¨ÙŠØ©', 'Trial recruitment agency', 'yellow', false, false, false, 30),
('RECRUITMENT_AGENCY_CATEGORIES', 'BLOCKED', 'Blocked Agency', 'ÙˆÙƒØ§Ù„Ø© Ù…Ø­Ø¸ÙˆØ±Ø©', 'Blocked recruitment agency', 'red', false, false, false, 40)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- INDUSTRY_TYPES (12 values)
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('INDUSTRY_TYPES', 'CONSTRUCTION', 'Construction', 'Ø¥Ù†Ø´Ø§Ø¡Ø§Øª', 'Construction industry', 'orange', false, false, false, 10),
('INDUSTRY_TYPES', 'MANUFACTURING', 'Manufacturing', 'ØªØµÙ†ÙŠØ¹', 'Manufacturing industry', 'brown', false, false, false, 20),
('INDUSTRY_TYPES', 'LOGISTICS', 'Logistics', 'Ù„ÙˆØ¬Ø³ØªÙŠØ§Øª', 'Logistics industry', 'cyan', false, false, false, 30),
('INDUSTRY_TYPES', 'RETAIL', 'Retail', 'ØªØ¬Ø²Ø¦Ø©', 'Retail industry', 'green', false, false, false, 40),
('INDUSTRY_TYPES', 'HOSPITALITY', 'Hospitality', 'Ø¶ÙŠØ§ÙØ©', 'Hospitality industry', 'yellow', false, false, false, 50),
('INDUSTRY_TYPES', 'GOVERNMENT', 'Government', 'Ø­ÙƒÙˆÙ…ÙŠ', 'Government sector', 'purple', false, false, false, 60),
('INDUSTRY_TYPES', 'UTILITIES', 'Utilities', 'Ø§Ù„Ù…Ø±Ø§ÙÙ‚', 'Utilities industry', 'orange', false, false, false, 70),
('INDUSTRY_TYPES', 'ENERGY', 'Energy', 'Ø·Ø§Ù‚Ø©', 'Energy industry', 'red', false, false, false, 80),
('INDUSTRY_TYPES', 'HEALTHCARE', 'Healthcare', 'Ø±Ø¹Ø§ÙŠØ© ØµØ­ÙŠØ©', 'Healthcare industry', 'pink', false, false, false, 90),
('INDUSTRY_TYPES', 'REAL_ESTATE', 'Real Estate', 'Ø¹Ù‚Ø§Ø±Ø§Øª', 'Real estate industry', 'brown', false, false, false, 100),
('INDUSTRY_TYPES', 'TECHNOLOGY', 'Technology', 'ØªÙ‚Ù†ÙŠØ©', 'Technology industry', 'blue', false, false, false, 110),
('INDUSTRY_TYPES', 'OTHER', 'Other', 'Ø£Ø®Ø±Ù‰', 'Other industry', 'gray', false, false, false, 120)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- CRM_LEAD_SOURCES (10 values)
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('CRM_LEAD_SOURCES', 'WEBSITE', 'Website', 'Ù…ÙˆÙ‚Ø¹ Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ', 'Website inquiry', 'blue', false, false, false, 10),
('CRM_LEAD_SOURCES', 'REFERRAL', 'Referral', 'Ø¥Ø­Ø§Ù„Ø©', 'Customer referral', 'green', false, false, false, 20),
('CRM_LEAD_SOURCES', 'DIRECT_SALES', 'Direct Sales', 'Ù…Ø¨ÙŠØ¹Ø§Øª Ù…Ø¨Ø§Ø´Ø±Ø©', 'Direct sales team', 'purple', false, false, false, 30),
('CRM_LEAD_SOURCES', 'SOCIAL_MEDIA', 'Social Media', 'ÙˆØ³Ø§Ø¦Ù„ Ø§Ù„ØªÙˆØ§ØµÙ„ Ø§Ù„Ø§Ø¬ØªÙ…Ø§Ø¹ÙŠ', 'Social media', 'cyan', false, false, false, 40),
('CRM_LEAD_SOURCES', 'EMAIL_CAMPAIGN', 'Email Campaign', 'Ø­Ù…Ù„Ø© Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ', 'Email marketing campaign', 'orange', false, false, false, 50),
('CRM_LEAD_SOURCES', 'TRADE_SHOW', 'Trade Show', 'Ù…Ø¹Ø±Ø¶ ØªØ¬Ø§Ø±ÙŠ', 'Trade show/exhibition', 'yellow', false, false, false, 60),
('CRM_LEAD_SOURCES', 'COLD_CALL', 'Cold Call', 'Ù…ÙƒØ§Ù„Ù…Ø© Ø¨Ø§Ø±Ø¯Ø©', 'Cold call', 'gray', false, false, false, 70),
('CRM_LEAD_SOURCES', 'EXISTING_CUSTOMER', 'Existing Customer', 'Ø¹Ù…ÙŠÙ„ Ø­Ø§Ù„ÙŠ', 'Existing customer', 'green', false, false, false, 80),
('CRM_LEAD_SOURCES', 'PARTNER', 'Partner', 'Ø´Ø±ÙŠÙƒ', 'Partner referral', 'gold', false, false, false, 90),
('CRM_LEAD_SOURCES', 'OTHER', 'Other', 'Ø£Ø®Ø±Ù‰', 'Other source', 'gray', false, false, false, 100)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- CONTACT_TYPES (8 values)
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('CONTACT_TYPES', 'PRIMARY', 'Primary Contact', 'Ø¬Ù‡Ø© Ø§ØªØµØ§Ù„ Ø±Ø¦ÙŠØ³ÙŠØ©', 'Primary contact', 'blue', false, false, false, 10),
('CONTACT_TYPES', 'FINANCE', 'Finance Contact', 'Ø¬Ù‡Ø© Ø§ØªØµØ§Ù„ Ù…Ø§Ù„ÙŠØ©', 'Finance contact', 'green', false, false, false, 20),
('CONTACT_TYPES', 'OPERATIONS', 'Operations Contact', 'Ø¬Ù‡Ø© Ø§ØªØµØ§Ù„ ØªØ´ØºÙŠÙ„ÙŠØ©', 'Operations contact', 'orange', false, false, false, 30),
('CONTACT_TYPES', 'TECHNICAL', 'Technical Contact', 'Ø¬Ù‡Ø© Ø§ØªØµØ§Ù„ ÙÙ†ÙŠØ©', 'Technical contact', 'purple', false, false, false, 40),
('CONTACT_TYPES', 'SALES', 'Sales Contact', 'Ø¬Ù‡Ø© Ø§ØªØµØ§Ù„ Ù…Ø¨ÙŠØ¹Ø§Øª', 'Sales contact', 'cyan', false, false, false, 50),
('CONTACT_TYPES', 'LEGAL', 'Legal Contact', 'Ø¬Ù‡Ø© Ø§ØªØµØ§Ù„ Ù‚Ø§Ù†ÙˆÙ†ÙŠØ©', 'Legal contact', 'red', false, false, false, 60),
('CONTACT_TYPES', 'AUTHORIZED_SIGNATORY', 'Authorized Signatory', 'Ù…ÙÙˆØ¶ Ø¨Ø§Ù„ØªÙˆÙ‚ÙŠØ¹', 'Authorized signatory', 'gold', false, false, false, 70),
('CONTACT_TYPES', 'OTHER', 'Other Contact', 'Ø¬Ù‡Ø© Ø§ØªØµØ§Ù„ Ø£Ø®Ø±Ù‰', 'Other contact', 'gray', false, false, false, 80)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- COMMUNICATION_PREFERENCE_TYPES (6 values)
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('COMMUNICATION_PREFERENCE_TYPES', 'EMAIL', 'Email', 'Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ', 'Email communication', 'blue', false, false, false, 10),
('COMMUNICATION_PREFERENCE_TYPES', 'PHONE', 'Phone', 'Ù‡Ø§ØªÙ', 'Phone communication', 'green', false, false, false, 20),
('COMMUNICATION_PREFERENCE_TYPES', 'WHATSAPP', 'WhatsApp', 'ÙˆØ§ØªØ³Ø§Ø¨', 'WhatsApp communication', 'green', false, false, false, 30),
('COMMUNICATION_PREFERENCE_TYPES', 'SMS', 'SMS', 'Ø±Ø³Ø§Ù„Ø© Ù†ØµÙŠØ©', 'SMS communication', 'orange', false, false, false, 40),
('COMMUNICATION_PREFERENCE_TYPES', 'IN_PERSON', 'In Person', 'Ø´Ø®ØµÙŠØ§Ù‹', 'In-person communication', 'purple', false, false, false, 50),
('COMMUNICATION_PREFERENCE_TYPES', 'NO_CONTACT', 'No Contact', 'Ù„Ø§ ØªÙˆØ§ØµÙ„', 'Do not contact', 'red', false, false, false, 60)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- ADDRESS_TYPES (5 values)
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('ADDRESS_TYPES', 'BILLING', 'Billing Address', 'Ø¹Ù†ÙˆØ§Ù† Ø§Ù„ÙÙˆØ§ØªÙŠØ±', 'Billing address', 'blue', false, false, false, 10),
('ADDRESS_TYPES', 'SHIPPING', 'Shipping Address', 'Ø¹Ù†ÙˆØ§Ù† Ø§Ù„Ø´Ø­Ù†', 'Shipping address', 'green', false, false, false, 20),
('ADDRESS_TYPES', 'SITE', 'Site Address', 'Ø¹Ù†ÙˆØ§Ù† Ø§Ù„Ù…ÙˆÙ‚Ø¹', 'Site address', 'orange', false, false, false, 30),
('ADDRESS_TYPES', 'OFFICE', 'Office Address', 'Ø¹Ù†ÙˆØ§Ù† Ø§Ù„Ù…ÙƒØªØ¨', 'Office address', 'purple', false, false, false, 40),
('ADDRESS_TYPES', 'OTHER', 'Other Address', 'Ø¹Ù†ÙˆØ§Ù† Ø¢Ø®Ø±', 'Other address', 'gray', false, false, false, 50)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- PARTY_DOCUMENT_TYPES (12 values)
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('PARTY_DOCUMENT_TYPES', 'TRN_CERTIFICATE', 'TRN Certificate', 'Ø´Ù‡Ø§Ø¯Ø© Ø§Ù„ØªØ³Ø¬ÙŠÙ„ Ø§Ù„Ø¶Ø±ÙŠØ¨ÙŠ', 'Tax Registration Number certificate', 'blue', false, false, false, 10),
('PARTY_DOCUMENT_TYPES', 'TRADE_LICENSE', 'Trade License', 'Ø§Ù„Ø±Ø®ØµØ© Ø§Ù„ØªØ¬Ø§Ø±ÙŠØ©', 'Trade license', 'blue', false, false, false, 20),
('PARTY_DOCUMENT_TYPES', 'INSURANCE_POLICY', 'Insurance Policy', 'ÙˆØ«ÙŠÙ‚Ø© Ø§Ù„ØªØ£Ù…ÙŠÙ†', 'Insurance policy', 'green', false, false, false, 30),
('PARTY_DOCUMENT_TYPES', 'REGISTRATION_CERTIFICATE', 'Registration Certificate', 'Ø´Ù‡Ø§Ø¯Ø© Ø§Ù„ØªØ³Ø¬ÙŠÙ„', 'Registration certificate', 'purple', false, false, false, 40),
('PARTY_DOCUMENT_TYPES', 'HSE_CERTIFICATE', 'HSE Certificate', 'Ø´Ù‡Ø§Ø¯Ø© Ø§Ù„ØµØ­Ø© ÙˆØ§Ù„Ø³Ù„Ø§Ù…Ø© ÙˆØ§Ù„Ø¨ÙŠØ¦Ø©', 'HSE certificate', 'red', false, false, false, 50),
('PARTY_DOCUMENT_TYPES', 'QUALITY_CERTIFICATE', 'Quality Certificate', 'Ø´Ù‡Ø§Ø¯Ø© Ø§Ù„Ø¬ÙˆØ¯Ø©', 'Quality certificate', 'orange', false, false, false, 60),
('PARTY_DOCUMENT_TYPES', 'AUTHORIZATION_LETTER', 'Authorization Letter', 'Ø®Ø·Ø§Ø¨ Ø§Ù„ØªÙÙˆÙŠØ¶', 'Authorization letter', 'yellow', false, false, false, 70),
('PARTY_DOCUMENT_TYPES', 'BANK_LETTER', 'Bank Letter', 'Ø®Ø·Ø§Ø¨ Ø§Ù„Ø¨Ù†Ùƒ', 'Bank letter', 'cyan', false, false, false, 80),
('PARTY_DOCUMENT_TYPES', 'CONTRACT', 'Contract', 'Ø¹Ù‚Ø¯', 'Contract', 'purple', false, false, false, 90),
('PARTY_DOCUMENT_TYPES', 'MOU', 'MOU', 'Ù…Ø°ÙƒØ±Ø© ØªÙØ§Ù‡Ù…', 'Memorandum of Understanding', 'blue', false, false, false, 100),
('PARTY_DOCUMENT_TYPES', 'ID_DOCUMENT', 'ID Document', 'ÙˆØ«ÙŠÙ‚Ø© Ø§Ù„Ù‡ÙˆÙŠØ©', 'ID document', 'gray', false, false, false, 110),
('PARTY_DOCUMENT_TYPES', 'OTHER', 'Other Document', 'Ù…Ø³ØªÙ†Ø¯ Ø¢Ø®Ø±', 'Other document', 'gray', false, false, false, 120)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- BANK_ACCOUNT_TYPES (4 values)
-- ----------------------------------------------------------------------------
INSERT INTO global_lookup_values (
  category_code, value_code, value_name_en, value_name_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
) VALUES
('BANK_ACCOUNT_TYPES', 'CURRENT', 'Current Account', 'Ø­Ø³Ø§Ø¨ Ø¬Ø§Ø±ÙŠ', 'Current account', 'blue', false, false, false, 10),
('BANK_ACCOUNT_TYPES', 'SAVINGS', 'Savings Account', 'Ø­Ø³Ø§Ø¨ ØªÙˆÙÙŠØ±', 'Savings account', 'green', false, false, false, 20),
('BANK_ACCOUNT_TYPES', 'BUSINESS', 'Business Account', 'Ø­Ø³Ø§Ø¨ ØªØ¬Ø§Ø±ÙŠ', 'Business account', 'purple', false, false, false, 30),
('BANK_ACCOUNT_TYPES', 'ESCROW', 'Escrow Account', 'Ø­Ø³Ø§Ø¨ Ø¶Ù…Ø§Ù†', 'Escrow account', 'orange', false, false, false, 40)

ON CONFLICT (category_code, value_code) 
DO UPDATE SET 
  value_name_en = EXCLUDED.value_name_en,
  value_name_ar = EXCLUDED.value_name_ar,
  updated_at = now();

-- ============================================================================
