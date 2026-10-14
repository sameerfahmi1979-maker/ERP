import {readHrComplianceRecords} from "@/server/reads/hr-compliance-records";
import {readRoute} from "@/server/reads/route-response";

export async function POST(request: Request) {
  return readRoute(request, params => readHrComplianceRecords(params, undefined, request.signal));
}
