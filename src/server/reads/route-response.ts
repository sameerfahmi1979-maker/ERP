import "server-only";
import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";
import {runSingleDatabaseReadAttempt} from "@/lib/supabase/read-attempt-scope";
export async function readRoute(request:Request,reader:(params:unknown)=>Promise<{success:boolean;error?:string;data?:unknown}>) {
  const correlationId=randomUUID();
  const headers={"Cache-Control":"private, no-store, max-age=0","Vary":"Cookie","X-Content-Type-Options":"nosniff","X-ERP-Correlation":correlationId};
  const fail=(status:number,error:string)=>Response.json({success:false,error,correlationId},{status,headers});
  try {
  let raw:string|null;
  if(request.method==="POST"){
    if(!request.headers.get("content-type")?.startsWith("application/json"))return fail(400,"Invalid read parameters");
    const reader=request.body?.getReader();let size=0;const parts:Uint8Array[]=[];
    if(reader)for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4000){await reader.cancel();return fail(400,"Invalid read parameters");}parts.push(value);}
    const body=new Uint8Array(size);let at=0;for(const part of parts){body.set(part,at);at+=part.length;}raw=new TextDecoder().decode(body);
  } else raw=new URL(request.url).searchParams.get("params");
  if(raw&&raw.length>4000)return fail(400,"Invalid read parameters");
  let params:unknown;
  try{params=raw?JSON.parse(raw):{};}catch{return fail(400,"Invalid read parameters");}
  // TanStack owns the one whole-read retry. This also covers live auth/profile
  // reads made by these factories, without multiplying SDK GET/HEAD retries.
  const result=await runSingleDatabaseReadAttempt(()=>reader(params));
  if(result.success)return Response.json(result,{status:200,headers});
  if(result.error==="Permission denied")return fail(403,"Permission denied");
  if(result.error?.startsWith("Invalid "))return fail(400,"Invalid read parameters");
  logger.warn("Authorized read unavailable",{correlationId,code:"READ_UNAVAILABLE"});
  return fail(503,"Records could not be loaded. Please retry.");
  } catch {
    logger.warn("Authorized read unavailable",{correlationId,code:"READ_UNAVAILABLE"});
    return fail(503,"Records could not be loaded. Please retry.");
  }
}
