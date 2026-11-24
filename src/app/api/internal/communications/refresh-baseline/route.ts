import {readBaselineCollectorGrant,runBaselineCollector} from "@/server/communications/baseline-collector";
export const runtime="nodejs";
const reply=(status:number)=>new Response(null,{status,headers:{"Cache-Control":"no-store"}});
async function fixedBody(request:Request) {
  if(!request.body)return true;
  const reader=request.body.getReader();let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    const read=async()=>{const bytes:number[]=[];for(;;){const part=await reader.read();if(part.done)break;
      if(bytes.length+part.value.length>2)return false;bytes.push(...part.value);}return bytes.length===0 || bytes.length===2&&bytes[0]===123&&bytes[1]===125;};
    return await Promise.race([read(),new Promise<false>(resolve=>{timer=setTimeout(()=>resolve(false),1000);})]);
  }catch{return false;}finally{clearTimeout(timer);void reader.cancel().catch(()=>{});}
}
export async function POST(request:Request) {
  if(request.headers.has("transfer-encoding") || !["0","2"].includes(request.headers.get("content-length")??"0") ||
    request.headers.has("cookie") || request.headers.has("origin") || request.headers.has("sec-fetch-site"))return reply(400);
  const auth=request.headers.get("authorization"),nonce=request.headers.get("x-erp-baseline-nonce");
  if(!auth?.startsWith("Bearer ") || auth.length>4103 || !nonce || nonce.length!==36)return reply(403);
  const token=auth.slice(7);if(!readBaselineCollectorGrant(token,nonce))return reply(403);
  if(!await fixedBody(request))return reply(400);
  const result=await runBaselineCollector(token,nonce);return reply(result==="updated"?204:result==="invalid"?403:503);
}
