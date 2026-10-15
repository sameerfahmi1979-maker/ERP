import {readRoute} from "@/server/reads/route-response";
import {readNotificationDeliveries} from "@/server/reads/notification-deliveries";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export function POST(request:Request){return readRoute(request,input=>readNotificationDeliveries(input,undefined,request.signal));}
