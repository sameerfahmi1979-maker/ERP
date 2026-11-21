import "server-only";
import {createHash} from "node:crypto";
import {AsyncLocalStorage} from "node:async_hooks";
import {z} from "zod";
import {createAdminClient} from "@/lib/supabase/admin";
import {hash,id} from "./mobile/dms-v5/contracts";

export const questionTextHash=(v:string)=>createHash("sha256").update(v,"utf8").digest("hex");
const parentSchema=z.strictObject({versionId:id,derivationHashes:z.array(hash).min(1).max(100),headerHash:hash.nullable()});
type Derivation=z.infer<typeof parentSchema>;
type Ref={kind:"file_ocr"|"content_text";artifactId:string;artifactContentHash:string};
export async function captureQuestionParents(documentId:number,refs:Ref[],header?:Record<string,unknown>):Promise<Derivation|null>{
 if(!refs.length||refs.length>100)return null;
 const r=await createAdminClient().rpc("dms_question_writer_parent",{p_document:documentId,p_refs:refs,p_header:header??null});
 if(r.error){if(r.error.code==="PGRST202"||r.error.code==="42883")return null;throw Error("Could not verify extraction lineage");}
 return r.data===null?null:parentSchema.parse(r.data);
}
export async function publishQuestionArtifact(data:{kind:"prepared_text"|"file_ocr"|"content_text"|"chunk_text"|"ai_summary";documentId:number;artifactId:string;artifactContentHash:string;versionId:number;derivationHashes:string[];headerHash?:string|null;fileBindings?:{fileId:number;versionId:number;sha256:string}[]}) {
 const r=await createAdminClient().rpc("dms_question_publish",{p_data:data});
 if(r.error&&r.error.code!=="PGRST202"&&r.error.code!=="42883")throw Error("Could not publish verified extraction lineage");
 return r.data===true;
}
const contentScope=new AsyncLocalStorage<{documentId:number;expectedHash:string;parent:Derivation}>();
export function withVerifiedContent<T>(documentId:number,expectedHash:string,parent:Derivation|null,write:()=>Promise<T>){
 return parent?contentScope.run({documentId,expectedHash,parent},write):write();
}
export async function publishVerifiedContent(documentId:number,contentHash:string) {
 const current=contentScope.getStore();if(!current||current.documentId!==documentId||current.expectedHash!==contentHash)return;
 await publishQuestionArtifact({kind:"content_text",documentId,artifactId:String(documentId),artifactContentHash:contentHash,...current.parent});
}
