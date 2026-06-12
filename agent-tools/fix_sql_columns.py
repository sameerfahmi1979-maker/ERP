#!/usr/bin/env python3
"""
ERP BASE 002F.3E.2 SQL Migration Fix Script

Performs systematic replacements to fix schema mismatches:
1. Change category_code to category_id with CTE lookups
2. Change value_name_en/ar to value_label_en/ar
3. Fix ON CONFLICT clauses
4. Fix role_permissions INSERTs
"""

import re
from pathlib import Path

# Read file
sql_file = Path(r'c:\dev\agt-erp\supabase\migrations\20260607150000_erp_base_002f3e2_people_contacts_crm_database_lookups_seeds.sql')
with open(sql_file, 'r', encoding='utf-8') as f:
    content = f.read()

print(f"Original: {len(content)} bytes")

# Step 1: Replace column names in INSERT statements
content = content.replace(
    'INSERT INTO global_lookup_values (\n  category_code, value_code, value_name_en, value_name_ar,',
    'INSERT INTO global_lookup_values (\n  category_id, value_code, value_label_en, value_label_ar,'
)

# Step 2: Replace ON CONFLICT clauses
content = content.replace(
    'ON CONFLICT (category_code, value_code)',
    'ON CONFLICT (category_id, value_code)'
)

# Step 3: Replace value_name references in DO UPDATE
content = content.replace(
    '  value_name_en = EXCLUDED.value_name_en,\n  value_name_ar = EXCLUDED.value_name_ar,',
    '  value_label_en = EXCLUDED.value_label_en,\n  value_label_ar = EXCLUDED.value_label_ar,'
)

print(f"After column replacements: {len(content)} bytes")

# Count occurrences
print(f"\nRemaining issues:")
print(f"  category_code in INSERT: {content.count('category_code, value_code')}")
print(f"  value_name_en: {content.count('value_name_en')}")
print(f"  value_name_ar: {content.count('value_name_ar')}")

# Write test output
test_file = Path(r'c:\dev\agt-erp\agent-tools\test_corrected.sql')
with open(test_file, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\nTest output written to: {test_file}")
print("Review first 2000 chars of lookup section:")
# Find and print lookup section start
idx = content.find('-- SECTION 2: LOOKUP VALUES')
if idx > 0:
    print(content[idx:idx+2000])
