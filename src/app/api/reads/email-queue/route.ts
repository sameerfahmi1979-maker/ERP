import {readRoute} from "@/server/reads/route-response";
import {readEmailQueue} from "@/server/reads/email-queue";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) {return readRoute(request, input => readEmailQueue(input, undefined, request.signal));}
