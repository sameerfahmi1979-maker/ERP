#!/usr/bin/env python3
"""
ERP BASE 002F.3E.2 SQL Migration Regenerator

This script regenerates the SQL migration file with correct schema for:
1. global_lookup_values: Use category_id (FK via CTE) and value_label_en/ar
2. role_permissions: Use role_id and permission_id (FKs via subqueries)
"""

import re
from pathlib import Path

# Paths
sql_file = Path(r'c:\dev\agt-erp\supabase\migrations\20260607150000_erp_base_002f3e2_people_contacts_crm_database_lookups_seeds.sql')

# Read original SQL
with open(sql_file, 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')

print(f"Original file: {len(lines)} lines")

# Extract lookup INSERT blocks
lookup_pattern = r"-- {2,}.*?\n-- ([A-Z_]+) \((\d+) values\).*?\n-- {2,}.*?\nINSERT INTO global_lookup_values \((.*?)\n\) VALUES\n(.*?)\n\nON CONFLICT \((.*?)\) \nDO UPDATE SET \n(.*?);"

matches = list(re.finditer(lookup_pattern, content, re.DOTALL))
print(f"Found {len(matches)} lookup INSERT blocks")

if matches:
    for i, match in enumerate(matches[:3]):  # Show first 3
        cat_code = match.group(1)
        count = match.group(2)
        columns = match.group(3)
        values_section = match.group(4)
        conflict_cols = match.group(5)
        
        print(f"\nBlock {i+1}: {cat_code} ({count} values)")
        print(f"  Columns: {columns[:100]}...")
        print(f"  Values (first 200 chars): {values_section[:200]}...")
        print(f"  Conflict: {conflict_cols}")
