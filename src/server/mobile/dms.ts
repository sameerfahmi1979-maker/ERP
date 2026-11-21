import "server-only";
import {z} from "zod";
import {NextRequest} from "next/server";
import {createHash} from "node:crypto";
import {canUseApplication,hasPermission,type AuthContext} from "@/lib/rbac/check";
import {getLinkedEmployeeId} from "@/lib/rbac/employee-access";
import {createClient} from "@/lib/supabase/server";
import {readAllPages} from "@/server/reads/all-pages";
import {readDmsDocumentPage} from "@/server/reads/dms-documents";
import {readDmsEntityDocuments} from "@/server/reads/dms-entity-documents";
import {getDmsDocumentRecordData} from "@/server/actions/dms/documents";
import {readDmsApprovals} from "@/server/reads/dms-approvals";
import {readDmsRenewalPage} from "@/server/reads/dms-renewal-page";
import {readDmsExpiryPage} from "@/server/reads/dms-expiry-page";
import {readDmsNotifications} from "@/server/reads/dms-notifications";
import {approveDocument,rejectDocument} from "@/server/actions/dms/document-approvals";
import {completeDmsRenewalRequest} from "@/server/actions/dms/renewals";
import {literalContains} from "@/lib/reads/search";
import {normalizeIdentity} from "@/lib/ai/search/vocabulary";
import {dmsBusinessDate} from "@/lib/dms/expiry-calendar";
import {mobileAccessToken} from "@/lib/supabase/mobile-request";
import {GET as deliverDocument} from "@/app/api/dms/file/route";
import {mobileDocumentCriteria,offlinePermitCriteria,type MobileDocumentsInput,type MobileTasksInput,type MobileApprovalInput,type OfflinePermitInput} from "./contracts";

export class MobileDmsError extends Error {constructor(message:string,public readonly status=503){super(message);}}
const denied=(message="Permission denied."):never=>{throw new MobileDmsError(message,403);};
const allowed=(ctx:AuthContext,permission:string)=>hasPermission(ctx,permission)||hasPermission(ctx,"dms.admin");
const any=(ctx:AuthContext,permissions:string[])=>permissions.some(p=>allowed(ctx,p));
const admitted=(ctx:AuthContext)=>{if(!canUseApplication(ctx))denied("Your ERP session is unavailable.");};
const staffEmployee=(ctx:AuthContext)=>hasPermission(ctx,"hr.employees.view");
const staffSite=(ctx:AuthContext)=>["common_md.view","common_md.work_sites.view"].some(p=>hasPermission(ctx,p));
export function mobileCapabilities(ctx:AuthContext){
 const view=allowed(ctx,"dms.documents.view"),upload=allowed(ctx,"dms.documents.upload"),preview=allowed(ctx,"dms.documents.preview"),download=allowed(ctx,"dms.documents.download");
 const review=allowed(ctx,"dms.documents.review_ai"),renewals=any(ctx,["dms.renewals.view","dms.renewals.manage"]),approvals=any(ctx,["dms.approvals.view","dms.approvals.act","dms.documents.approve","dms.approvals.admin"]);
 const notifications=any(ctx,["dms.notifications.view","dms.notifications.manage"]);
 const hr=["hr.admin","hr.employees.view","hr.employee_profile.view","hr.employee_profile.view.self","hr.employee_profile.view.team","hr.employees.view.self","hr.employees.view.team","hr.leave.view","hr.leave.view.self","hr.leave.view.team","hr.attendance.view","hr.attendance.view.self","hr.attendance.view.team","hr.medical.view","hr.medical.view.self","hr.medical.view.team","hr.actions.view","hr.actions.view.self","hr.actions.view.team","hr.compliance.view","hr.compliance.view.self","hr.compliance.view.team","hr.assignments.view","hr.requests.submit.self"].some(code=>hasPermission(ctx,code));
 return {apiVersion:2,view,upload,preview,download,review,numbering:hasPermission(ctx,"numbering.rules.generate"),
  personal:false,records:view&&(staffEmployee(ctx)||staffSite(ctx)),tasks:view||upload||review||renewals||approvals||notifications,renewals,renewalsManage:allowed(ctx,"dms.renewals.manage"),approvals,offline:preview&&download,notifications,hr};
}
export async function readMobileProfile(ctx:AuthContext){
 admitted(ctx);const linked=await getLinkedEmployeeId(ctx);let employee:{id:number;label:string;code:string|null}|null=null;
 if(linked!==null){
  const db=await createClient(),r=await db.from("employees").select("id,full_name_en,employee_code").eq("id",linked).is("deleted_at",null).maybeSingle();
  if(r.error)throw new MobileDmsError("Your linked employee profile could not be loaded.");
  if(r.data){const row=z.object({id:z.number(),full_name_en:z.string(),employee_code:z.string().nullable()}).parse(r.data);if(row.id!==linked)throw new MobileDmsError("Employee identity mismatch.");employee={id:linked,label:row.full_name_en,code:row.employee_code};}
 }
 return {apiVersion:2,userId:ctx.profile!.auth_user_id,name:ctx.profile!.full_name,employee,
  latestRelease:{versionName:"5.0.0",versionCode:11},
  capabilities:{...mobileCapabilities(ctx),personal:employee!==null&&allowed(ctx,"dms.documents.view")}};
}

