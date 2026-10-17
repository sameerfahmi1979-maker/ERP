import {readReportSavedFilters} from "@/server/reads/report-saved-filters";
import {readRoute} from "@/server/reads/route-response";
export async function GET(request: Request) {
  return readRoute(request, input => readReportSavedFilters(input, undefined, request.signal));
}
// Existing browser transport keeps search values out of access-log URLs.
export const POST = GET;
