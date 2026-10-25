import {beforeEach,it,expect,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
const m=vi.hoisted(()=>({ctx:{} as AuthContext,admin:vi.fn(),client:vi.fn(),matching:vi.fn(),validation:vi.fn(),read:vi.fn(),write:vi.fn()}));
vi.mock('@/lib/rbac/check',async()=>({...await vi.importActual('@/lib/rbac/scope'),getAuthContext:async()=>m.ctx}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:m.admin}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.client}));
vi.mock('@/lib/dms/entity-matching/entity-matcher',()=>({runDmsEntityMatchingForDocumentSystem:m.matching,runDmsEntityMatchingForIntakeSessionSystem:m.matching}));
vi.mock('@/lib/dms/validation/validation-engine',()=>({runDeterministicValidationForDocument:m.validation,runDeterministicValidationForIntakeSession:m.validation}));
vi.mock('@/lib/logger',()=>({logger:{error:vi.fn(),warn:vi.fn(),info:vi.fn()}}));
vi.mock('@/server/actions/audit',()=>({logAudit:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import{runDmsEntityMatchingForDocument,bulkRunDmsEntityMatching,reviewDmsEntityMatchCandidate}from'@/server/actions/dms/entity-matching';
import{runDmsValidationForDocument,bulkRunDmsValidation,reviewDmsValidationFinding}from'@/server/actions/dms/validation';
import{getDmsAiObservabilityOverview,createAiModelCostRate}from'@/server/actions/dms/ai-observability';
beforeEach(()=>{
 vi.clearAllMocks();const permissions=['dms.entity_matching.run','dms.entity_matching.admin','dms.entity_matching.review','dms.validation.run','dms.validation.admin','dms.validation.review','dms.ai_observability.view','dms.ai_observability.admin'];
 m.ctx={profile:{id:1}as AuthContext['profile'],email:null,isAccountActive:true,accountStatus:'active',roleCodes:['company_admin'],permissionCodes:permissions,globalPermissionCodes:[],roleAssignments:[{roleId:1,roleCode:'company_admin',ownerCompanyId:1,branchId:null,permissionCodes:permissions}]};
 const flag={select:vi.fn(),eq:vi.fn(),single:vi.fn(async()=>({data:{is_enabled:true},error:null}))};flag.select.mockReturnValue(flag);flag.eq.mockReturnValue(flag);m.admin.mockReturnValue({from:()=>flag});
 const chain={select:vi.fn(),eq:vi.fn(),is:vi.fn(),single:m.read,update:m.write};for(const f of[chain.select,chain.eq,chain.is,chain.update])f.mockReturnValue(chain);m.read.mockResolvedValue({data:null,error:{code:'PGRST116'}});m.client.mockResolvedValue({from:()=>chain});
});
it('does not execute privileged cross-company matching using scoped grants',async()=>{
 expect((await runDmsEntityMatchingForDocument(2)).success).toBe(false);
 expect((await bulkRunDmsEntityMatching({documentIds:[2]})).success).toBe(false);expect(m.matching).not.toHaveBeenCalled();
});
it('does not execute privileged cross-company validation using scoped grants',async()=>{
 expect((await runDmsValidationForDocument(2)).success).toBe(false);
 expect((await bulkRunDmsValidation({documentIds:[2]})).success).toBe(false);expect(m.validation).not.toHaveBeenCalled();
});
it('keeps cross-company monitoring and shared provider prices global',async()=>{
 expect((await getDmsAiObservabilityOverview()).success).toBe(false);
 expect((await createAiModelCostRate({} as Parameters<typeof createAiModelCostRate>[0])).success).toBe(false);expect(m.admin).not.toHaveBeenCalled();
});
it.each(['matching','validation'])('keeps %s review under the signed-in client row policies',async kind=>{
 const r=kind==='matching'?await reviewDmsEntityMatchCandidate(2,{decision:'rejected'} as Parameters<typeof reviewDmsEntityMatchCandidate>[1]):await reviewDmsValidationFinding(2,{decision:'dismiss'});
 expect(r.success).toBe(false);expect(m.client).toHaveBeenCalledOnce();expect(m.write).not.toHaveBeenCalled();expect(m.admin).not.toHaveBeenCalled();
});
