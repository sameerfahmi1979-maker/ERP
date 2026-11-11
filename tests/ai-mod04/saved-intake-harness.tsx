import {vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import type {ReviewFormValues} from '@/features/dms/intake/dms-ai-intake-review-form';
import type {SavedIntakePayload} from '@/lib/dms/saved-intake';
import type {ComponentProps} from 'react';
import {DmsDocumentPreparationPanel} from '@/features/dms/documents/sections/dms-document-preparation-panel';
const api=vi.hoisted(()=>({open:vi.fn(),snapshot:vi.fn(),status:vi.fn(),schema:vi.fn(),save:vi.fn(),start:vi.fn(),cancel:vi.fn(),success:vi.fn(),warning:vi.fn(),live:true,actor:'actor',scope:'scope',realDialog:false}));
vi.mock('sonner',()=>({toast:{success:api.success,warning:api.warning}}));
vi.mock('@/components/layout/read-cache-boundary',()=>({useReadCacheOwner:()=>({identity:{authUserId:api.actor,scopeVersion:api.scope},generation:1,isLive:()=>api.live,admits:(i:{authUserId:string;scopeVersion:string})=>api.live&&i.authUserId===api.actor&&i.scopeVersion===api.scope})}));
vi.mock('@/server/actions/dms/document-preparation',()=>({openDocumentPreparationReview:api.snapshot,getDocumentPreparationStatus:api.status,startDocumentPreparation:api.start,cancelDocumentPreparation:api.cancel}));
vi.mock('@/server/actions/dms/saved-intake',()=>({openSavedIntake:api.open,readSavedIntakeSchema:api.schema,saveSavedIntake:api.save}));
vi.mock('@/server/actions/dms/document-links',()=>({getDmsDocumentLinks:async()=>({success:true,data:[]})}));
vi.mock('@/features/dms/orchestration',()=>({DmsOrchestrationProgressCard:()=>{throw Error('Fresh-upload pipeline must not run for saved files');}}));
vi.mock('@/features/dms/intake/dms-intake-discard-confirmation',()=>({DmsIntakeDiscardConfirmation:()=>{throw Error('Saved review cannot discard intake');}}));
vi.mock('@/features/dms/intake/dms-exact-file-review',()=>({DmsExactFileReview:()=>{throw Error('Saved file must not use upload-session verification');}}));
vi.mock('@/features/dms/intake/dms-intake-link-panel',()=>({DmsIntakeLinkPanel:({onChange}:{onChange:(l:unknown[])=>void})=><button onClick={()=>onChange([{entityType:'company',entityId:1,entityName:'Synthetic company'}])}>Add permitted link</button>}));
vi.mock('@/hooks/use-workspace-navigation-lock',()=>({useWorkspaceNavigationLock:()=>{}}));
vi.mock('@/components/erp/erp-child-dialog-form',async(importOriginal)=>{
 const real=await importOriginal<typeof import('@/components/erp/erp-child-dialog-form')>();
 return {ERPChildDialogForm:(props:ComponentProps<typeof real.ERPChildDialogForm>)=>{
  if(api.realDialog)return <real.ERPChildDialogForm {...props}/>;
  const {open,title,size,children,isDirty,onCancel,onOpenChange,closeDisabled}=props;
  return open?<section role="dialog" aria-label={title} data-size={size} data-dirty={isDirty}>{children}<button disabled={closeDisabled} onClick={()=>{onCancel?.();onOpenChange(false);}}>Close intake</button></section>:null;
 }};
});
// Real shared intake view; network-backed field widgets are independent fixtures.
vi.mock('@/features/dms/intake/dms-ai-intake-review-form',()=>({DmsAiIntakeReviewForm:({values,onChange,savedDocument}:{values:ReviewFormValues;onChange:(p:Partial<ReviewFormValues>)=>void;savedDocument?:{documentId:number;jobId:number}})=><section aria-label="Shared full intake fields" data-document={savedDocument?.documentId}><label>Title<input value={values.title} onChange={e=>onChange({title:e.target.value})}/></label><label>Issue Date<input type="date" value={values.issueDate} onChange={e=>onChange({issueDate:e.target.value})}/></label><label>Type<select value={values.documentTypeId} onChange={e=>onChange({documentTypeId:Number(e.target.value),categoryId:2,metadataValues:{}})}><option value={1}>Original type</option><option value={3}>New type</option></select></label><label>Certificate Number<input id="intake-metadata-4" value={values.metadataValues[4]?.rawValue??""} onChange={e=>onChange({metadataValues:{...values.metadataValues,4:{fieldType:"text",rawValue:e.target.value}}})}/></label><button onClick={()=>onChange({metadataValues:{4:{fieldType:'text',rawValue:'Reviewed value'}}})}>Edit metadata</button></section>}));
export const hash='a'.repeat(64),request='00000000-0000-4000-8000-000000000009';
export const candidate={version:1,sourceSnapshot:hash,profileHash:hash,values:[{key:'issue_date',label:'Issue Date',current:'2025-01-01',proposed:'2026-01-01',evidence:[],confidence:1}],summary:'Suggested summary',tagIds:[],linkCandidates:[],warnings:[],bundle:'single',applicability:'document',readiness:{review:'required',links:'verified_context_only',semantic:'pending_accepted_review',reminders:'pending_accepted_expiry',split:'not_requested'}};
export const values={title:'Original',description:'',standardFileName:'Stored original.pdf',documentTypeId:1,categoryId:2,issueDate:'2025-01-01',expiryDate:'',confidentialityLevel:'company',owningCompanyId:1,owningBranchId:null,metadataValues:{},tagIds:[]};
export const opened={review:{source:{documentId:59,documentNo:'SYN-DMS-59',documentTypeId:1,categoryId:2,snapshot:hash,profileHash:hash,profile:null,subject:null,typeName:'Synthetic',typeCode:'SYN',current:{title:'Original',description:null,issue_date:'2025-01-01',expiry_date:null},files:[{id:53,versionId:53,sha256:hash,name:'Stored original.pdf',mime:'application/pdf',size:10,text:null,bucket:null,path:null}],fields:[],existingTags:[]},recovery:{jobId:9,requestId:request,snapshot:hash,mode:'reread_files',fileIds:[53],state:'review_required'},draft:null,documentStatus:'draft',approvalStatus:null},values,links:[],schemaHash:hash,draft:null};
export const payload={documentId:59,fileId:53,jobId:9,requestId:request,snapshot:hash,schemaHash:hash,expectedRevision:0,confirmed:true,values,links:[]};
export function setup(){vi.clearAllMocks();api.realDialog=false;api.live=true;api.actor='actor';api.scope='scope';api.open.mockResolvedValue({success:true,data:structuredClone(opened)});api.snapshot.mockResolvedValue({success:true,data:opened.review});api.schema.mockResolvedValue({success:true,data:{schemaHash:hash,fields:[]}});api.status.mockResolvedValue({success:true,data:{state:'review_required',sourceCurrent:true,candidate,queueStatus:'completed'}});api.start.mockResolvedValue({success:true,data:{jobId:9}});api.cancel.mockResolvedValue({success:true});api.save.mockImplementation(async(p:SavedIntakePayload,draft:boolean)=>({success:true,data:{documentId:p.documentId,jobId:p.jobId,requestId:p.requestId,state:draft?'draft_saved':'applied',revision:draft?1:0,replayed:false}}));}
export const view=(props:Partial<ComponentProps<typeof DmsDocumentPreparationPanel>>={})=><DmsDocumentPreparationPanel documentId={59} selectedFileId={53} canRun initiallyOpen {...props}/>;
export async function ready(){await screen.findByLabelText('Title');await waitFor(()=>{if((screen.getAllByRole('button',{name:'Update & Save'})[0] as HTMLButtonElement).disabled)throw Error('not ready');});}
export async function submit(){await ready();fireEvent.click(screen.getAllByRole('button',{name:'Update & Save'})[0]);}
export {api,render,screen,fireEvent,waitFor};
