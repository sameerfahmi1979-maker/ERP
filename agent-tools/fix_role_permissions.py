#!/usr/bin/env python3
"""
Fix role_permissions INSERTs to use role_id and permission_id (FK columns)
"""

import re
from pathlib import Path

# Read file
sql_file = Path(r'c:\dev\agt-erp\agent-tools\test_with_values_subquery.sql')
with open(sql_file, 'r', encoding='utf-8') as f:
    content = f.read()

print(f"Input: {len(content)} bytes")

# Pattern to match role_permissions INSERT blocks
# -- role_name: description\nINSERT INTO role_permissions (role_code, permission_code)\nSELECT 'role_code', permission_code\n...

# Replace each pattern
pattern = r"-- ([a-z_]+): (.+?)\nINSERT INTO role_permissions \(role_code, permission_code\)\nSELECT '([a-z_]+)', permission_code\nFROM permissions\nWHERE permission_code IN \((.*?)\)\nON CONFLICT \(role_code, permission_code\) DO NOTHING;"

def fix_role_permissions(match):
    role_name = match.group(1)
    description = match.group(2)
    role_code = match.group(3)
    permission_list = match.group(4)
    
    return f"""-- {role_name}: {description}
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = '{role_code}'
  AND p.permission_code IN ({permission_list})
ON CONFLICT (role_id, permission_id) DO NOTHING;"""

content = re.sub(pattern, fix_role_permissions, content, flags=re.DOTALL | re.MULTILINE)

print(f"Output: {len(content)} bytes")

# Verify
old_pattern_count = content.count('INSERT INTO role_permissions (role_code,')
new_pattern_count = content.count('INSERT INTO role_permissions (role_id, permission_id)')
print(f"Old pattern remaining: {old_pattern_count}")
print(f"New pattern count: {new_pattern_count}")

# Write
output_file = Path(r'c:\dev\agt-erp\agent-tools\test_final_corrected.sql')
with open(output_file, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Written to: {output_file}")
