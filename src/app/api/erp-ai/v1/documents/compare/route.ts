import {compareDocumentSources} from "@/server/ai/document-comparison";
export const runtime="nodejs";
export const dynamic="force-dynamic";
/** Session-scoped read API. Recording findings uses the reviewed server action. */
export async function POST(request:Request){
 const headers={"Cache-Control":"private, no-store","Vary":"Cookie, Authorization","X-Content-Type-Options":"nosniff"};
 try{
  const origin=request.headers.get("origin");
  if(origin&&origin!==new URL(request.url).origin)return Response.json({success:false,error:"Origin not allowed"},{status:403,headers});
  if(Number(request.headers.get("content-length")??0)>16384)return Response.json({success:false,error:"Request too large"},{status:413,headers});
  const text=await request.text();if(text.length>16384)return Response.json({success:false,error:"Request too large"},{status:413,headers});
  const input=JSON.parse(text);if(input.recordFindings===true)return Response.json({success:false,error:"Use the explicit reviewed finding action"},{status:400,headers});
  const result=await compareDocumentSources(input,request.signal);
  return Response.json(result,{status:result.success?200:400,headers});
 }catch{return Response.json({success:false,error:"Comparison unavailable"},{status:400,headers});}
}
