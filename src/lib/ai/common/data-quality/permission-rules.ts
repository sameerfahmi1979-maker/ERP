import type { SupabaseClient } from '@supabase/supabase-js';
import { buildDataQualityFinding } from './finding-builder';

const BATCH_LIMIT = 100;

export async function scanPermissionRules(
  supabase: SupabaseClient
): Promise<ReturnType<typeof buildDataQualityFinding>[]> {
  const findings: ReturnType<typeof buildDataQualityFinding>[] = [];

  // Permissions with no role mapping
  const { data: permissions } = await supabase
    .from('permissions')
    .select('id, permission_code, permission_name')
    .limit(BATCH_LIMIT);

  if (!permissions) return findings;

  const { data: roleMappings } = await supabase
    .from('role_permissions')
    .select('permission_code')
    .limit(500);

  const mappedCodes = new Set((roleMappings ?? []).map((r) => r.permission_code));

  for (const perm of permissions) {
    if (!mappedCodes.has(perm.permission_code)) {
      findings.push(
        buildDataQualityFinding({
          rule_code: 'PERMISSION_ACTIVE_WITH_NO_ROLE_MAPPING',
          entity_type: 'permission',
          entity_id: perm.id,
          source_table: 'permissions',
          source_field: 'permission_code',
          title: 'Permission With No Role Mapping',
          description: `Permission "${perm.permission_code}" has no role assigned and is inaccessible.`,
          evidence: {
            source: 'permissions',
            permission_code: perm.permission_code,
            issue: 'no_role_mapping',
          },
        })
      );
    }
  }

  return findings;
}
