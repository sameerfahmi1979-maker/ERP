import "server-only";
import {z} from "zod";
import {getAuthContext,hasPermission,type AuthContext} from "@/lib/rbac/check";
import {createClient} from "@/lib/supabase/server";
import {collectCompletePages} from "@/lib/reads/complete-pages";
import {countMissingRequiredDocuments} from "@/lib/ai/common/compliance-checker/rule-engine";
import type {LinkedDocumentForCompliance,RequiredDocumentRuleForCompliance} from "@/lib/ai/common/compliance-checker/types";
import {entityDocumentsCriteriaSchema,entityDocumentsResponseSchema,entityDocumentRowSchema,entityDocumentOptionSchema,entityDocumentSummarySchema,
  type EntityDocumentsCriteria,type EntityDocumentsResponse,type DmsEntityDocumentRow,type AvailableDmsDocumentOption,type DmsEntityDocumentComplianceSummary} from "@/lib/reads/dms-entity-documents-schema";
const id=z.number().int().positive().refine(Number.isSafeInteger),text=z.string().nullable();
const linkSchema=z.object({id,document_id:id,is_primary:z.boolean(),link_role:text,linked_at:z.string()}).strip();
const documentSchema=z.object({id,document_no:z.string(),title:z.string(),status:z.string(),deleted_at:text,legacy_document_code:text,description:text,confidentiality_level:z.string(),issue_date:text,expiry_date:text,migrated_from_table:text,
  document_type_id:id.nullable(),document_type:z.object({type_code:text,name_en:text}).strip().nullable(),ai_risk_level:text,ai_risk_score:z.number().finite().nullable(),completeness_score:z.number().finite().nullable(),created_at:z.string(),updated_at:z.string(),
}).strip();
type Document=z.infer<typeof documentSchema>;
type Native={data:unknown;count:number|null;error:unknown};
interface Query extends PromiseLike<Native>{eq(k:string,v:unknown):Query;neq(k:string,v:unknown):Query;is(k:string,v:null):Query;in(k:string,v:number[]):Query;not(k:string,op:string,v:unknown):Query;or(v:string):Query;order(k:string,opts?:{ascending:boolean}):Query;range(a:number,b:number):Query;}
// The finite ceiling is an execution limit, not a business result or a silent
// provider cap. Count drift, short pages and over-budget unions return no rows.
export const ENTITY_DOCUMENTS_MAX_ROWS=5000;
export const ENTITY_DOCUMENTS_TIMEOUT_MS=15000;
const MAX_REQUESTS=250,BATCH=200;
class TooLarge extends Error{}
class ParentUnavailable extends Error{}
const DOC_FIELDS="id,document_no,title,status,deleted_at,legacy_document_code,description,confidentiality_level,issue_date,expiry_date,migrated_from_table,document_type_id,document_type:dms_document_types(type_code,name_en),ai_risk_level,ai_risk_score,completeness_score,created_at,updated_at";
const batches=(ids:number[])=>Array.from({length:Math.ceil(ids.length/BATCH)},(_,i)=>ids.slice(i*BATCH,(i+1)*BATCH));
const pattern=(s:string)=>`"%${s.replace(/\\/g,"\\\\").replace(/"/g,'\\"')}%"`;
export const ENTITY_DOCUMENT_PARENTS:Readonly<Record<string,{table:string;soft:boolean}>>={company:{table:"owner_companies",soft:false},branch:{table:"branches",soft:false},site:{table:"work_sites",soft:true},party:{table:"parties",soft:false},employee:{table:"employees",soft:true},employee_dependent:{table:"employee_dependents",soft:true}};
type Collection={kind:"list";rows:DmsEntityDocumentRow[]}|{kind:"attach";rows:AvailableDmsDocumentOption[]}|{kind:"summary";summary:DmsEntityDocumentComplianceSummary};

