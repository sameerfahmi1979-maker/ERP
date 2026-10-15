import {readRoute} from "@/server/reads/route-response";
import {readDmsApprovals} from "@/server/reads/dms-approvals";
export async function GET(request: Request) {
  return readRoute(request, input => readDmsApprovals(input, undefined, request.signal));
}
export const POST = GET;
