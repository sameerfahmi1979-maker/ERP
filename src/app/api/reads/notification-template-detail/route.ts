import {readRoute} from "@/server/reads/route-response";
import {readNotificationTemplateDetail} from "@/server/reads/notification-templates";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export function POST(request:Request){return readRoute(request,input=>readNotificationTemplateDetail(input,undefined,request.signal));}