type Db=Awaited<ReturnType<typeof createClient>>;
const rowId=z.number().int().positive().safe();
const linkSchema=z.object({id:rowId,document_id:rowId}).strip();
const documentSchema=z.object({id:rowId,title:z.string(),document_no:z.string(),description:z.string().nullable(),expiry_date:z.string().nullable(),status:z.string(),document_type_id:rowId.nullable(),document_type:z.object({name_en:z.string().nullable()}).nullable()}).strip();
type Document=z.infer<typeof documentSchema>;
const documentFields="id,title,document_no,description,expiry_date,status,document_type_id,document_type:dms_document_types(name_en)";
const normalized=(s:string)=>normalizeIdentity(s);
const terms=(s:string)=>normalized(s).split(" ").filter(Boolean);
export const mobileDocumentRow=(r:{id:number;title:string;document_no:string;expiry_date:string|null;status:string;document_type?:{name_en:string|null}|null})=>({id:r.id,title:r.title,number:r.document_no,expiry:r.expiry_date,type:r.document_type?.name_en??null,status:r.status});

/** Complete reads fail at an explicit execution ceiling; the ceiling is never a total. */
async function linksFor(db:Db,entityType:"employee"|"site",entityId:number){
 const parent=await db.from(entityType==="employee"?"employees":"work_sites").select("id").eq("id",entityId).is("deleted_at",null).maybeSingle();
 if(parent.error)throw new MobileDmsError("The selected record could not be checked.");
 if(!parent.data||parent.data.id!==entityId)throw new MobileDmsError("The selected record is unavailable or outside your access.",404);
 const rows=await readAllPages(async(from,to)=>{const r=await db.rpc("read_dms_entity_document_links",{target_entity_type:entityType,target_entity_id:entityId},{get:true,count:"exact"}).select("id,document_id").is("deleted_at",null).order("id").range(from,to);return {...r,data:z.array(linkSchema).parse(r.data)};},{identity:r=>r.id,maxRows:5000,batchSize:200});
 return [...new Set(rows.map(r=>r.document_id))];
}
async function admitFolder(ctx:AuthContext,entityType:"employee"|"site",entityId:number){
 admitted(ctx);if(!allowed(ctx,"dms.documents.view"))denied();
 if(entityType==="employee"){if(!staffEmployee(ctx)&&await getLinkedEmployeeId(ctx)!==entityId)denied("Staff lookup permission is required for this employee.");}
 else if(!staffSite(ctx))denied("Site lookup permission is required.");
}
type RecordMatch={id:number;label:string;code:string|null;entityType:"employee"|"site";description?:string;alternateLabel?:string};
function editDistance(a:string,b:string){
 let previous=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){const row=[i];for(let j=1;j<=b.length;j++)row[j]=Math.min(row[j-1]+1,previous[j]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));previous=row;}return previous[b.length];
}
/** Suggestions are explicit choices from authorized parent records, never a
 * selected subject or permission grant. Candidate collection is complete. */
