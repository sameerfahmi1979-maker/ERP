#!/usr/bin/env python3
"""
ERP BASE 002F.3E.2 SQL Migration - Complete CTE Conversion

Converts all lookup value INSERTs to use CTE pattern:
- WITH cat AS (SELECT id FROM global_lookup_categories WHERE category_code = 'X')
- INSERT ... SELECT cat.id, ...FROM cat
"""

import re
from pathlib import Path

# Read the partially corrected file
sql_file = Path(r'c:\dev\agt-erp\agent-tools\test_corrected.sql')
with open(sql_file, 'r', encoding='utf-8') as f:
    content = f.read()

print(f"Input: {len(content)} bytes")

# Pattern to match each lookup INSERT block
# Matches: INSERT INTO global_lookup_values (...) VALUES\n('CATEGORY', ...)\n\nON CONFLICT
pattern = r"(-- -{70,}\n-- ([A-Z_]+) \((\d+) values\).*?\n-- -{70,}\n)INSERT INTO global_lookup_values \(\n  category_id,([^\)]+)\n\) VALUES\n(\('[A-Z_]+',[^\n]+\n(?:\('[A-Z_]+',[^\n]+\n)*)\nON CONFLICT \(category_id, value_code\)(.*?);"

def convert_to_cte(match):
    """Convert a single INSERT block to CTE pattern"""
    header = match.group(1)
    category_code = match.group(2)
    value_count = match.group(3)
    remaining_columns = match.group(4)  # value_code, value_label_en, etc.
    values_section = match.group(5)
    on_conflict_section = match.group(6)
    
    # Parse VALUES rows - remove category code from each tuple
    values_lines = [line.strip() for line in values_section.strip().split('\n') if line.strip()]
    converted_values = []
    
    for line in values_lines:
        # Remove leading ('CATEGORY_CODE', and replace with just (
        # e.g., ('PARTY_STATUS_TYPES', 'ACTIVE', ... becomes ('ACTIVE', ...
        if line.startswith("('"):
            # Find the first comma after the category code
            first_comma = line.find("',")
            if first_comma > 0:
                # Take everything after the category code and first comma
                rest = line[first_comma + 3:]  # Skip ', '
                converted_values.append(f"  {rest}")
    
    # Build CTE-based INSERT
    result = f"""{header}WITH cat AS (
  SELECT id FROM global_lookup_categories WHERE category_code = '{category_code}' LIMIT 1
)
INSERT INTO global_lookup_values (
  category_id,{remaining_columns}
)
SELECT
  cat.id,
{chr(10).join(converted_values)}
FROM cat
ON CONFLICT (category_id, value_code){on_conflict_section};"""
    
    return result

# Apply conversion
converted_content = re.sub(pattern, convert_to_cte, content, flags=re.DOTALL | re.MULTILINE)

print(f"Output: {len(converted_content)} bytes")

# Count successful conversions
cte_count = converted_content.count('WITH cat AS (')
print(f"CTE blocks created: {cte_count}")

# Write output
output_file = Path(r'c:\dev\agt-erp\agent-tools\test_with_cte.sql')
with open(output_file, 'w', encoding='utf-8') as f:
    f.write(converted_content)

print(f"Written to: {output_file}")

# Show sample
idx = converted_content.find('-- PARTY_STATUS_TYPES')
if idx > 0:
    sample = converted_content[idx:idx+1200]
    print("\n=== SAMPLE OUTPUT ===")
    print(sample)
