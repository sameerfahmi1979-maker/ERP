import {z} from "zod";
import {getDmsReviewQueueItems,getDmsReviewQueueCounts,getDmsReviewQueueItem} from "@/server/actions/dms/review-queue";
import {readRoute} from "@/server/reads/route-response";
const schema=z.discriminatedUnion("kind",[
 z.object({kind:z.literal("list"),filters:z.record(z.string(),z.unknown())}).strict(),
 z.object({kind:z.literal("counts")}).strict(),
 z.object({kind:z.literal("detail"),id:z.number().int().positive()}).strict()
]);
export const dynamic="force-dynamic";
export async function POST(request:Request){return readRoute(request,async input=>{
 const p=schema.safeParse(input);if(!p.success)return {success:false,error:"Invalid review read"};
 const result=await (p.data.kind==="list"?getDmsReviewQueueItems(p.data.filters):p.data.kind==="detail"?getDmsReviewQueueItem(p.data.id):getDmsReviewQueueCounts());
 return result.error==="Not authenticated"?{success:false,error:"Permission denied"}:result;
});}
