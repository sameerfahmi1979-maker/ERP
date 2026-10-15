import {readRoute} from "@/server/reads/route-response";
import {readNotificationTemplates} from "@/server/reads/notification-templates";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export function POST(request:Request){return readRoute(request,input=>readNotificationTemplates(input,undefined,request.signal));}
