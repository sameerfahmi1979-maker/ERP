import {readAudit} from "@/server/reads/audit";
import {readRoute} from "@/server/reads/route-response";
export async function POST(request:Request){return readRoute(request,input=>readAudit(input,undefined,request.signal));}
