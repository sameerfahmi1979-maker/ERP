import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { withMobileToken } from "@/lib/supabase/mobile-request";
import { hrCommand } from "@/server/mobile/hr-contracts";
import { dispatchHr } from "@/server/mobile/hr";
import { HrError } from "@/server/mobile/hr-shapes";

export const runtime = "nodejs";
const headers = {"Cache-Control":"private, no-store", Vary:"Authorization","X-Content-Type-Options":"nosniff"};
const result = (body:unknown,status:number) => Response.json(body,{headers,status});
async function read(request:Request) {
  if(request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase()!=="application/json" || !request.body) return null;
  const reader=request.body.getReader();
  const chunks:Uint8Array[]=[];
  let size=0;
  try {
    for (;;) {
      const {done,value}=await reader.read();
      if(done) break;
      size+=value.length;
      if(size>32768) { await reader.cancel();return null; }
      chunks.push(value);
    }
    return hrCommand.safeParse(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks))));
  } catch {return null;}
}
export function GET(request:Request) {
  const auth=request.headers.get("Authorization")??"";
  if(auth.length>8192 || !/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/i.test(auth)) return result({success:false,error:"Sign in with your ERP account."},401);
  return Response.json({success:false,error:"Use the HR POST command endpoint."},{status:405,headers:{...headers,Allow:"POST"}});
}
export async function POST(request:Request) {
  const auth=request.headers.get("Authorization")??"";
  const token=auth.length<=8192 && /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/i.exec(auth)?.[1];
  if(!token) return result({success:false,error:"Sign in with your ERP account."},401);
  const parsed=await read(request);
  if(!parsed?.success) return result({success:false,error:"Check the selected record, dates and form fields."},422);
  try {
    return await withMobileToken(token,async()=>{
      const ctx=await getAuthContext();
      if(!ctx.profile) throw new HrError(401,"Your ERP session ended. Sign in again.");
      if(!canUseApplication(ctx)) throw new HrError(403,"ERP access is unavailable for this account.");
      return result({success:true,data:await dispatchHr(parsed.data,ctx)},200);
    });
  } catch(e) {
    if(e instanceof HrError) return result({success:false,error:e.message,...(e.uncertain?{uncertain:true}:{})},e.status);
    const uncertain="operationId" in parsed.data || parsed.data.op==="rosterSave";
    return result({success:false,error:"HR could not confirm this request. Refresh or check the original operation.",...(uncertain?{uncertain:true}:{})},503);
  }
}
