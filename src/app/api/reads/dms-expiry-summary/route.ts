import {z} from "zod";
import {getDmsExpiryDashboardStats} from "@/server/actions/dms/expiry-reminders";
import {readRoute} from "@/server/reads/route-response";
export const dynamic="force-dynamic";
const criteria=z.object({}).strict();
export async function POST(request:Request){
 return readRoute(request,async params=>{
  if(!criteria.safeParse(params).success)return {success:false,error:"Invalid expiry summary criteria"};
  const result=await getDmsExpiryDashboardStats();
  return result.error==="Not authenticated"?{success:false,error:"Permission denied"}:result;
 });
}
