import { z } from "zod";
import { getAuthContext, canUseApplication } from "@/lib/rbac/check";
import { withMobileToken } from "@/lib/supabase/mobile-request";
import { deliverSubjectPhoto } from "@/server/hr-photo-delivery";
import { deliverIssuedFile } from "@/server/issued-file-delivery";

const id=z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().safe().positive());
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const photo=z.strictObject({employeeId:id,dependentId:id.optional(),documentId:id,versionId:id,fileId:id,fingerprint:hash,mode:z.enum(["preview","download","original"])});
const issued=z.strictObject({employeeId:id,issuanceId:id,checksum:hash,mode:z.enum(["preview","download"])});
const headers={"Cache-Control":"private, no-store",Vary:"Authorization","X-Content-Type-Options":"nosniff"};
const failure=(status:number,error:string)=>Response.json({error},{status,headers});

export async function mobileBytes(request:Request,kind:"photo"|"issued-file") {
  const auth=request.headers.get("Authorization")??"";
  const token=auth.length<=8192 && /^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/i.exec(auth)?.[1];
  if(!token)return failure(401,"Sign in with your ERP account.");
  const query=new URL(request.url).searchParams;
  if(new Set(query.keys()).size!==query.size)return failure(422,"Repeated parameter.");
  const input=(kind==="photo"?photo:issued).safeParse(Object.fromEntries(query));
  if(!input.success)return failure(422,"Invalid file opening.");
  try {
    return await withMobileToken(token,async()=>{
      const ctx=await getAuthContext();
      if(!ctx.profile)return failure(401,"Sign in with your ERP account.");
      if(!canUseApplication(ctx))return failure(403,"Current account required.");
      const q=input.data;
      const response="issuanceId" in q ? await deliverIssuedFile(q.issuanceId,q,request.method==="HEAD",request.signal) : await deliverSubjectPhoto(q.employeeId,q.dependentId??null,q.mode,q);
      for(const [key,value] of Object.entries(headers))response.headers.set(key,value);
      return response;
    });
  } catch {return failure(503,"File delivery unavailable.");}
}
