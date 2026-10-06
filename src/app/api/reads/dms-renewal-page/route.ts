import { readDmsRenewalPage } from "@/server/reads/dms-renewal-page";
import { readRoute } from "@/server/reads/route-response";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return readRoute(request, params => readDmsRenewalPage(params));
}
