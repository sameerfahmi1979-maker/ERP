#!/usr/bin/env python3
"""
Fix CTE pattern to use VALUES with scalar subquery
"""

import re
from pathlib import Path

# Read the CTE version
sql_file = Path(r'c:\dev\agt-erp\agent-tools\test_with_cte.sql')
with open(sql_file, 'r', encoding='utf-8') as f:
    content = f.read()

print(f"Input: {len(content)} bytes")

# Pattern: WITH cat AS ... INSERT ... SELECT\n  cat.id,\n  'VALUE', ...\nFROM cat
# Replace with: WITH cat AS ... INSERT ... SELECT cat.id, v.* FROM cat CROSS JOIN (VALUES (...)) AS v(...)

# Simpler approach: Replace "SELECT\n  cat.id," with "VALUES\n  ((SELECT id FROM cat),"
# and "FROM cat\nON CONFLICT" with "ON CONFLICT"

content = re.sub(
    r'SELECT\n  cat\.id,\n',
    'VALUES\n  ((SELECT id FROM cat), ',
    content
)

content = re.sub(
    r'FROM cat\nON CONFLICT',
    'ON CONFLICT',
    content
)

# Fix remaining lines - replace leading spaces with proper VALUES tuple continuation
# Each line after first in VALUES should start with ((SELECT id FROM cat),
content = re.sub(
    r'\n  (\'[A-Z_]+\',)',
    r'\n  ((SELECT id FROM cat), \1',
    content
)

print(f"Output: {len(content)} bytes")

# Write
output_file = Path(r'c:\dev\agt-erp\agent-tools\test_with_values_subquery.sql')
with open(output_file, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Written to: {output_file}")

# Verify
cte_count = content.count('WITH cat AS')
values_count = content.count('VALUES\n  ((SELECT id FROM cat)')
print(f"CTE blocks: {cte_count}")
print(f"VALUES with subquery: {values_count}")
