#!/usr/bin/env python3
"""
Verify final SQL corrections
"""

from pathlib import Path

sql_file = Path(r'c:\dev\agt-erp\agent-tools\test_final_corrected.sql')
with open(sql_file, 'r', encoding='utf-8') as f:
    content = f.read()

print(f'File size: {len(content)} bytes, {len(content.splitlines())} lines')
print(f'\nCorrected patterns:')
print(f'  CTE blocks (WITH cat AS): {content.count("WITH cat AS (")}')
print(f'  VALUES with subquery: {content.count("VALUES\\n  ((SELECT id FROM cat),")}')
print(f'  value_label_en count: {content.count("value_label_en")}')
print(f'  value_label_ar count: {content.count("value_label_ar")}')
print(f'  category_id in INSERT: {content.count("category_id, value_code")}')
print(f'  role_id FK in role_permissions: {content.count("INSERT INTO role_permissions (role_id, permission_id)")}')
print(f'\nIncorrect patterns (should be 0):')
print(f'  category_code in VALUES: {content.count("(\\'PARTY_STATUS")}')
print(f'  value_name_en: {content.count("value_name_en")}')
print(f'  value_name_ar: {content.count("value_name_ar")}')
print(f'  role_code in role_permissions INSERT: {content.count("INSERT INTO role_permissions (role_code,")}')
print(f'\nTable structures:')
print(f'  CREATE TABLE statements: {content.count("CREATE TABLE IF NOT EXISTS")}')
print(f'  CREATE POLICY statements: {content.count("CREATE POLICY")}')
print(f'  CREATE INDEX statements: {content.count("CREATE INDEX")}')
print(f'  CREATE TRIGGER statements: {content.count("CREATE TRIGGER")}')
