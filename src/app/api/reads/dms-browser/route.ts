import {readRoute} from "@/server/reads/route-response";
import {readDmsBrowser} from "@/server/reads/dms-browser";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return readRoute(request, input => readDmsBrowser(input, undefined, request.signal));
}
