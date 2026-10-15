import {readRoute} from "@/server/reads/route-response";
import {readHrSearch} from "@/server/reads/hr-search";
export async function GET(request: Request) {return readRoute(request, input => readHrSearch(input, undefined, request.signal));}
export const POST = GET;
