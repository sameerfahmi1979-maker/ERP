import {z} from "zod";
import {batchRequestSchema} from "@/lib/dms/batch-admission";

export const id = z.number().int().positive().safe();
export const hash = z.string().regex(/^[0-9a-f]{64}$/);
export const page = id.max(100_000);
const operationId = z.uuid();
export const parent = z.strictObject({entityType:z.enum(["employee","site"]), entityId:id});
export const shareToken = z.string().regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/);
export const commentRevision = z.string().regex(/^[1-9][0-9]{0,18}$/).refine(s=>s.length<19 || s<="9223372036854775807");
export const source = z.strictObject({documentId:id,documentVersionId:id,documentRevision:z.string().min(1).max(256),fileId:id.nullable(),fileSha256:hash.nullable(),sourceHash:hash});
export type Source = z.infer<typeof source>;
export const summary = z.strictObject({id,title:z.string().max(1000),number:z.string().max(128),type:z.string().nullable(),expiry:z.iso.date().nullable(),status:z.string().max(64)});
const requiredText=(max:number)=>z.string().trim().min(1).max(max);
const search=z.string().trim().max(100), notes=z.string().trim().max(2000);
const ids=(min:number,max:number)=>z.array(id).min(min).max(max).refine(v=>new Set(v).size===v.length);
const kind=z.enum(["missing","renewal"]),format=z.enum(["zip","pdf"]);
export const retryStep=z.enum(["content_sync","ai_summary","intelligence","embedding","tag_suggestions","link_suggestions"]);
export const requestStatus=z.enum(["requested","in_progress","submitted","fulfilled","rejected","cancelled"]);
export const savedCriteria=z.strictObject({version:z.literal(1),search:z.string().max(200),personal:z.boolean(),entityType:parent.shape.entityType.optional(),entityId:id.optional(),typeId:id.optional(),validity:z.enum(["all","valid","expired","expiring"])}).refine(v=>(v.entityId===undefined)===(v.entityType===undefined)&&!(v.entityId&&v.personal));
const metadataValue=z.strictObject({definition_id:id,value_text:z.string().max(16384).nullish(),value_date:z.iso.date().nullish(),value_datetime:z.iso.datetime({offset:true}).nullish(),value_boolean:z.boolean().nullish(),value_number:z.number().finite().nullish(),value_json:z.json().nullish()}).refine(v=>Object.entries(v).filter(([key,val])=>key!=="definition_id"&&val!=null).length<=1&&Buffer.byteLength(JSON.stringify(v.value_json??null))<=16384);
const doc={documentId:id}, mutation={...doc,operationId,sourceHash:hash}, comment={...mutation,commentId:id,commentRevision}, pageDoc={...doc,page};
const command=<N extends string,F extends z.ZodRawShape>(name:N,fields:F)=>z.strictObject({op:z.literal(name),...fields});
const requestBase={parent,assigneeId:id.nullable(),dueDate:z.iso.date().nullable(),notes,operationId};
export const mobileDmsV5Command=z.discriminatedUnion("op",[
 command("documentDetails",doc),command("documentSources",{...pageDoc,kind:z.enum(["versions","files"]),versionId:id.optional()}).refine(v=>v.kind==="files"||v.versionId===undefined),
 command("documentMetadata",doc),command("documentMetadataSave",{...mutation,snapshot:hash,values:z.array(metadataValue).max(250).refine(v=>new Set(v.map(row=>row.definition_id)).size===v.length)}),
 command("documentTags",pageDoc),command("documentTagOptions",{...pageDoc,search}),
 command("documentTagsChange",{...mutation,add:ids(0,100),remove:ids(0,100)}).refine(v=>v.add.every(n=>!v.remove.includes(n))),
 command("documentComments",pageDoc),command("documentCommentAdd",{...mutation,text:requiredText(2000)}),command("documentCommentEdit",{...comment,text:requiredText(2000)}),command("documentCommentDelete",comment),
 command("documentHistory",{...pageDoc,filter:z.enum(["all","downloads"])}),command("processingStatus",{...doc,jobId:id.optional()}),
 z.discriminatedUnion("action",[
  command("processingAction",{...mutation,jobId:id,action:z.enum(["resume","cancel"])}),
  command("processingAction",{...mutation,jobId:id,action:z.literal("retry_step"),step:retryStep}),
  command("processingAction",{...mutation,action:z.literal("prepare_source"),snapshot:hash,fileIds:ids(1,10)})
 ]),
 command("documentCompare",{sources:z.array(z.strictObject({...doc,versionId:id})).min(2).max(10).refine(v=>new Set(v.map(s=>s.documentId+"/"+s.versionId)).size===v.length),recordFindings:z.literal(false)}),
 command("documentQuestion",{...doc,sourceHash:hash,question:requiredText(500).min(3),contextMode:z.enum(["verified_text","metadata_only"]).default("verified_text")}),
 command("documentNaturalSearch",{query:requiredText(500).min(3),subject:parent.optional(),page}),command("documentNotifications",{page,unreadOnly:z.boolean()}),
 command("documentNotificationAction",{notificationId:id,action:z.enum(["read","dismiss"])}),command("requiredChecklist",{parent,page}),
 command("documentRequestOptions",{parent,kind,documentId:id.optional(),search,page}).refine(v=>(v.kind==="renewal")===(v.documentId!==undefined)),
 command("documentRequests",{audience:z.enum(["mine","assigned","parent"]),parent:parent.optional(),status:requestStatus.optional(),page}).refine(v=>(v.audience==="parent")===(v.parent!==undefined)),
 z.discriminatedUnion("kind",[command("documentRequestCreate",{...requestBase,kind:z.literal("missing"),ruleId:id,checklistHash:hash}),command("documentRequestCreate",{...requestBase,kind:z.literal("renewal"),...doc,sourceHash:hash,priority:z.enum(["normal","high","urgent"])})]),
 command("documentRequestAct",{requestId:id,kind,operationId,expectedRevision:id,action:z.enum(["start","submit_document","fulfil","reject","cancel"]),documentId:id.optional(),versionId:id.optional(),notes}).refine(v=>(v.action==="submit_document")===(v.documentId!==undefined)&&(v.documentId===undefined)===(v.versionId===undefined)),
 command("documentShareRecipients",{...pageDoc,sourceHash:hash,search}),command("documentShares",pageDoc),
 command("documentShareCreate",{...mutation,fileId:id,versionId:id,recipientProfileId:id,token:shareToken,lifetimeHours:z.union([z.literal(1),z.literal(24),z.literal(168)])}),
 command("documentShareRevoke",{shareId:id,operationId}),command("documentShareResolve",{token:shareToken}),
 command("documentPackManifest",{documentIds:ids(1,25),format}),command("documentPackValidate",{documentIds:ids(1,25),format,manifestHash:hash}),
 command("documentFavourites",{page}),command("documentFavouriteSet",{...doc,value:z.boolean()}),command("documentSavedFilters",{page}),
 command("documentSavedFilterSave",{id:id.optional(),name:requiredText(80),criteria:savedCriteria,operationId,revision:requiredText(128).optional()}).refine(v=>(v.id===undefined)===(v.revision===undefined)),
 command("documentSavedFilterDelete",{id,operationId,revision:requiredText(128)}),command("documentQrLookup",{payload:requiredText(512)}),
 command("documentBatchAdmit",{request:batchRequestSchema}),command("documentBatchRecover",{request:batchRequestSchema}),
 command("documentBatchMember",{request:batchRequestSchema,position:z.number().int().min(0).max(9),action:z.enum(["recover","verify","prepare_draft"])}).refine(v=>v.position<v.request.manifest.files.length)
]);
export type MobileDmsV5Command=z.infer<typeof mobileDmsV5Command>;
export type CommandFor<N extends MobileDmsV5Command["op"]> = Extract<MobileDmsV5Command,{op:N}>;
export function completePage<T>(rows:T[],currentPage:number,pageSize:20|25,totalCount:number|null,identity:(row:T)=>string|number) {
 const offset=(currentPage-1)*pageSize;
 if(totalCount===null||!Number.isSafeInteger(totalCount)||totalCount<0||rows.length!==Math.min(pageSize,Math.max(0,totalCount-offset))||new Set(rows.map(identity)).size!==rows.length)throw new Error("Incomplete DMS result page");
 return {rows,page:currentPage,pageSize,totalCount,hasMore:offset+rows.length<totalCount,asOf:new Date().toISOString()};
}
