import {readReportCriteria} from "@/server/reads/report-criteria";
import {readRoute} from "@/server/reads/route-response";
export async function POST(request: Request) {
  return readRoute(request, params => readReportCriteria(params, undefined, request.signal));
}
