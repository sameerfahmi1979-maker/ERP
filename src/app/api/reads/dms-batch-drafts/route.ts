import {z} from "zod";
import {getDmsUploadBatchDrafts} from "@/server/actions/dms/batch-intake";
import {readRoute} from "@/server/reads/route-response";
export const dynamic="force-dynamic";
export async function POST(request:Request){return readRoute(request,async input=>{
 const p=z.object({batchId:z.number().int().positive()}).strict().safeParse(input);
 if(!p.success)return {success:false,error:"Invalid batch"};
 const r=await getDmsUploadBatchDrafts(p.data.batchId);return r.error==="Not authenticated"?{success:false,error:"Permission denied"}:r;
});}
