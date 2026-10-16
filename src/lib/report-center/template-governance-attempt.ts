import {createWorkspaceSaveAttempt,type WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import {templateGovernanceReceipt,type TemplateGovernanceAction,type TemplateGovernanceReceipt} from './template-governance-receipt';
import {approveTemplate,archiveTemplate,createTemplateDraftVersion,publishTemplate,rejectTemplate,runTemplateSecurityReviewAction,submitTemplateForReview} from '@/server/actions/reports/template-governance';
import {getReportTemplate} from '@/server/actions/reports/templates';
import type {ReportTemplate} from './types';

/** A view-local F04 mutation attempt, not a read/cache framework. Preserve the
 * first revision through uncertain responses and reload only after a receipt. */
export function createTemplateGovernanceAttempt(){
 const attempt=createWorkspaceSaveAttempt();
 let pending:{key:string;id:number;action:TemplateGovernanceAction;note:string|null;contract:WorkspaceSaveContract;hadUnknown:boolean}|undefined;
 let committed:TemplateGovernanceReceipt|undefined;
 const assertCurrent=(current:()=>boolean)=>{if(!current())throw Error('This template view is no longer current.');};
 async function reload(receipt:TemplateGovernanceReceipt,action:TemplateGovernanceAction,current:()=>boolean=()=>true){
  assertCurrent(current);
  let loaded:Awaited<ReturnType<typeof getReportTemplate>>;
  try{loaded=await getReportTemplate(receipt.id);}catch{throw Error('Saved, but the current template could not be loaded. Retry this action to reload it without saving again.');}
  assertCurrent(current);
  if(!loaded.success||!loaded.data||loaded.data.id!==receipt.id)throw Error('Saved, but the current template could not be loaded. Retry this action to reload it without saving again.');
  const related:ReportTemplate[]=[];
  if(action==='publish'&&loaded.data.parent_template_id){
   let parent:Awaited<ReturnType<typeof getReportTemplate>>;
   try{parent=await getReportTemplate(loaded.data.parent_template_id);}catch{throw Error('Published, but the superseded version could not be refreshed. Retry to reload without publishing again.');}
   assertCurrent(current);
   if(!parent.success||!parent.data||parent.data.id!==loaded.data.parent_template_id)throw Error('Published, but the superseded version could not be refreshed. Retry to reload without publishing again.');
   related.push(parent.data);
  }
  return {template:loaded.data,receipt,related};
 }
 return {
  get pending(){return pending;},
  get confirmed(){return committed;},
  reload,
  async run(row:Pick<ReportTemplate,'id'|'workspace_revision'>,action:TemplateGovernanceAction,note:string|null=null,current:()=>boolean=()=>true){
   assertCurrent(current);
   const key=JSON.stringify([row.id,action,note]);
   if(pending&&pending.key!==key)throw Error('A previous change is unconfirmed. Retry that same action or reopen to reconcile it before making a different change.');
   pending??={key,id:row.id,action,note,contract:attempt.begin([row.id,action,note],row.workspace_revision==null?null:String(row.workspace_revision)),hadUnknown:false};
   if(!committed){
    const request=pending,{contract}=request;
    let result:Awaited<ReturnType<typeof approveTemplate>>;
    try{result=await (action==='submit'?submitTemplateForReview(row.id,contract)
     :action==='approve'?approveTemplate({templateId:row.id,notes:note??undefined},contract)
     :action==='reject'?rejectTemplate({templateId:row.id,reason:note??''},contract)
     :action==='publish'?publishTemplate(row.id,contract)
     :action==='archive'?archiveTemplate({templateId:row.id,reason:note??undefined},contract)
     :action==='new_version'?createTemplateDraftVersion(row.id,contract):runTemplateSecurityReviewAction(row.id,contract));}
    catch{request.hadUnknown=true;throw Error('Change unconfirmed. Retry the same action.');}
    assertCurrent(current);
    if(!result||typeof result.success!=='boolean'){request.hadUnknown=true;throw Error('Change response incomplete. Retry the same action to recover its result.');}
    const receipt=templateGovernanceReceipt.safeParse(result.receipt);
    if(result.receipt&&receipt.success&&receipt.data.source_id===row.id&&(action==='new_version'||receipt.data.id===row.id))committed=receipt.data;
    else if(result.success||result.receipt){request.hadUnknown=true;throw Error('Change response incomplete. Retry the same action to recover its result.');}
    else{const earlierUnknown=request.hadUnknown;request.hadUnknown ||= result.uncertain===true;if(!request.hadUnknown){attempt.resolved();pending=undefined;}throw Error(earlierUnknown?'The earlier change is still unconfirmed. Retry the same action.':result.error??'Change unconfirmed. Retry the same action.');}
   }
   return reload(committed,action,current);
  },
  acknowledged(){attempt.resolved();pending=undefined;committed=undefined;},
 };
}
