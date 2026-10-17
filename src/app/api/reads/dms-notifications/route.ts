import {readRoute} from "@/server/reads/route-response";
import {readDmsNotifications} from "@/server/reads/dms-notifications";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export function POST(request:Request){return readRoute(request,input=>readDmsNotifications(input,undefined,request.signal));}
