import {readRoute} from "@/server/reads/route-response";
import {readPendingEmailCount} from "@/server/reads/email-queue";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(request: Request) {return readRoute(request, input => input !== null && typeof input === "object" && !Array.isArray(input) && Object.keys(input).length === 0 ? readPendingEmailCount(undefined, request.signal) : Promise.resolve({success: false, error: "Invalid pending count criteria"}));}