async function execute(input:unknown,context:AuthContext|undefined,callerSignal:AbortSignal|undefined,legacy:boolean):Promise<{success:boolean;data?:EntityDocumentsResponse;collection?:Collection;error?:string}> {
  const parsed=entityDocumentsCriteriaSchema.safeParse(input);
  if(!parsed.success)return {success:false,error:"Invalid entity document criteria"};
  const p=parsed.data,asOf=new Date().toISOString(),signal=AbortSignal.any([...(callerSignal?[callerSignal]:[]),AbortSignal.timeout(ENTITY_DOCUMENTS_TIMEOUT_MS)]);
  try {
    signal.throwIfAborted();const ctx=context??await getAuthContext();signal.throwIfAborted();
    if(!(hasPermission(ctx,"dms.documents.view")||hasPermission(ctx,"dms.admin")))return {success:false,error:"Permission denied"};
    const db=await createClient();let requests=0;
    const attempt=()=>{signal.throwIfAborted();if(++requests>MAX_REQUESTS)throw new TooLarge();};
    const select=(table:string,fields:string,head=false):Query=>{attempt();return db.from(table).select(fields,{count:"exact",head}).abortSignal(signal) as unknown as Query;};
    const scalar=async(name:string,args?:Record<string,unknown>)=>{attempt();const r=await db.rpc(name,args).abortSignal(signal);signal.throwIfAborted();if(r.error||typeof r.data!=="boolean")throw Error("Capability unavailable");return r.data;};
    const complete=async<S extends z.ZodType>(query:()=>Query,schema:S)=>collectCompletePages(async(a,b)=>{
      const r=await query().range(a,b);signal.throwIfAborted();if(r.error)throw Error("Source unavailable");if(r.count!==null&&r.count>ENTITY_DOCUMENTS_MAX_ROWS)throw new TooLarge();
      return {...r,data:z.array(schema).parse(r.data)};
    },{identity:r=>(r as {id:number}).id,maxRows:ENTITY_DOCUMENTS_MAX_ROWS,signal});
    // Only current, reviewed parent contracts. Future registry entries are not
    // guessed into tables; absence/invisibility remains non-enumerating.
    const parent=ENTITY_DOCUMENT_PARENTS[p.entityType];if(!parent)throw new ParentUnavailable();
    const point=async(table:string,entityId:number,soft:boolean)=>{
      const rows=await complete(()=>{const q=select(table,"id").eq("id",entityId);if(soft)q.is("deleted_at",null);return q.order("id",{ascending:true});},z.object({id}).strip());
      if(rows.length!==1||rows[0].id!==entityId)throw new ParentUnavailable();return rows[0];
    };
    if(p.entityType==="employee_dependent"){
      const dependents=await complete(()=>select(parent.table,"id,employee_id").eq("id",p.entityId).is("deleted_at",null).order("id",{ascending:true}),z.object({id,employee_id:id}).strip());
      if(dependents.length!==1||dependents[0].id!==p.entityId)throw new ParentUnavailable();
      await point("employees",dependents[0].employee_id,true);
    }else await point(parent.table,p.entityId,parent.soft);
    const output=(value:unknown)=>{signal.throwIfAborted();return {success:true,data:entityDocumentsResponseSchema.parse(value)};};
    const links=await complete(()=>select("dms_document_links","id,document_id,is_primary,link_role,linked_at").eq("entity_type",p.entityType).eq("entity_id",p.entityId).is("deleted_at",null).order("linked_at",{ascending:false}).order("id",{ascending:false}),linkSchema);
    const linkedIds=[...new Set(links.map(r=>r.document_id))];
    const readDocs=async(ids:number[])=>{const docs:Document[]=[];for(const batch of batches(ids)){const rows=await complete(()=>select("dms_documents",DOC_FIELDS).in("id",batch).order("id",{ascending:true}),documentSchema);if(rows.some(r=>!batch.includes(r.id)))throw Error("Document mismatch");docs.push(...rows);}return docs;};
    const enrich=async(docs:Document[]):Promise<AvailableDmsDocumentOption[]>=>{
      const caps=new Map<number,{preview:boolean;extraction:boolean}>();
      // A small concurrency bound; every RPC participates in the same finite
      // request/deadline budget. Flat permissions are never row grants.
      for(let at=0;at<docs.length;at+=6)await Promise.all(docs.slice(at,at+6).map(async d=>{
        const preview=await scalar("f03_has_document_permission",{document_id:d.id,permission_code:"dms.documents.preview"});
        const extraction=preview&&await scalar("f03_has_document_permission",{document_id:d.id,permission_code:"dms.documents.review_ai"});caps.set(d.id,{preview,extraction});
      }));
      const extractionRows: {id:number;document_id:number;full_name_en:string|null;full_name:string|null;holder_name:string|null;person_name:string|null}[]=[];
      const ocr=new Set<number>();
      for(const batch of batches(docs.filter(d=>caps.get(d.id)?.extraction).map(d=>d.id))){
        const rows=await complete(()=>select("dms_ai_extraction_results","id,document_id,full_name_en:extracted_fields_json->>full_name_en,full_name:extracted_fields_json->>full_name,holder_name:extracted_fields_json->>holder_name,person_name:extracted_fields_json->>person_name").in("document_id",batch).neq("ai_status","superseded").order("created_at",{ascending:false}).order("id",{ascending:false}),z.object({id,document_id:id,full_name_en:text,full_name:text,holder_name:text,person_name:text}).strip());
        if(rows.some(r=>!batch.includes(r.document_id)))throw Error("Extraction mismatch");extractionRows.push(...rows);
      }
      for(const batch of batches(docs.filter(d=>caps.get(d.id)?.preview).map(d=>d.id))){
        const rows=await complete(()=>select("dms_document_files","id,document_id").in("document_id",batch).not("ocr_text","is",null).is("deleted_at",null).order("id",{ascending:true}),z.object({id,document_id:id}).strip());
        for(const r of rows){if(!batch.includes(r.document_id))throw Error("File mismatch");ocr.add(r.document_id);}
      }
      return docs.map(d=>{const c=caps.get(d.id)!,ef=extractionRows.find(r=>r.document_id===d.id);return entityDocumentOptionSchema.parse({id:d.id,document_no:d.document_no,title:d.title,document_type_name:d.document_type?.name_en??null,document_type_code:d.document_type?.type_code??null,status:d.status,issue_date:d.issue_date,expiry_date:d.expiry_date,
        has_extraction:c.extraction?!!ef:null,has_ocr:c.preview?ocr.has(d.id):null,extracted_person_name:ef?(ef.full_name_en??ef.full_name??ef.holder_name??ef.person_name):null});});
    };
    if(p.operation==="attach"||p.operation==="selected"){
      let docs:Document[];
      if(p.operation==="selected"){
        docs=await readDocs(p.documentIds);
        if(docs.length!==p.documentIds.length||docs.some(d=>d.deleted_at!==null||d.status==="deleted"||linkedIds.includes(d.id)))return output({criteria:p,asOf,availability:"unavailable"});
      }else{
        docs=await complete(()=>{const q=select("dms_documents",DOC_FIELDS).is("deleted_at",null).neq("status","deleted");if(p.search)q.or(`document_no.ilike.${pattern(p.search)},title.ilike.${pattern(p.search)}`);return q.order("created_at",{ascending:false}).order("id",{ascending:false});},documentSchema);
        docs=docs.filter(d=>!linkedIds.includes(d.id));
      }
      const totalCount=docs.length,window=p.operation==="selected"||legacy?docs:docs.slice(p.offset,p.offset+p.limit),rows=await enrich(window);
      if(legacy&&p.operation==="attach")return {success:true,collection:{kind:"attach",rows}};
      return output(p.operation==="selected"?{criteria:p,asOf,availability:"available",rows}:{criteria:p,asOf,availability:"available",totalCount,rows});
    }
    const docs=await readDocs(linkedIds),byId=new Map(docs.map(d=>[d.id,d]));
    if(p.operation==="summary"){
      // Preserve the original summary's link cardinality and status treatment
      // for visible documents; unlike the list, archived/deleted statuses were
      // not filtered here. An invisible document is never counted as visible.
      const visible=links.flatMap(l=>{const d=byId.get(l.document_id);return d?[d]:[];});
      const global=await scalar("current_user_is_global_admin");let missingRequiredDocuments:number|null=null;
      if(global){
        if(docs.length!==linkedIds.length)throw Error("Complete compliance coverage unavailable");
        const rules=await complete(()=>select("dms_required_document_rules","id,rule_code,rule_name,entity_type,document_type_id,is_required").eq("entity_type",p.entityType).eq("is_active",true).is("deleted_at",null).order("id",{ascending:true}),z.object({id,rule_code:z.string(),rule_name:z.string(),entity_type:z.string(),document_type_id:id.nullable(),is_required:z.boolean()}).strip());
        const ruleModels:RequiredDocumentRuleForCompliance[]=rules.map(r=>({id:r.id,ruleCode:r.rule_code,ruleName:r.rule_name,entityType:r.entity_type,documentTypeId:r.document_type_id,typeCode:null,isRequired:r.is_required,requiresExpiryDate:false,requiresIssueDate:false,blocksActivation:false,reminderDaysBeforeExpiry:null}));
        const linkedModels:LinkedDocumentForCompliance[]=visible.map(d=>({id:d.id,documentNo:d.document_no,title:d.title,documentTypeId:d.document_type_id,typeCode:d.document_type?.type_code??null,issueDate:d.issue_date,expiryDate:d.expiry_date,aiRiskLevel:d.ai_risk_level,completenessScore:d.completeness_score,ocrTextAvailable:false,aiSummaryStatus:null,summaryEmbeddingStatus:null,confidentialityLevel:d.confidentiality_level,status:d.status}));
        missingRequiredDocuments=countMissingRequiredDocuments({entityType:p.entityType,rules:ruleModels,linkedDocuments:linkedModels});
      }
      let openComplianceFindings:number|null=null;
      // The retained findings RLS uses GLOBAL current_user_has_permission,
      // not the flattened client capability list. Reuse those exact predicates
      // so a company-only assignment is restricted, never a fabricated zero.
      const canFindings=global||await scalar("current_user_has_permission",{permission_code:"ai.compliance.view"})||await scalar("current_user_has_permission",{permission_code:"ai.common.admin"})||await scalar("current_user_has_role",{role_code:"system_admin"});
      if(canFindings){
        const r=await select("erp_ai_compliance_findings","id",true).eq("entity_type",p.entityType).eq("entity_id",p.entityId).eq("status","open").is("deleted_at",null);
        signal.throwIfAborted();if(r.error||r.count===null||!Number.isSafeInteger(r.count)||r.count<0)throw Error("Findings unavailable");openComplianceFindings=r.count;
      }
      const now=new Date(asOf),soon=new Date(now);soon.setDate(soon.getDate()+30);
      const summary:DmsEntityDocumentComplianceSummary={totalDocuments:visible.length,expiredDocuments:0,expiringSoonDocuments:0,missingRequiredDocuments,openComplianceFindings,highRiskDocuments:0,criticalRiskDocuments:0,latestExpiryDate:null,scope:"visible_documents"};
      for(const d of visible){if(d.expiry_date){const expiry=new Date(d.expiry_date);if(expiry<now)summary.expiredDocuments++;else if(expiry<=soon)summary.expiringSoonDocuments++;if(!summary.latestExpiryDate||d.expiry_date>summary.latestExpiryDate)summary.latestExpiryDate=d.expiry_date;}
        if(d.ai_risk_level==="critical")summary.criticalRiskDocuments++;else if(d.ai_risk_level==="high")summary.highRiskDocuments++;}
      const checked=entityDocumentSummarySchema.parse(summary);if(legacy)return {success:true,collection:{kind:"summary",summary:checked}};
      return output({criteria:p,asOf,availability:"available",summary:checked});
    }
    const visible=links.filter(l=>{const d=byId.get(l.document_id);return d&&d.deleted_at===null&&d.status!=="deleted";}),totalCount=visible.length;
    const window=legacy?visible:visible.slice(p.offset,p.offset+p.limit),counts=new Map<number,number>();
    for(const batch of batches([...new Set(window.map(l=>l.document_id))])){
      const files=await complete(()=>select("dms_document_files","id,document_id").in("document_id",batch).is("deleted_at",null).order("id",{ascending:true}),z.object({id,document_id:id}).strip());
      for(const f of files){if(!batch.includes(f.document_id))throw Error("File mismatch");counts.set(f.document_id,(counts.get(f.document_id)??0)+1);}
    }
    const rows=window.map(l=>{const d=byId.get(l.document_id)!,n=counts.get(d.id)??0;return entityDocumentRowSchema.parse({link_id:l.id,link_is_primary:l.is_primary,link_role:l.link_role,linked_at:l.linked_at,document_id:d.id,document_no:d.document_no,legacy_document_code:d.legacy_document_code,title:d.title,description:d.description,status:d.status,confidentiality_level:d.confidentiality_level,issue_date:d.issue_date,expiry_date:d.expiry_date,migrated_from_table:d.migrated_from_table,document_type_name:d.document_type?.name_en??null,document_type_code:d.document_type?.type_code??null,has_files:n>0,files_count:n,ai_summary:null,ai_risk_level:d.ai_risk_level,ai_risk_score:d.ai_risk_score,completeness_score:d.completeness_score,created_at:d.created_at,updated_at:d.updated_at});});
    if(legacy)return {success:true,collection:{kind:"list",rows}};
    return output({criteria:p,asOf,availability:"available",totalCount,rows});
  }catch(error){
    if(!signal.aborted&&(error instanceof TooLarge||error instanceof ParentUnavailable))return {success:true,data:entityDocumentsResponseSchema.parse({criteria:p,asOf,availability:error instanceof TooLarge?"too_large":"unavailable"})};
    return {success:false,error:"Entity documents could not be completely loaded. Please retry."};
  }
}
export async function readDmsEntityDocuments(input:unknown,context?:AuthContext,signal?:AbortSignal):Promise<{success:boolean;data?:EntityDocumentsResponse;error?:string}>{return execute(input,context,signal,false);}
/** Compatibility for legacy callers: still complete-or-error and protected,
 * never a successful capped list. The adopted screen uses only paged DTOs. */
export async function readLegacyEntityDocuments(input:EntityDocumentsCriteria):Promise<{success:boolean;collection?:Collection;error?:string}>{
  const r=await execute(input,undefined,undefined,true);return r.collection?{success:true,collection:r.collection}:{success:false,error:r.error??"Entity documents are unavailable or exceed the safe read budget. Please use the paged Documents tab."};
}
