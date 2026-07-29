-- OUTPUT.6 (WP10) — Grant Operations Console permissions to System Administrator.
-- The permission rows themselves were created in OUTPUT.1 (20260726120000).
-- Separation of duties: ops permissions grant operational metadata access only;
-- protected document CONTENT stays behind document-level permissions.

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_name = 'System Administrator'
  AND p.permission_code IN ('outputs.ops.view', 'outputs.ops.retry', 'outputs.ops.revoke')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
