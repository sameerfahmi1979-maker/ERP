import {readDmsInboxPage} from "@/server/reads/dms-inbox";
import {readRoute} from "@/server/reads/route-response";
export const dynamic="force-dynamic";
export async function POST(request:Request){return readRoute(request,input=>readDmsInboxPage(input,request.signal));}