export async function suggestMobileRecords(search:string,ctx:AuthContext):Promise<RecordMatch[]>{
 admitted(ctx);const ts=terms(search);if(!allowed(ctx,"dms.documents.view")||(!staffEmployee(ctx)&&!staffSite(ctx))||!ts.length||ts.length>3||ts.some(t=>t.length<3||t.length>40))return [];
 const db=await createClient(),probe=[...new Set(ts.flatMap(t=>[t.slice(0,2),t.slice(-2),t.slice(1,3)]))].join(" ");
 const candidates=(await Promise.all([recordMatches(db,ctx,probe,"employee"),recordMatches(db,ctx,probe,"site")])).flat();
 const scored=candidates.map(r=>{const words=terms(`${r.label} ${r.code??""} ${r.description??""} ${r.alternateLabel??""}`),distances=ts.map(t=>Math.min(...words.map(w=>editDistance(t,w))));return {row:r,score:distances.reduce((a,b)=>a+b,0),eligible:distances.every((d,i)=>d<=(ts[i].length>=6?2:1))};});
 return scored.filter(r=>r.eligible&&r.score>0).sort((a,b)=>a.score-b.score||a.row.label.localeCompare(b.row.label)||a.row.id-b.row.id).slice(0,5).map(({row:r})=>({id:r.id,label:r.label,code:r.code,entityType:r.entityType,...(r.description?{description:r.description}:{})}));
}
async function recordMatches(db:Db,ctx:AuthContext,search:string,entityType:"employee"|"site"):Promise<RecordMatch[]>{
 if(entityType==="employee"?!staffEmployee(ctx):!staffSite(ctx))return [];
 const columns=entityType==="employee"?["full_name_en","employee_code","known_name","full_name_ar"]:["site_name","site_code"];
 const rows=await readAllPages(async(from,to)=>{
  let q=db.from(entityType==="employee"?"employees":"work_sites").select(`id,${columns.join(",")}`,{count:"exact"}).is("deleted_at",null);
  // Candidate matching stays inside the existing parent's RLS. Final search
  // terms are checked together below; a matching name is never a row grant.
  const ts=terms(search);if(ts.length)q=q.or(ts.flatMap(t=>columns.map(c=>`${c}.ilike.${literalContains(t)}`)).join(","));
  const r=await q.order("id").range(from,to);const shape=z.object({id:rowId}).catchall(z.unknown());return {...r,data:z.array(shape).parse(r.data)};
 },{identity:r=>r.id,maxRows:1000,batchSize:100});
 return rows.map(r=>({id:r.id,label:String(r[columns[0]]??r[columns[1]]??`${entityType==="employee"?"Employee":"Site"} #${r.id}`),code:typeof r[columns[1]]==="string"?r[columns[1]] as string:null,entityType,...(entityType==="employee"&&typeof r.known_name==="string"&&r.known_name?{description:r.known_name}:{}),...(entityType==="employee"&&typeof r.full_name_ar==="string"&&r.full_name_ar?{alternateLabel:r.full_name_ar}:{})}));
}
export async function readMobileRecords(entityType:"employee"|"site",search:string,ctx:AuthContext){
 admitted(ctx);if(!allowed(ctx,"dms.documents.view")||(entityType==="employee"?!staffEmployee(ctx):!staffSite(ctx)))denied("Staff record lookup permission required.");
 const db=await createClient(),ts=terms(search),all=(await recordMatches(db,ctx,search,entityType)).filter(r=>ts.every(t=>normalized(`${r.label} ${r.code??""} ${r.description??""} ${r.alternateLabel??""}`).includes(t)));
 all.sort((a,b)=>a.label.localeCompare(b.label)||a.id-b.id);
 return {success:true,data:all.slice(0,30).map(r=>({id:r.id,label:r.code&&entityType==="employee"?`${r.label} (${r.code})`:r.label,code:r.code,description:r.description??null})),total:all.length,more:all.length>30};
}
export async function readMobileFolder(input:{entityType:"employee"|"site";entityId:number;page:number},ctx:AuthContext){
 await admitFolder(ctx,input.entityType,input.entityId);
 const parent={entityType:input.entityType,entityId:input.entityId};
 const [list,summary,checklist]=await Promise.all([readDmsEntityDocuments({...parent,operation:"list",offset:(input.page-1)*25,limit:25},ctx),readDmsEntityDocuments({...parent,operation:"summary"},ctx),readDmsEntityDocuments({...parent,operation:"checklist"},ctx)]);
 if(!list.success||!list.data||list.data.availability!=="available"||!("rows" in list.data)||!("totalCount" in list.data)||list.data.criteria.operation!=="list")throw new MobileDmsError(list.error??"The folder could not be completely loaded.");
 if(!summary.success||!summary.data||summary.data.availability!=="available"||!("summary" in summary.data))throw new MobileDmsError(summary.error??"The folder summary is unavailable.");
 if(!checklist.success||!checklist.data||checklist.data.availability!=="available"||!("missing" in checklist.data))throw new MobileDmsError(checklist.error??"The required-document checklist is unavailable.");
 const missing=checklist.data.missing,missingCount=summary.data.summary.missingRequiredDocuments;
 if((missing===null)!==(missingCount===null)||(missing!==null&&missing.length!==missingCount))throw new MobileDmsError("Required documents changed while loading. Refresh this folder.",409);
 const rows=list.data.rows.map(r=>{if(!("document_id" in r))throw new MobileDmsError("Unexpected folder row.");return mobileDocumentRow({id:r.document_id,title:r.title,document_no:r.document_no,expiry_date:r.expiry_date,status:r.status,document_type:{name_en:r.document_type_name}});});
 return {rows,total:list.data.totalCount,summary:summary.data.summary,missing};
}

