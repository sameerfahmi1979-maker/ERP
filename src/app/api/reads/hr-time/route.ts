import {readHrTime} from "@/server/reads/hr-time";
import {readRoute} from "@/server/reads/route-response";
export async function POST(request: Request) {return readRoute(request, readHrTime);}
