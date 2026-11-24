import {acceptSupervisorWake,readSignedSupervisorWake} from "@/server/communications/supervisor-wake";
export const runtime="nodejs";
const response=(status:number)=>new Response(null,{status,headers:{"Cache-Control":"no-store"}});

// pg_net sends exactly {}. Also accept an empty operator POST. Never buffer an arbitrary request body.
async function fixedBody(request:Request):Promise<boolean> {
  if (!request.body) return true;
  const reader=request.body.getReader();let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    const read=async()=>{
      const bytes:number[]=[];
      for (;;) {const item=await reader.read();if(item.done)break;if(bytes.length+item.value.length>2)return false;bytes.push(...item.value);}
      return bytes.length===0 || (bytes.length===2 && bytes[0]===123 && bytes[1]===125);
    };
    return await Promise.race([read(),new Promise<false>(resolve=>{timer=setTimeout(()=>resolve(false),1000);})]);
  } catch {return false;}
  finally {clearTimeout(timer);void reader.cancel().catch(()=>{});}
}
export async function POST(request:Request) {
  if(request.headers.has("transfer-encoding") || !["0","2"].includes(request.headers.get("content-length")??"0") ||
    request.headers.has("cookie") || request.headers.has("origin") || request.headers.has("sec-fetch-site"))return response(400);
  const token=request.headers.get("x-erp-signed-wake");
  if(!token||token.length>4096||!readSignedSupervisorWake(token))return response(403);
  if(!await fixedBody(request))return response(400);
  return response((await acceptSupervisorWake(token)).status);
}