export async function readMobileDocuments(raw:MobileDocumentsInput,ctx:AuthContext){
 admitted(ctx);if(!allowed(ctx,"dms.documents.view"))denied();
 const input=mobileDocumentCriteria.parse(raw),today=dmsBusinessDate(Date.now()),soon=dmsBusinessDate(Date.now(),30);
 let entityType=input.entityType,entityId=input.entityId;
 if(input.personal){const linked=await getLinkedEmployeeId(ctx);if(linked===null)throw new MobileDmsError("No verified employee relationship is available.",403);entityType="employee";entityId=linked;}
 if(entityType&&entityId)await admitFolder(ctx,entityType,entityId);
 if(!input.search&&!entityId&&input.validity!=="valid"){
  const r=await readDmsDocumentPage({page:input.page,pageSize:25,filters:{excludeArchived:true,document_type_id:input.typeId,expiryState:input.validity==="expired"?"expired":input.validity==="expiring"?"expiring_soon":undefined}},ctx);
  if(!r.success||!r.data)throw new MobileDmsError(r.error??"Documents unavailable.");
  return {rows:r.data.rows.map(mobileDocumentRow),total:r.data.totalCount,more:input.page*25<r.data.totalCount};
 }
 const db=await createClient(),ts=terms(input.search),parentIds=entityType&&entityId?await linksFor(db,entityType,entityId):null;
 const empty=()=>({rows:[] as ReturnType<typeof mobileDocumentRow>[],total:0,more:false});if(parentIds?.length===0)return empty();
 const matches=input.search&&!entityId?(await Promise.all([recordMatches(db,ctx,input.search,"employee"),recordMatches(db,ctx,input.search,"site")])).flat():[];
 if(matches.length>50)throw new MobileDmsError("Too many matching records. Refine the name or choose an exact folder.",400);
 const labels=new Map<number,string[]>();
 for(const match of matches)for(const id of await linksFor(db,match.entityType,match.id)){const known=labels.get(id)??[];known.push(`${match.label} ${match.code??""} ${match.description??""} ${match.alternateLabel??""}`);labels.set(id,known);}
 const base=()=>{
  let q=db.from("dms_documents").select(documentFields,{count:"exact"}).is("deleted_at",null).eq("is_archived",false).not("status","in","(archived,superseded,deleted)");
  if(input.typeId)q=q.eq("document_type_id",input.typeId);if(parentIds)q=q.in("id",parentIds);
  if(input.validity==="expired")q=q.lt("expiry_date",today);if(input.validity==="expiring")q=q.gte("expiry_date",today).lte("expiry_date",soon);
  if(input.validity==="valid")q=q.or(`expiry_date.is.null,expiry_date.gte.${today}`);
  return q;
 };
 if(!input.search&&!entityId){
  const from=(input.page-1)*25,r=await base().order("created_at",{ascending:false}).order("id",{ascending:true}).range(from,from+24),parsed=z.array(documentSchema).safeParse(r.data);
  if(r.error||r.count===null||!Number.isSafeInteger(r.count)||r.count<0||!parsed.success||parsed.data.length!==Math.min(25,Math.max(0,r.count-from))||new Set(parsed.data.map(d=>d.id)).size!==parsed.data.length)throw new MobileDmsError("Documents or their current count could not be verified.");
  return {rows:parsed.data.map(mobileDocumentRow),total:r.count,more:from+25<r.count};
 }
 const rows=await readAllPages(async(from,to)=>{let q=base();if(ts.length){const ors=ts.flatMap(t=>["title","document_no","description"].map(f=>`${f}.ilike.${literalContains(t)}`));if(labels.size)ors.push(`id.in.(${[...labels.keys()].join(",")})`);q=q.or(ors.join(","));}const r=await q.order("id").range(from,to);return {...r,data:z.array(documentSchema).parse(r.data)};},{identity:r=>r.id,maxRows:5000,batchSize:200});
 const candidates=new Map<number,Document>(rows.filter(r=>ts.every(t=>normalized(`${r.title} ${r.document_no} ${r.description??""} ${r.document_type?.name_en??""} ${(labels.get(r.id)??[]).join(" ")}`).includes(t))).map(r=>[r.id,r]));
 // Supplement metadata/name partial matches with the existing invoker content
 // search. Extracted text is never returned; the RPC retains its native RLS.
 if(input.search){
  const content=await readAllPages(async(from,to)=>{
   let q=db.rpc("ai_mod02_search_documents",{text_query:input.search,include_content:true},{get:true,count:"exact"}).select(documentFields).is("deleted_at",null).eq("is_archived",false).not("status","in","(archived,superseded,deleted)");
   if(input.typeId)q=q.eq("document_type_id",input.typeId);if(parentIds)q=q.in("id",parentIds);
   if(input.validity==="expired")q=q.lt("expiry_date",today);if(input.validity==="expiring")q=q.gte("expiry_date",today).lte("expiry_date",soon);if(input.validity==="valid")q=q.or(`expiry_date.is.null,expiry_date.gte.${today}`);
   const r=await q.order("id").range(from,to);return {...r,data:z.array(documentSchema).parse(r.data)};
  },{identity:r=>r.id,maxRows:5000,batchSize:200});for(const r of content)candidates.set(r.id,r);
 }
 const rank=(r:Document)=>{const q=normalized(input.search),title=normalized(r.title),number=normalized(r.document_no);return number===q?0:title===q?1:title.startsWith(q)?2:3;};
 const sorted=[...candidates.values()].sort((a,b)=>rank(a)-rank(b)||normalized(a.title).localeCompare(normalized(b.title))||a.id-b.id),from=(input.page-1)*25;
 return {rows:sorted.slice(from,from+25).map(mobileDocumentRow),total:sorted.length,more:from+25<sorted.length,
  suggestions:sorted.length===0&&!entityId?await suggestMobileRecords(input.search,ctx):[]};
}

