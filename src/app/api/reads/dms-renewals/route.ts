import {getDmsRenewalRequests} from "@/server/actions/dms/renewals";
import {renewalFilterSchema} from "@/server/reads/dms-renewal-contract";
import {readRoute} from "@/server/reads/route-response";
export const dynamic="force-dynamic";
export async function POST(request:Request){
 return readRoute(request,async params=>{
  const parsed=renewalFilterSchema.safeParse(params);
  if(!parsed.success)return {success:false,error:"Invalid renewal criteria"};
  const result=await getDmsRenewalRequests(parsed.data);
  return result.error==="Not authenticated"?{success:false,error:"Permission denied"}:result;
 });
}
