import {readRoute} from "@/server/reads/route-response";
import {readNotifications} from "@/server/reads/notifications";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) {
  return readRoute(request, input => readNotifications(input, undefined, request.signal));
}
