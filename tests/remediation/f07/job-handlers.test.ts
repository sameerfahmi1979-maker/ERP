import {beforeEach,describe,it,expect,vi} from 'vitest';
import {runWithJobClaim} from '@/lib/dms/ai-jobs/claim-scope';
const mock=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),provider:vi.fn(),ocr:vi.fn(),index:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:mock.rpc,from:mock.from})}));
vi.mock('@/lib/ai/common/provider-bridge',()=>({callCommonAiStructuredCompletion:mock.provider}));
vi.mock('@/lib/dms/ocr/process-file-ocr',()=>({processDmsFileOcrSystem:mock.ocr}));
vi.mock('@/lib/dms/semantic/semantic-indexer',()=>({indexDmsDocumentSemantically:mock.index}));
vi.mock('@/lib/logger',()=>({logger:{info:vi.fn(),warn:vi.fn(),error:vi.fn()}}));
import {aiReExtractionHandler} from '@/lib/dms/ai-jobs/handlers/ai-re-extraction.handler';
import {ocrBackfillHandler} from '@/lib/dms/ai-jobs/handlers/ocr-backfill.handler';
import {semanticDocumentIndexHandler} from '@/lib/dms/ai-jobs/handlers/semantic-document-index.handler';
const claim={jobId:7,token:'c7000000-0000-4000-8000-000000000001',workerId:'test',attemptNumber:1};
const payload={documentId:7,source:'admin_manual_retry'};
let failedTable:string|undefined;
beforeEach(()=>{
 vi.clearAllMocks();failedTable=undefined;
 mock.rpc.mockImplementation(async(name)=>({error:null,data:name==='f07_ai_worker'?{success:true,resultId:null}:{success:true,resultId:12}}));
 mock.from.mockImplementation((table:string)=>{
   const response={error:table===failedTable?{code:'XX000'}:null,data:table==='dms_documents'?{id:7,document_type_id:8,deleted_at:null}:table==='dms_metadata_definitions'?[{id:9,field_code:'name',field_type:'text',field_label_en:'Name'}]:table==='dms_document_metadata_values'?[]:{content_text:'Synthetic source'}};
   const q:Record<string,unknown>={select:()=>q,eq:()=>q,is:()=>q,maybeSingle:async()=>response,then:(resolve:(v:unknown)=>void)=>Promise.resolve(response).then(resolve)};return q;
 });
 mock.provider.mockResolvedValue({success:true,rawJson:'{"name":"Suggested name","unknown":"ignored"}'});mock.ocr.mockResolvedValue({success:true});mock.index.mockResolvedValue({success:true});
});
describe('T07 suggestion-only real handler',()=>{
 it('publishes selected-source suggestions through a fenced RPC, never metadata writes',async()=>{
  const result=await runWithJobClaim(claim,()=>aiReExtractionHandler.handle(payload,claim));expect(result.success).toBe(true);
  expect(mock.rpc).toHaveBeenCalledWith('f07_ai_metadata_suggestions',{p_job:7,p_token:claim.token,p_fields:{name:'Suggested name'}});
  expect(mock.from.mock.calls.map(c=>c[0])).not.toContain('dms_metadata_definitions_write');
 });
 it('requires a current claim context',async()=>{expect((await aiReExtractionHandler.handle(payload,claim)).success).toBe(false);expect(mock.provider).not.toHaveBeenCalled();});
 it.each(['dms_documents','dms_metadata_definitions','dms_document_metadata_values','dms_document_content'])('does not treat %s read failure as a successful empty result',async(table)=>{
  failedTable=table;expect((await runWithJobClaim(claim,()=>aiReExtractionHandler.handle(payload,claim))).success).toBe(false);expect(mock.provider).not.toHaveBeenCalled();
 });
 it('does not rerun a provider for a durably published suggestion',async()=>{
  mock.rpc.mockResolvedValue({data:{success:true,resultId:12},error:null});expect((await runWithJobClaim(claim,()=>aiReExtractionHandler.handle(payload,claim))).success).toBe(true);expect(mock.provider).not.toHaveBeenCalled();
 });
 it('does not hide provider-not-configured failure',async()=>{
  mock.provider.mockResolvedValue({success:false,isProviderNotConfigured:true});const r=await runWithJobClaim(claim,()=>aiReExtractionHandler.handle(payload,claim));expect(r).toMatchObject({success:false,retryable:false});
 });
 it.each(['[]','null','true','bad json'])('rejects malformed provider output %s',async rawJson=>{
  mock.provider.mockResolvedValue({success:true,rawJson});expect(await runWithJobClaim(claim,()=>aiReExtractionHandler.handle(payload,claim))).toMatchObject({success:false,retryable:false});
 });
 it('does not accept a missing publication receipt',async()=>{
  mock.rpc.mockImplementation(async name=>({data:name==='f07_ai_worker'?{success:true}:null,error:null}));expect((await runWithJobClaim(claim,()=>aiReExtractionHandler.handle(payload,claim))).success).toBe(false);
 });
 it('does not force paid OCR again on an already-attempted operation',async()=>{
  await ocrBackfillHandler.handle({documentId:7,fileId:9,forceRetry:true,source:'admin_backfill'},{...claim,attemptNumber:2});expect(mock.ocr.mock.calls[0][0].forceRetry).toBe(false);
 });
 it('does not force semantic rebuild again on retry',async()=>{
  await semanticDocumentIndexHandler.handle({documentId:7,forceRebuild:true,source:'manual_rebuild'},{...claim,attemptNumber:2});expect(mock.index.mock.calls[0][0].forceRebuild).toBe(false);
 });
});
