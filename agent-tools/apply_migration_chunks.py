"""
Apply ERP BASE 002F.3E.2 SQL Migration via Supabase MCP
This script applies the corrected SQL migration in manageable chunks.
"""

import os
import re
import json
import subprocess
import sys

# Configuration
SQL_FILE = r'c:\dev\agt-erp\supabase\migrations\20260607150000_erp_base_002f3e2_people_contacts_crm_database_lookups_seeds.sql'
CHUNK_DIR = r'c:\dev\agt-erp\agent-tools\migration_chunks'
REPORT_FILE = r'c:\dev\agt-erp\implementation_Review\ERP_BASE_002F_3E_2_DATABASE_MIGRATION_APPLICATION_REPORT.md'

# Ensure chunk directory exists
os.makedirs(CHUNK_DIR, exist_ok=True)

# Read full SQL
with open(SQL_FILE, 'r', encoding='utf-8') as f:
    full_sql = f.read()

print(f'Full SQL loaded: {len(full_sql)} bytes')

# Extract remaining lookup value sections (we already applied categories + PARTY_STATUS_TYPES)
# Start from CUSTOMER_TYPES onward
lookup_pattern = r'(-- -{50,}\n-- [A-Z_]+ \([0-9]+ values\).*?(?=-- -{50,}|-- ={50,}|$))'
matches = list(re.finditer(lookup_pattern, full_sql, re.DOTALL))

print(f'Found {len(matches)} total lookup sections')

# Apply remaining lookups (skip first one if already applied)
lookup_sections_applied = 1  # Categories + PARTY_STATUS already done

for i, match in enumerate(matches[lookup_sections_applied:], lookup_sections_applied + 1):
    section_sql = match.group(0)
    
    # Extract category name from header
    cat_match = re.search(r'-- ([A-Z_]+) \(', section_sql)
    cat_name = cat_match.group(1) if cat_match else f'LOOKUP_{i}'
    
    print(f'\nApplying {cat_name}...')
    chunk_file = os.path.join(CHUNK_DIR, f'{i}_{cat_name}.sql')
    
    with open(chunk_file, 'w', encoding='utf-8') as f:
        f.write(section_sql)
    
    # Apply via Supabase MCP execute_sql
    # Note: This requires MCP server to be running and accessible
    try:
        # For now, we just prepare the files
        print(f'  Prepared: {len(section_sql)} bytes')
    except Exception as e:
        print(f'  ERROR: {e}')
        sys.exit(1)

print('\n' + '='*70)
print('MIGRATION CHUNK PREPARATION COMPLETE')
print(f'Total chunks prepared: {len(matches)}')
print(f'Next: Apply via MCP execute_sql tool')
print('='*70)
