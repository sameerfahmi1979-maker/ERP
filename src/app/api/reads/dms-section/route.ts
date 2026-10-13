import {readRoute} from "@/server/reads/route-response";
import {readDmsSection} from "@/server/reads/dms-section";
export const dynamic="force-dynamic";
export async function POST(request:Request){return readRoute(request,async input=>{
 const result=await readDmsSection(input);
 // A disabled optional feature is a supported state, never a transient read failure.
 if("code" in result&&result.code==="FEATURE_DISABLED")return {success:true,featureDisabled:true};
 return result;
});}