export async function readMobileUploads(beforeId:number|undefined,ctx:AuthContext,page=1){
 admitted(ctx);const caps=mobileCapabilities(ctx);if(!caps.upload&&!caps.review&&!caps.view)denied();
 const db=await createClient();let q=db.from("dms_upload_sessions").select("id,session_code,intake_status,original_filename,document_id,uploaded_at",{count:"exact"})
  .is("deleted_at",null).is("batch_id",null).not("status","in","(cancelled,expired)").order("id",{ascending:false});
 if(!caps.review)q=q.eq("uploaded_by",ctx.profile!.id);if(beforeId)q=q.lt("id",beforeId);
 const offset=(page-1)*30,r=await q.range(offset,offset+29);
 const rows=z.array(z.object({id:rowId,session_code:z.string(),intake_status:z.string(),original_filename:z.string(),document_id:rowId.nullable(),uploaded_at:z.string()})).safeParse(r.data);
 if(r.error||!rows.success||r.count===null||!Number.isSafeInteger(r.count)||r.count<0||rows.data.length!==Math.min(30,Math.max(0,r.count-offset))||new Set(rows.data.map(x=>x.id)).size!==rows.data.length)throw new MobileDmsError("Upload status could not be completely checked.");
 return {rows:rows.data,total:r.count,more:offset+30<r.count};
}
export async function readMobileTasks(input:MobileTasksInput,ctx:AuthContext){
 admitted(ctx);const caps=mobileCapabilities(ctx),page=input.page??1;
 if(input.kind==="uploads"){const r=await readMobileUploads(input.beforeId,ctx,page);return {...r,rows:r.rows.map(x=>({id:x.id,title:x.original_filename,status:x.intake_status,sessionCode:x.session_code,documentId:x.document_id,canAct:false}))};}
 if(input.kind==="approvals"){
  if(!caps.approvals)denied();const r=await readDmsApprovals({mode:"queue",page,pageSize:25},ctx);
  if(!r.success||!("rows" in r.data)||!("totalCount" in r.data))throw new MobileDmsError(!r.success?r.error:"Approval queue unavailable.");
  const rows=r.data.rows.map(x=>{if(!("canAct" in x))throw new MobileDmsError("Unexpected approval row.");return {id:x.documentId,title:x.title,status:x.approvalStatus??"pending_approval",documentId:x.documentId,approvalId:x.currentApprovalId,canAct:x.canAct,description:x.documentNo};});return {rows,total:r.data.totalCount,more:page*25<r.data.totalCount};
 }
 if(input.kind==="renewals"){
  if(!caps.renewals)denied();const r=await readDmsRenewalPage({page,pageSize:25});if(!r.success||!r.data)throw new MobileDmsError(r.error??"Renewals unavailable.");
  return {rows:r.data.rows.map(x=>({id:x.id,title:x.document?.title??"[Restricted Document]",status:x.status,documentId:x.document?.id,description:x.notes,expiry:x.old_expiry_date,replacementDocumentId:x.replacement_document_id,canAct:allowed(ctx,"dms.renewals.manage")})),total:r.data.totalCount,more:page*25<r.data.totalCount};
 }
 if(input.kind==="notifications"){
  if(!caps.notifications)denied();const r=await readDmsNotifications({audience:"my",page,pageSize:25},ctx);if(!r.success)throw new MobileDmsError(r.error);
  return {rows:r.data.rows.map(x=>({id:x.id,title:x.subject,status:x.status,description:x.message,documentId:x.visible_document_id,canAct:false})),total:r.data.totalCount,more:page*25<r.data.totalCount};
 }
 if(!caps.view&&!allowed(ctx,"dms.expiry.view"))denied();const r=await readDmsExpiryPage({view:"expiring",page,pageSize:25});if(!r.success||!r.data)throw new MobileDmsError(r.error??"Expiry information unavailable.");
 return {rows:r.data.rows.map(x=>({id:x.id,title:x.title,status:x.status,documentId:x.id,expiry:x.expiry_date,canAct:allowed(ctx,"dms.renewals.manage")})),total:r.data.totalCount,more:page*25<r.data.totalCount};
}
export async function actOnMobileApproval(input:MobileApprovalInput,ctx:AuthContext){
 admitted(ctx);if(!mobileCapabilities(ctx).approvals)denied();
 const r=await readDmsApprovals({mode:"state",documentId:input.documentId},ctx);
 if(!r.success||!("record" in r.data))throw new MobileDmsError(!r.success?r.error:"Approval unavailable.");
 const state=r.data.record;
 if(state.currentApprovalId!==input.approvalId)throw new MobileDmsError("The selected approval step changed or was resolved. Refresh the task before acting again.",409);
 if(!(input.decision==="approve"?state.canApprove:state.canReject))throw new MobileDmsError("This approval is no longer available to you.",403);
 return input.decision==="approve"?approveDocument(input.documentId,input.approvalId,{comment:input.comment}):rejectDocument(input.documentId,input.approvalId,{reason:input.comment,comment:input.comment});
}
export async function completeMobileRenewal(input:{requestId:number;replacementDocumentId:number;notes:string},ctx:AuthContext){
 admitted(ctx);if(!allowed(ctx,"dms.renewals.manage"))denied();
 const result=await getDmsDocumentRecordData(input.replacementDocumentId);if(!result.success||!result.data)throw new MobileDmsError("The selected replacement is unavailable.",404);
 const doc=result.data;if(doc.id!==input.replacementDocumentId||!doc.current_version_id)throw new MobileDmsError("Choose a replacement with a current version.",400);
 return completeDmsRenewalRequest(input.requestId,{replacement_document_id:doc.id,replacement_version_id:doc.current_version_id,new_expiry_date:doc.expiry_date??undefined,notes:input.notes});
}

