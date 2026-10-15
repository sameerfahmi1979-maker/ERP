import {readHrTimeRecords} from "@/server/reads/hr-time-records";
import {readRoute} from "@/server/reads/route-response";

export async function POST(request: Request) {
  return readRoute(request, params => readHrTimeRecords(params, undefined, request.signal));
}
