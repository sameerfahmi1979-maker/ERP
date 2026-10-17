import 'server-only';
import {getAuthContext,hasGlobalPermission} from '@/lib/rbac/check';
import {createClient} from '@/lib/supabase/server';

/** Business authority/existence precondition, not a cache or lookup adapter.
 * Business rows always use the caller's RLS client; no privileged fallback.
 */
export async function authorizePartyChildRead(partyId:number,bankDetails=false) {
  const ctx=await getAuthContext();
  const permitted=bankDetails
    ? hasGlobalPermission(ctx,'master_data.parties.view_bank_details') || hasGlobalPermission(ctx,'master_data.parties.manage_bank_details')
    : hasGlobalPermission(ctx,'master_data.parties.view');
  if(!permitted)return {success:false as const,kind:'forbidden' as const,error:'You do not have permission to view these party records.'};
  if(!Number.isSafeInteger(partyId)||partyId<1)return {success:false as const,kind:'not_found' as const,error:'Party not found.'};
  const client=await createClient();
  const {data,error}=await client.from('parties').select('id').eq('id',partyId).maybeSingle();
  if(error)return {success:false as const,kind:'failed' as const,error:'Party records could not be loaded. Try again.'};
  if(!data)return {success:false as const,kind:'not_found' as const,error:'Party not found.'};
  return {success:true as const,client};
}