/** Legacy originals use the same authorized/audited delivery as the eventual
 * phone download. No service-role file access or network self-call is added. */
async function hashProtectedOriginal(fileId:number,size:number):Promise<string>{
 const token=mobileAccessToken();if(!token)throw new MobileDmsError("Sign in again before saving this original offline.",401);
 if(!Number.isSafeInteger(size)||size<1)throw new MobileDmsError("The original file size could not be verified.",409);
 if(size>52_428_800)throw new MobileDmsError("This original exceeds the 50 MiB offline limit.",413);
 const response=await deliverDocument(new NextRequest(`http://mobile.internal/api/dms/file?fileId=${fileId}&disposition=attachment`,{headers:{Authorization:`Bearer ${token}`}}));
 if(response.status!==200||!response.body){
  try{void response.body?.cancel().catch(()=>undefined);}catch{/* Best-effort cancellation. */}
  const status=[401,403,404,409].includes(response.status)?response.status:503;
  throw new MobileDmsError("The authorized original could not be delivered for offline verification. Refresh this document and try again.",status);
 }
 const reader=response.body.getReader(),hash=createHash("sha256");let count=0,timer:ReturnType<typeof setTimeout>|undefined;
 const expired=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new MobileDmsError("Offline original verification timed out. Try again.",503)),30_000);});
 try{
  for(;;){const item=await Promise.race([reader.read(),expired]);if(item.done)break;
   if(!(item.value instanceof Uint8Array))throw new MobileDmsError("The original byte stream could not be verified.",503);
   count+=item.value.byteLength;if(count>size||count>52_428_800)throw new MobileDmsError("The original byte size changed. Refresh the document before saving offline.",409);
   hash.update(item.value);
  }
  if(count!==size)throw new MobileDmsError("The original transfer was incomplete. Retry saving this document offline.",409);
  return hash.digest("hex");
 }catch(error){if(error instanceof MobileDmsError)throw error;throw new MobileDmsError("The original byte stream could not be verified. Try again.",503);}
 finally{if(timer)clearTimeout(timer);try{void reader.cancel().catch(()=>undefined);}catch{/* Cancellation cannot delay failure. */}try{reader.releaseLock();}catch{/* A failed stream may still own its read. */}}
}

