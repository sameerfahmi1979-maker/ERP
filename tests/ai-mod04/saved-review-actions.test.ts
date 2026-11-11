import {beforeEach,expect,it,vi} from 'vitest';
const {rpc,from,eq,is,maybeSingle,select}=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),eq:vi.fn(),is:vi.fn(),maybeSingle:vi.fn(),select:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc,from})}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:vi.fn(),hasPermission:vi.fn()}));
vi.mock('@/server/dms-file-pipeline-access',()=>({requireDmsFilePipelineAccess:vi.fn()}));
import {openDocumentPreparationReview,saveDocumentPreparationDraft} from '@/server/actions/dms/document-preparation';
beforeEach(()=>{vi.clearAllMocks();from.mockReturnValue({select});select.mockReturnValue({eq});eq.mockReturnValue({is});is.mockReturnValue({maybeSingle});maybeSingle.mockResolvedValue({data:null});});
it('does not call the database for an invalid document',async()=>{expect((await openDocumentPreparationReview(-1)).success).toBe(false);expect(rpc).not.toHaveBeenCalled();});
it('returns a safe specific reference without exposing database error details',async()=>{
 rpc.mockResolvedValue({error:{code:'42703',message:'private database field and document contents'}});
 const result=await openDocumentPreparationReview(59);expect(result.error).toContain('review-42703');expect(JSON.stringify(result)).not.toContain('private database');expect(rpc).toHaveBeenCalledWith('dms_saved_document_review',{p_action:'open',p_data:{documentId:59}});
});
it('holds malformed source results without starting a replacement operation',async()=>{rpc.mockResolvedValue({data:{source:{documentId:59}}});expect((await openDocumentPreparationReview(59)).error).toContain('review-format');expect(rpc).toHaveBeenCalledTimes(1);});
it('explains archived rejected records without changing roles or starting AI',async()=>{
 rpc.mockResolvedValue({error:{code:'42501'}});maybeSingle.mockResolvedValue({data:{is_archived:true,status:'rejected'}});
 const result=await openDocumentPreparationReview(59);expect(result.error).toContain('review-archived');expect(result.error).toContain('Restore it through Archive');expect(result.error).not.toContain('Manager');
 expect(from).toHaveBeenCalledWith('dms_documents');expect(select).toHaveBeenCalledWith('is_archived,status');expect(eq).toHaveBeenCalledWith('id',59);expect(is).toHaveBeenCalledWith('deleted_at',null);expect(rpc).toHaveBeenCalledTimes(1);
});
it('recognizes archive status and replaced records',async()=>{
 rpc.mockResolvedValue({error:{code:'42501'}});maybeSingle.mockResolvedValueOnce({data:{is_archived:false,status:'archived'}}).mockResolvedValueOnce({data:{is_archived:false,status:'superseded'}});
 expect((await openDocumentPreparationReview(59)).error).toContain('review-archived');expect((await openDocumentPreparationReview(60)).error).toContain('review-replaced');
});
it('does not disclose lifecycle for an inaccessible record or a failed scoped read',async()=>{
 rpc.mockResolvedValue({error:{code:'42501',message:'internal details'}});maybeSingle.mockResolvedValueOnce({data:null}).mockResolvedValueOnce({error:{message:'denied'},data:{is_archived:true,status:'archived'}});
 for(let n=0;n<2;n++){const result=await openDocumentPreparationReview(59);expect(result.error).toContain('review-42501');expect(result.error).not.toContain('review-archived');expect(result.error).not.toContain('internal details');}
});
it('does not mislabel a permitted nonarchived rejected record as archived',async()=>{
 rpc.mockResolvedValue({error:{code:'42501'}});maybeSingle.mockResolvedValue({data:{is_archived:false,status:'rejected'}});
 expect((await openDocumentPreparationReview(59)).error).toContain('review-42501');
});
it('rejects draft approval/status tampering before contacting the database',async()=>{
 expect((await saveDocumentPreparationDraft({documentId:59,jobId:1,requestId:crypto.randomUUID(),snapshot:'a'.repeat(64),expectedRevision:0,values:{selections:[],edits:{},refreshDerived:false,approved:true}})).success).toBe(false);expect(rpc).not.toHaveBeenCalled();
});
it('preserves draft identity and checks the exact saved revision',async()=>{
 const payload={documentId:59,jobId:1,requestId:crypto.randomUUID(),snapshot:'a'.repeat(64),expectedRevision:2,values:{selections:['title'],edits:{title:'Reviewed'},refreshDerived:false}};
 rpc.mockResolvedValue({data:{documentId:59,jobId:1,requestId:payload.requestId,revision:3,saved:true}});expect((await saveDocumentPreparationDraft(payload)).success).toBe(true);
 expect(rpc).toHaveBeenCalledWith('dms_saved_document_review',{p_action:'save_draft',p_data:payload});
});
