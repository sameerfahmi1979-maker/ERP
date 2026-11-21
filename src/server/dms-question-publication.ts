import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {AsyncLocalStorage} from "node:async_hooks";
import {createAdminClient} from "@/lib/supabase/admin";

export const questionTextHash=(v:string)=>createHash("sha256").update(v,"utf8").digest("hex");
type Derivation={inputId:string};
type Ref={kind:"file_ocr"|"content_text";artifactId:string;artifactContentHash:string};
export async function captureQuestionParents(documentId:number,refs:Ref[],header?:Record<string,unknown>):Promise<Derivation|null>{
 if(!refs.length||refs.length>100)return null;
 const inputId=randomUUID();
 const r=await createAdminClient().rpc("dms_question_publish",{p_data:{kind:"reserve_input",inputId,documentId,refs,header:header??null}});
 if(r.error){if(r.error.code==="PGRST202"||r.error.code==="42883")return null;throw Error("Could not reserve verified extraction inputs");}
 return r.data===true?{inputId}:null;
}
export async function publishQuestionArtifact(data:{kind:"prepared_text"|"file_ocr"|"content_text"|"chunk_text"|"ai_summary";documentId:number;artifactId:string;artifactContentHash:string;versionId?:number;derivationHashes?:string[];inputId?:string;fileBindings?:{fileId:number;versionId:number;sha256:string}[]}) {
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