export async function authorizeOfflineDocument(raw:OfflinePermitInput,ctx:AuthContext){
 admitted(ctx);const input=offlinePermitCriteria.parse(raw);if(!mobileCapabilities(ctx).offline)denied("Preview and download permissions are required to save offline.");
 const db=await createClient();
 const verify=async()=>{for(const permission_code of ["dms.documents.preview","dms.documents.download"]){const r=await db.rpc("f03_has_document_permission",{document_id:input.documentId,permission_code});if(r.error)throw new MobileDmsError("Offline permission could not be checked.");if(r.data!==true)denied("Current document permission is required.");}};
 await verify();
 const result=await getDmsDocumentRecordData(input.documentId);if(!result.success||!result.data||result.data.id!==input.documentId)throw new MobileDmsError("Document unavailable.",404);
 const original=await db.from("dms_document_files").select("id,document_id,version_id,file_name,mime_type,file_role,sha256_hash,file_size_bytes").eq("id",input.fileId).eq("document_id",input.documentId).eq("file_role","original").is("deleted_at",null).maybeSingle();
 if(original.error)throw new MobileDmsError("The selected original could not be checked.");
 const file=z.object({id:rowId,document_id:rowId,version_id:rowId,file_name:z.string(),mime_type:z.string(),file_role:z.literal("original"),sha256_hash:z.string().nullable(),file_size_bytes:z.number().int().nonnegative()}).safeParse(original.data);
 if(!file.success||file.data.id!==input.fileId||file.data.document_id!==input.documentId)throw new MobileDmsError("The selected original does not belong to this document.",404);
 const storedSha=file.data.sha256_hash;
 if(!rowId.safeParse(result.data.current_version_id).success)throw new MobileDmsError("The document current version could not be verified. Refresh this document before saving offline.",409);
 const version=await db.from("dms_document_versions").select("id,document_id,version_number,version_label").eq("id",file.data.version_id).eq("document_id",input.documentId).maybeSingle();
 if(version.error)throw new MobileDmsError("The original version could not be checked.");
 if(!version.data||version.data.id!==file.data.version_id||version.data.document_id!==input.documentId)throw new MobileDmsError("The original version is unavailable.",404);
 const sha=storedSha&&/^[a-fA-F0-9]{64}$/.test(storedSha)?storedSha.toLowerCase():await hashProtectedOriginal(input.fileId,file.data.file_size_bytes);
 const current=await db.from("dms_document_files").select("id,document_id,version_id,file_name,mime_type,file_role,sha256_hash,file_size_bytes").eq("id",input.fileId).is("deleted_at",null).maybeSingle();
 if(current.error)throw new MobileDmsError("The current original-file binding could not be checked.");
 const checked=file.data,binding=current.data;
 if(!binding||Object.keys(checked).some(key=>binding[key as keyof typeof binding]!==checked[key as keyof typeof checked]))throw new MobileDmsError("The selected original changed. Refresh and save it again.",409);
 await verify();
 const doc=result.data,authorizedAt=Date.now();
 // version is document updated_at; versionId pins the actual original-file
 // version. The phone discards retained bytes on any binding mismatch.
 return {authUserId:ctx.profile!.auth_user_id,documentId:doc.id,fileId:file.data.id,versionId:file.data.version_id,currentVersionId:doc.current_version_id,authorizedAt,expiresAt:authorizedAt+input.days*86400000,
  version:doc.updated_at,documentNo:doc.document_no,title:doc.title,mime:file.data.mime_type,name:file.data.file_name,expiry:doc.expiry_date,size:file.data.file_size_bytes,
  sha256:sha.toLowerCase()};
}
