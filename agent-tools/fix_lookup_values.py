import re

# Read the SQL file
with open(r'c:\dev\agt-erp\supabase\migrations\20260607150000_erp_base_002f3e2_people_contacts_crm_database_lookups_seeds.sql', 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to match lookup value rows: ((SELECT id FROM cat), ..., sort_order)
# We need to add is_active=true before sort_order and metadata_json='{}'::jsonb after
# Pattern: ends with a number followed by closing paren and comma or closing paren
pattern = r"(\(\(SELECT id FROM cat\),.*?),\s*(\d+)\)"

def replacement(match):
    # match.group(1) is everything before the sort_order number
    # match.group(2) is the sort_order number
    return f"{match.group(1)}, true, {match.group(2)}, '{{}}'::jsonb)"

# Apply replacement
fixed_content = re.sub(pattern, replacement, content)

# Write back
with open(r'c:\dev\agt-erp\supabase\migrations\20260607150000_erp_base_002f3e2_people_contacts_crm_database_lookups_seeds.sql', 'w', encoding='utf-8') as f:
    f.write(fixed_content)

print("Fixed all lookup value entries")
print("  Added: is_active=true, metadata_json='{}'::jsonb")
