import "server-only";
import {z} from "zod";
import type {AuthContext} from "@/lib/rbac/check";
import type {createClient} from "@/lib/supabase/server";
import {documentMeaning,hasDocumentLanguage} from "@/lib/ai/search/vocabulary";
import {matchAiSearchLookups} from "@/lib/dms/ai/search-text";
import {resolveSearchSubjects,SearchClarification} from "./document-query";
import {readAllPages} from "@/server/reads/all-pages";
const sources=[{key:"identity",table:"hr_identity_document_types"},{key:"card",table:"hr_access_card_types"},{key:"training",table:"hr_training_types"}];
/** Configured HR type IDs stay separate from DMS IDs. No new HR write/tool. */
export async function prepareHrSearchMeaning(db:Awaited<ReturnType<typeof createClient>>,query:string,ctx:AuthContext,signal?:AbortSignal){
 if(!hasDocumentLanguage(query))return null;
 const configured=await Promise.all(sources.map(async s=>({key:s.key,rows:await readAllPages(async(from,to)=>{let q=db.from(s.table).select("id,name_en,type_code:code",{count:"exact"}).is("deleted_at",null).order("id").range(from,to);if(signal)q=q.abortSignal(signal);const r=await q;return {...r,data:r.error?null:z.array(z.object({id:z.number().int().positive().safe(),name_en:z.string(),type_code:z.string()})).parse(r.data)};},{batchSize:500,maxRows:5000,identity:r=>r.id})})));
 const meaning=documentMeaning(query,configured.flatMap(c=>c.rows));
 if(!meaning.typeHint)return null;
 const bySource=new Map(configured.map(c=>[c.key,matchAiSearchLookups(meaning.typeHint!,c.rows).map(t=>t.id)]));
 let employeeId:number|null=null,text=meaning.remainder;
 if(meaning.subjectHint&&!/[\d@:/]/.test(meaning.subjectHint)){
  const subjects=await resolveSearchSubjects(db,meaning.subjectHint,ctx,signal);
  if(subjects.length!==1||subjects[0].type!=="employee")throw new SearchClarification();
  employeeId=subjects[0].id;text=text.replace(meaning.subjectHint,"").trim();
 }
 return {bySource,employeeId,text,expiry:meaning.expiry};
}
