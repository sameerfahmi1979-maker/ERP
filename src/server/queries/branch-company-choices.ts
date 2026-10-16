import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { branchCompanyChoicesSchema, type BranchCompanyChoice } from '@/lib/administration/branch-company-choices';

const loadError = 'Branch company choices could not be loaded. Try again.';

/**
 * null: active, company-wide branch-creation choices.
 * ID: only the existing branch's owner label within exact read/manage scope.
 * Authorization and ownership resolution happen together in the database.
 */
export async function readBranchCompanyChoices(branchId: number | null = null): Promise<BranchCompanyChoice[]> {
  if (branchId !== null && (!Number.isSafeInteger(branchId) || branchId <= 0)) {
    throw new Error('Choose a valid branch.');
  }
  try {
    const client = await createClient();
    const { data, error } = await client.rpc('get_branch_company_choices', { p_branch_id: branchId });
    const parsed = branchCompanyChoicesSchema.safeParse(data);
    if (error || !parsed.success || (branchId !== null && parsed.data.length > 1)) {
      throw new Error(loadError);
    }
    return parsed.data;
  } catch {
    // Never expose DB diagnostics or misrepresent a failed read as no authority.
    throw new Error(loadError);
  }
}
