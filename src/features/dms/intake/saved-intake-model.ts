import type {SavedIntakeOpen} from '@/lib/dms/saved-intake';
import type {PreparationCandidates} from '@/lib/dms/preparation/candidates';
import type {IntakeAiResultRow,IntakeSessionData} from '@/server/actions/dms/ai-intake';
import type {ReviewFormValues} from './dms-ai-intake-review-form';
/** Presentation adapter only: never creates an upload session. */
export function savedIntakeModel(opened:SavedIntakeOpen,fileId:number,jobId:number,candidate:PreparationCandidates|null,definitions=opened.review.source.fields){
 const source=opened.review.source,file=source.files.find(f=>f.id===fileId);
 if(!file)throw Error('Current stored original unavailable');
 const values:ReviewFormValues=structuredClone(opened.values),proposed=(key:string)=>candidate?.values.find(v=>v.key===key)?.proposed;
 if(candidate){
  values.title=proposed('title')??values.title;values.description=proposed('description')??values.description;
  values.issueDate=proposed('issue_date')??values.issueDate;values.expiryDate=proposed('expiry_date')??values.expiryDate;
  if(candidate.proposedType?.canApply){
   if(values.documentTypeId!==candidate.proposedType.documentTypeId)values.metadataValues={};
   values.documentTypeId=candidate.proposedType.documentTypeId;values.categoryId=candidate.proposedType.categoryId;
  }
  for(const entry of candidate.values){if(!entry.key.startsWith('metadata:'))continue;const id=Number(entry.key.slice(9)),def=definitions.find(f=>f.id===id);if(def)values.metadataValues[id]={fieldType:def.type,rawValue:entry.proposed};}
  values.tagIds=[...new Set([...(values.tagIds??[]),...candidate.tagIds])];
 }
 const fields:Record<string,unknown>={},confidence:Record<string,unknown>={};
 for(const entry of candidate?.values??[]){const def=definitions.find(f=>`metadata:${f.id}`===entry.key);if(!def)continue;fields[def.code]=entry.proposed;confidence[def.code]={label:'Manual Review',score:entry.confidence,source_snippet:entry.evidence[0]?.snippet??null};}
 const ai:IntakeAiResultRow|null=candidate?{id:jobId,upload_session_id:null,document_id:source.documentId,job_id:jobId,ai_status:'pending_review',suggested_document_type_id:values.documentTypeId,
  classification_confidence:'Manual Review',classification_score:null,classification_reason:candidate.warnings.join(' '),extracted_fields_json:fields,field_confidence_json:confidence,suggested_links_json:[],
  issue_date_suggestion:proposed('issue_date')??null,expiry_date_suggestion:proposed('expiry_date')??null,suggested_title:proposed('title')??null,suggested_description:proposed('description')??null,
  review_action:null,raw_response_json:{preparation:{summary:candidate.summary,tagNames:source.existingTags.filter(t=>candidate.tagIds.includes(t.id)).map(t=>t.name),split:candidate.readiness.split},warnings:candidate.warnings},created_at:'',
  suggested_type:{type_code:candidate.proposedType?.typeCode??source.typeCode??'',name_en:candidate.proposedType?.typeName??source.typeName??''}}:null;
 const session:IntakeSessionData={id:file.id,session_code:source.documentNo,status:'uploaded',intake_status:candidate?'awaiting_review':'processing',review_status:'pending',original_filename:file.name,mime_type:file.mime,file_size_bytes:file.size,
  temp_storage_path:null,is_duplicate:false,duplicate_document_id:null,ai_result_id:null,document_id:source.documentId,owning_company_id:values.owningCompanyId,owning_branch_id:values.owningBranchId,
  reviewed_by:null,discarded_at:null,discard_reason:null,uploaded_at:'',ai_result:ai};
 return {values,ai,session};
}
