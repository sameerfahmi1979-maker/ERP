import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({client:vi.fn(),sessions:{data:[] as unknown[],error:null as unknown},enrich:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.client}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({profile:{id:7},roleCodes:[]}),hasPermission:()=>true}));
vi.mock('@/server/actions/dms/ai-summary',()=>({generateAndSaveDmsAiSummary:m.enrich}));
vi.mock('@/server/actions/dms/ai-intelligence',()=>({evaluateDmsDocumentIntelligence:m.enrich}));
vi.mock('@/server/actions/dms/ai-links',()=>({suggestDmsDocumentLinks:m.enrich}));
vi.mock('@/server/actions/dms/ai-tags',()=>({suggestDmsDocumentTags:m.enrich}));
vi.mock('@/server/actions/dms/document-content',()=>({writeDocumentContentTextSystem:m.enrich}));
vi.mock('@/server/actions/dms/semantic-search',()=>({generateDmsDocumentEmbedding:m.enrich}));
import {runDmsBatchOrchestration} from '@/server/actions/dms/orchestration';
beforeEach(()=>{
 vi.clearAllMocks();m.sessions={data:[],error:null};
 m.client.mockResolvedValue({from:(table:string)=>{const chain={select:()=>chain,eq:()=>chain,is:()=>chain,single:async()=>({data:{id:21,created_by:7},error:null}),not:async()=>m.sessions};expect(['dms_upload_batches','dms_upload_sessions']).toContain(table);return chain;}});
});
it('does not report successful enrichment when there are no created drafts',async()=>{
 expect(await runDmsBatchOrchestration({batchCode:'SYNTHETIC'})).toMatchObject({success:false,error:expect.stringContaining('Recover the original batch uploads')});
 expect(m.enrich).not.toHaveBeenCalled();
});
it('does not hide a failed scoped session read behind zero processed',async()=>{
 m.sessions={data:[],error:{code:'42501',message:'private storage detail'}};
 const result=await runDmsBatchOrchestration({batchCode:'SYNTHETIC'});
 expect(result).toMatchObject({success:false,error:expect.stringContaining('access is unavailable')});
 expect(JSON.stringify(result)).not.toContain('private');expect(m.enrich).not.toHaveBeenCalled();
});
