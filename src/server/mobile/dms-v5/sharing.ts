import {createHash} from "node:crypto";
import {z} from "zod";
import {completePage,type CommandFor,hash,id,shareToken} from "./contracts";
import {pagePayload} from "./collections";
import {invalid,rpc} from "./access";

const disposition=z.enum(["inline","attachment"]);
export function parseFileMode(request:Request) {
 const params=new URL(request.url).searchParams,keys=[...params.keys()],token=request.headers.get("X-ALGT-DMS-Share");
 if(new Set(keys).size!==keys.length)invalid();
 const exact=(names:string[])=>keys.length===names.length&&names.every(k=>params.has(k));
 if(params.has("share")||token!==null){
  const value=shareToken.safeParse(token),mode=disposition.safeParse(params.get("disposition"));
  if(!exact(["share","disposition"])||params.get("share")!=="1"||!value.success||!mode.success)invalid();
  return {mode:"share" as const,token:value.data,disposition:mode.data};
 }
 if(keys.some(k=>k.startsWith("expected"))){
  const employee=params.has("expectedEmployeeId"),mode=disposition.safeParse(params.get("disposition"));
  if(!exact(["fileId","disposition","expectedDocumentId","expectedVersionId","expectedSourceHash",...(employee?["expectedEmployeeId"]:[])])||!mode.success||!employee&&mode.data!=="attachment")invalid();
  const number=(key:string)=>{const raw=params.get(key)??"";if(!/^[1-9][0-9]*$/.test(raw)||!id.safeParse(Number(raw)).success)invalid();return Number(raw);};
  const fingerprint=hash.safeParse(params.get("expectedSourceHash"));if(!fingerprint.success)invalid();
  return {mode:"pinned" as const,disposition:mode.data,...(employee?{employeeId:number("expectedEmployeeId")}:{}),documentId:number("expectedDocumentId"),versionId:number("expectedVersionId"),fileId:number("fileId"),sourceHash:fingerprint.data};
 }
 if(keys.some(k=>!["fileId","disposition"].includes(k)))invalid();
 return {mode:"legacy" as const};
}
export async function readShares(input:CommandFor<"documentShareRecipients"|"documentShares">){
 if(input.op==="documentShareRecipients"){
  const {op,...data}=input;void op;
  const r=await rpc("mobile_dms_shares",{p_action:"recipients",p_data:data},pagePayload(z.strictObject({profileId:id,label:z.string()})));
  return completePage(r.rows,input.page,25,r.totalCount,v=>v.profileId);
 }
 const r=await rpc("mobile_dms_shares",{p_action:"list",p_data:{documentId:input.documentId,page:input.page}},pagePayload(z.strictObject({id,recipientLabel:z.string(),createdAt:z.iso.datetime({offset:true}),expiresAt:z.iso.datetime({offset:true}),state:z.enum(["active","expired","revoked","stale_source"]),canRevoke:z.boolean(),versionId:id,fileId:id})));
 return completePage(r.rows,input.page,25,r.totalCount,v=>v.id);
}
export const tokenHash=(token:string)=>createHash("sha256").update(Buffer.from(shareToken.parse(token),"base64url")).digest("hex");
const resolveSchema=z.strictObject({shareId:id,title:z.string().max(1000),number:z.string().max(128),expiresAt:z.iso.datetime({offset:true}),source:z.strictObject({documentId:id,versionId:id,fileId:id,sourceHash:hash}),canPreview:z.literal(true),canDownload:z.literal(true)});
export function resolveShare(token:string,action:"resolve"|"preflight"|"delivered"="resolve",eventId?:number){
 return rpc("mobile_dms_shares",{p_action:action,p_data:{tokenHash:tokenHash(token),...(eventId?{eventId}:{})}},resolveSchema);
}
export async function mutateShare(input:CommandFor<"documentShareCreate"|"documentShareRevoke">){
 if(input.op==="documentShareCreate"){
  const {op,token,...data}=input;void op;
  return rpc("mobile_dms_shares",{p_action:"create",p_data:{...data,tokenHash:tokenHash(token)}},z.strictObject({id,operationId:z.literal(input.operationId),replayed:z.boolean(),expiresAt:z.iso.datetime({offset:true}),source:z.strictObject({documentId:z.literal(input.documentId),versionId:z.literal(input.versionId),fileId:z.literal(input.fileId)})}),true);
 }
 return rpc("mobile_dms_shares",{p_action:"revoke",p_data:{shareId:input.shareId,operationId:input.operationId}},z.strictObject({shareId:z.literal(input.shareId),operationId:z.literal(input.operationId),state:z.literal("revoked"),replayed:z.boolean()}),true);
}
