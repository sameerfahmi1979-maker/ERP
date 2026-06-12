-- SECTION 3: PERMISSIONS AND ROLE ASSIGNMENTS (4 Grouped Permissions)
-- ============================================================================

-- Insert grouped party master permissions (idempotent)
INSERT INTO permissions (permission_code, permission_name_en, permission_name_ar, description, module_code, is_system, sort_order)
VALUES
('master_data.party_master.view', 'View Party Master Data', 'عرض البيانات الرئيسية للطرف', 
 'View all party entities (customers, vendors, subcontractors, consultants, government authorities, recruitment agencies)', 
 'PARTIES', true, 10),
('master_data.party_master.manage', 'Manage Party Master Data', 'إدارة البيانات الرئيسية للطرف', 
 'Create, edit, deactivate all party entities and child records', 
 'PARTIES', true, 20),
('master_data.party_master.export', 'Export Party Master Data', 'تصدير البيانات الرئيسية للطرف', 
 'Export all party data to CSV/Excel', 
 'PARTIES', true, 30),
('master_data.party_master.audit_view', 'View Party Audit Logs', 'عرض سجلات تدقيق الطرف', 
 'View audit logs for all party entities', 
 'PARTIES', true, 40)
ON CONFLICT (permission_code) 
DO UPDATE SET 
  permission_name_en = EXCLUDED.permission_name_en,
  permission_name_ar = EXCLUDED.permission_name_ar,
  description = EXCLUDED.description,
  updated_at = now();

-- Assign permissions to roles
-- system_admin: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'system_admin'
  AND p.permission_code IN (
  'master_data.party_master.view',
  'master_data.party_master.manage',
  'master_data.party_master.export',
  'master_data.party_master.audit_view'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- group_admin: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'group_admin'
  AND p.permission_code IN (
  'master_data.party_master.view',
  'master_data.party_master.manage',
  'master_data.party_master.export',
  'master_data.party_master.audit_view'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- company_admin: view and export only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'company_admin'
  AND p.permission_code IN (
  'master_data.party_master.view',
  'master_data.party_master.export'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- branch_admin: view only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'branch_admin'
  AND p.permission_code IN (
  'master_data.party_master.view'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

