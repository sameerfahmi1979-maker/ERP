WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = 'VENDOR_TYPES' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id, value_code, value_label_en, value_label_ar, 
  description, badge_variant, is_system, is_locked, is_default, sort_order
)
VALUES
  ((SELECT id FROM cat),   'SUPPLIER', 'Supplier', 'مورد', 'General supplier', 'blue', true, false, true, 10),
  ((SELECT id FROM cat), 'MATERIAL_SUPPLIER', 'Material Supplier', 'مورد المواد', 'Material supplier', 'green', true, false, false, 20),
  ((SELECT id FROM cat), 'EQUIPMENT_SUPPLIER', 'Equipment Supplier', 'مورد المعدات', 'Equipment supplier', 'orange', true, false, false, 30),
  ((SELECT id FROM cat), 'SERVICE_PROVIDER', 'Service Provider', 'مزود الخدمة', 'Service provider', 'purple', true, false, false, 40),
  ((SELECT id FROM cat), 'TRANSPORTER', 'Transporter', 'ناقل', 'Transport service vendor (general transport services)', 'cyan', true, false, false, 50),
  ((SELECT id FROM cat), 'TRANSPORT_SERVICE_PROVIDER', 'Transport Service Provider', 'مزود خدمة النقل', 'Specialized transport service provider', 'cyan', true, false, false, 60),
  ((SELECT id FROM cat), 'LOGISTICS_SERVICE_PROVIDER', 'Logistics Service Provider', 'مزود خدمة لوجستية', '3PL logistics service provider', 'cyan', true, false, false, 70),
  ((SELECT id FROM cat), 'PRIVATE_WASTE_DISPOSAL_FACILITY', 'Private Waste Disposal Facility', 'مرفق التخلص من النفايات الخاصة', 'Private waste treatment/disposal company', 'green', true, false, false, 80),
  ((SELECT id FROM cat), 'WASTE_DISPOSAL_SERVICE_PROVIDER', 'Waste Disposal Service Provider', 'مزود خدمة التخلص من النفايات', 'Waste management service vendor', 'green', true, false, false, 90),
  ((SELECT id FROM cat), 'INSURANCE_COMPANY', 'Insurance Company', 'شركة تأمين', 'Insurance company', 'yellow', true, false, false, 100),
  ((SELECT id FROM cat), 'PROPERTY_LESSOR', 'Property Lessor', 'مؤجر العقارات', 'Property lessor', 'brown', true, false, false, 110),
  ((SELECT id FROM cat), 'VEHICLE_LESSOR', 'Vehicle Lessor', 'مؤجر المركبات', 'Vehicle lessor', 'brown', true, false, false, 120),
  ((SELECT id FROM cat), 'EQUIPMENT_LESSOR', 'Equipment Lessor', 'مؤجر المعدات', 'Equipment lessor', 'brown', true, false, false, 130),
  ((SELECT id FROM cat), 'CAMP_ACCOMMODATION_LESSOR', 'Camp/Accommodation Lessor', 'مؤجر المخيمات/الإقامة', 'Camp/accommodation lessor', 'brown', true, false, false, 140),
  ((SELECT id FROM cat), 'UTILITY_PROVIDER', 'Utility Provider', 'مزود المرافق', 'Utility provider', 'gray', true, false, false, 150)
ON CONFLICT (category_id, value_code) 
DO UPDATE SET 
  value_label_en = EXCLUDED.value_label_en,
  value_label_ar = EXCLUDED.value_label_ar,
  badge_variant = EXCLUDED.badge_variant,
  updated_at = now();