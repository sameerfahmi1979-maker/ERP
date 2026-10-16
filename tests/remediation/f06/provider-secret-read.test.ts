import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {resolveEmailProviderSecret,isVaultRef} from '@/lib/email/vault';
const m=vi.hoisted(()=>({admin:vi.fn(),rpc:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:m.admin}));
beforeEach(()=>{vi.resetAllMocks();m.admin.mockReturnValue({rpc:m.rpc});});
afterEach(()=>vi.unstubAllEnvs());
it.each(['SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL','ERP_EMAIL_PROVIDER_99_SECRET','vault:not-a-uuid'])('refuses unrelated or malformed secret reference %s',async ref=>{
 vi.stubEnv(ref,'synthetic-private-marker');const result=await resolveEmailProviderSecret(ref,41);expect(result.secret).toBeNull();expect(result.error).not.toContain('synthetic-private-marker');expect(m.admin).not.toHaveBeenCalled();
});
it('resolves the approved shared compatibility key and provider-bound key only',async()=>{
 vi.stubEnv('MICROSOFT_GRAPH_CLIENT_SECRET','synthetic-shared');vi.stubEnv('ERP_EMAIL_PROVIDER_41_SECRET','synthetic-bound');
 expect((await resolveEmailProviderSecret('MICROSOFT_GRAPH_CLIENT_SECRET',41)).secret).toBe('synthetic-shared');expect((await resolveEmailProviderSecret('ERP_EMAIL_PROVIDER_41_SECRET',41)).secret).toBe('synthetic-bound');
 expect((await resolveEmailProviderSecret('ERP_EMAIL_PROVIDER_41_SECRET',42)).secret).toBeNull();expect(m.admin).not.toHaveBeenCalled();
});
it('Vault errors and malformed responses remain secret safe',async()=>{
 const ref='vault:11111111-1111-4111-8111-111111111111';expect(isVaultRef(ref)).toBe(true);
 m.rpc.mockResolvedValueOnce({data:null,error:{message:'synthetic-private-marker'}}).mockRejectedValueOnce(new Error('synthetic-private-marker')).mockResolvedValueOnce({data:{private:'synthetic-private-marker'},error:null});
 for(let i=0;i<3;i++){const result=await resolveEmailProviderSecret(ref,41);expect(result.secret).toBeNull();expect(result.error).not.toContain('synthetic-private-marker');}
});
it('returns Vault secret to the internal caller without putting it in error text',async()=>{
 m.rpc.mockResolvedValue({data:'synthetic-vault',error:null});expect(await resolveEmailProviderSecret('vault:11111111-1111-4111-8111-111111111111',41)).toEqual({secret:'synthetic-vault',error:null});
});
