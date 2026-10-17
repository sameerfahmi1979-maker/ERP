// Actual resolver, query doubles: explicit read-failure semantics, not database authorization evidence.
import {beforeEach,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
import {resolveOwnerCompanyBindingValues} from '@/lib/report-designer/test-data-resolver';
const from=vi.fn();
const db={from} as unknown as SupabaseClient;
const query=(response:object)=>{const q={select:vi.fn(()=>q),eq:vi.fn(()=>q),is:vi.fn(()=>q),limit:vi.fn(()=>q),maybeSingle:async()=>response,single:async()=>response};return q;};
beforeEach(()=>from.mockReset());
it('uses the governed safe profile projection, not the protected raw table',async()=>{
 from.mockReturnValue(query({data:{legal_name_en:'F06 issuer',phone:'123'},error:null}));
 const r=await resolveOwnerCompanyBindingValues(1,db);expect(r.values['company.legal_name_en']).toBe('F06 issuer');expect(from).toHaveBeenCalledExactlyOnceWith('erp_report_branding_profiles_safe');
});
it('profile read failure is not treated as absent branding or a reason to borrow organization data',async()=>{
 from.mockReturnValueOnce(query({data:null,error:{code:'42501',message:'private diagnostic'}})).mockReturnValueOnce(query({data:{legal_name_en:'Must not fallback'},error:null}));
 await expect(resolveOwnerCompanyBindingValues(1,db)).rejects.toThrow('Company branding could not be loaded');expect(from).toHaveBeenCalledTimes(1);
});
it('falls back only when no governed default exists and the organization row is independently authorized',async()=>{
 from.mockReturnValueOnce(query({data:null,error:null})).mockReturnValueOnce(query({data:{legal_name_en:'F06 company',address_line_1:'Synthetic address',city:'Test city'},error:null}));
 const r=await resolveOwnerCompanyBindingValues(1,db);expect(r.values['company.legal_name_en']).toBe('F06 company');expect(r.values['company.address_block_en']).toBe('Synthetic address, Test city');
});
it.each([{data:null,error:null},{data:null,error:{code:'PGRST116',message:'private diagnostic'}}])('an unavailable organization fallback never returns invented empty data',async response=>{
 from.mockReturnValueOnce(query({data:null,error:null})).mockReturnValueOnce(query(response));await expect(resolveOwnerCompanyBindingValues(1,db)).rejects.toThrow('Company details are unavailable or not authorized');
});
it.each([0,-1,1.5])('invalid company %s is rejected before database access',async id=>{
 await expect(resolveOwnerCompanyBindingValues(id,db)).rejects.toThrow('Invalid company');expect(from).not.toHaveBeenCalled();
});
