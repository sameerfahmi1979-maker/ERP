import {readReportTemplateSelection} from "@/server/reads/report-template-selection";
import {readRoute} from "@/server/reads/route-response";
export async function GET(request: Request) {
  return readRoute(request, input => readReportTemplateSelection(input, undefined, request.signal));
}
export const POST = GET;
