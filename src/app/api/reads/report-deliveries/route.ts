import {readRoute} from "@/server/reads/route-response";
import {readReportDeliveries} from "@/server/reads/report-deliveries";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) {return readRoute(request, input => readReportDeliveries(input, undefined, request.signal));}
