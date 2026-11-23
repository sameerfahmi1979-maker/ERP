import { authorizeWorker } from "@/lib/email/queue/worker-auth";
import { dispatchOnePush } from "@/server/communications/notifications-provider";
export const runtime="nodejs";
export const maxDuration=45;
export async function POST(request:Request) {
  const headers={"Cache-Control":"private, no-store"};
  if (!authorizeWorker(request.headers.get("authorization"),process.env.INTERNAL_API_SECRET))
    return Response.json({error:"Unauthorized"},{status:401,headers});
  try {
    // Each bounded concurrent claim carries its own cost permit and registration.
    const results=await Promise.allSettled(Array.from({length:8},()=>dispatchOnePush()));
    const states:Record<string,number>={};
    for(const result of results) {
      const state=result.status==="fulfilled"?result.value.state:"unconfirmed";
      states[state]=(states[state]??0)+1;
    }
    return Response.json({states},{headers,status:states.unconfirmed?503:200});
  } catch {
    return Response.json({error:"Push dispatch unconfirmed."},{status:503,headers});
  }
}
