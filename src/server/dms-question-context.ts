import "server-only";
import {createHash} from "node:crypto";
import {z} from "zod";
import type {AuthContext} from "@/lib/rbac/check";
import {hash,id,source,type Source} from "@/server/mobile/dms-v5/contracts";
import {admitMobileDmsSource,conflict,DmsError,rpc,verifySession} from "@/server/mobile/dms-v5/access";

export const artifactKind=z.enum(["prepared_text","file_ocr","content_text","chunk_text","ai_summary"]);
const artifact=z.strictObject({kind:artifactKind,artifactId:z.string().min(1).max(100),documentId:id,versionId:id,artifactContentHash:hash,proofHash:hash,fileBindings:z.array(z.strictObject({fileId:id,versionId:id,sha256:hash})).min(1).max(100),derivationHashes:z.array(hash).max(100),text:z.string().max(16000),truncated:z.boolean()});
const envelope=z.strictObject({source,metadata:z.record(z.string(),z.json()),artifacts:z.array(artifact).max(250)});
type ContextMode="verified_text"|"metadata_only";
type Material=Pick<z.infer<typeof envelope>,"metadata"|"artifacts">;
export function groundQuestion(bound:Source,material:Material,mode:ContextMode){
 const artifacts=mode==="metadata_only"?[]:material.artifacts.filter(a=>a.documentId===bound.documentId&&a.versionId===bound.documentVersionId&&a.fileBindings.length&&a.fileBindings.every(f=>f.versionId===bound.documentVersionId)&&a.text.trim().length>0);
 if(mode==="verified_text"&&!artifacts.length)throw new DmsError(503,"question_source_preparation_required","Verified text is unavailable. Open source preparation and reread the current files.");
 const rank=(a:z.infer<typeof artifact>)=>artifactKind.options.indexOf(a.kind);
 artifacts.sort((a,b)=>rank(a)-rank(b)||(a.artifactId<b.artifactId?-1:a.artifactId>b.artifactId?1:0));
 let budget=8000,contentTruncated=false;
 const selected=artifacts.flatMap(a=>{
  if(budget<1){contentTruncated=true;return [];}
  const text=a.text.slice(0,budget);budget-=text.length;contentTruncated||=a.truncated||text.length!==a.text.length;
  return [{...a,text}];
 });
 const prompt=JSON.stringify({metadata:material.metadata,passages:selected.map((v,i)=>({index:i,kind:v.kind,text:v.text}))});
 const groundingHash=createHash("sha256").update(JSON.stringify(["dms-grounding/1",bound.sourceHash,mode,prompt,artifacts.map(a=>[a.proofHash,a.artifactContentHash,a.fileBindings,a.derivationHashes]),selected.map(s=>[s.artifactId,s.text.length])])).digest("hex");
 return {prompt,groundingHash,sourceKinds:[...new Set<z.infer<typeof artifactKind>|"metadata">(["metadata",...selected.map(s=>s.kind)])],contentTruncated,selected};
}
export async function readVerifiedDmsQuestionContext(ctx:AuthContext,input:{documentId:number;sourceHash:string;contextMode:ContextMode}){
 const bound=await admitMobileDmsSource(ctx,{documentId:input.documentId,sourceHash:input.sourceHash},["dms.documents.view","dms.documents.preview"]);
 const data=await rpc("mobile_dms_question_context",{p_data:input},envelope);
 if(data.source.sourceHash!==bound.sourceHash||data.source.documentId!==bound.documentId||data.source.documentVersionId!==bound.documentVersionId)conflict();
 return {source:bound,...groundQuestion(bound,data,input.contextMode)};
}
export async function verifyDmsQuestionDelivery(ctx:AuthContext,input:Parameters<typeof readVerifiedDmsQuestionContext>[1],expected:string){
 await verifySession(ctx);const fresh=await readVerifiedDmsQuestionContext(ctx,input);
 if(fresh.groundingHash!==expected)conflict();
}
