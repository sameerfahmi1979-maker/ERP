"use server";
import {z} from "zod";
import {sharedSearchSchema} from "@/lib/ai/search/vocabulary";
import {searchDocuments} from "@/server/ai/search/documents";
/** Provider matches are suggestions only; intersect all current hard constraints. */
export async function filterSearchCandidateIds(raw:unknown){
 const parsed=z.strictObject({query:z.string().max(500),candidateIds:z.array(z.number().int().positive().safe()).max(100),
  mode:z.enum(["content","semantic"]).default("content"),filters:sharedSearchSchema.shape.filters.optional()}).safeParse(raw);
 if(!parsed.success)return {success:false as const,error:"Invalid search candidates"};
 const result=await searchDocuments({query:parsed.data.query,mode:parsed.data.mode,pageSize:100,filters:{...parsed.data.filters,candidateIds:parsed.data.candidateIds}});
 if(!result.success)return result;
 if(result.data.outcome==="clarification_required")return {success:false as const,error:result.data.message};
 return {success:true as const,data:result.data.rows.map(row=>row.id)};
}
