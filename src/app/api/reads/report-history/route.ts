import {readReportHistory} from "@/server/reads/report-history";
import {readRoute} from "@/server/reads/route-response";
export async function POST(request: Request) {
  return readRoute(request, input => readReportHistory(input, undefined, request.signal));
}
