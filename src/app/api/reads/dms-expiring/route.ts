import {getDmsExpiringDocuments} from "@/server/actions/dms/expiry-reminders";
import {expiryFilterSchema} from "@/server/reads/dms-expiry-contract";
import {readRoute} from "@/server/reads/route-response";
export const dynamic="force-dynamic";
export async function POST(request:Request){
 return readRoute(request,async params=>{
  const parsed=expiryFilterSchema.safeParse(params);
  if(!parsed.success)return {success:false,error:"Invalid expiry criteria"};
  const result=await getDmsExpiringDocuments(parsed.data);
  return result.error==="Not authenticated"?{success:false,error:"Permission denied"}:result;
 });
}
