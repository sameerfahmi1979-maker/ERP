import {readRoute} from "@/server/reads/route-response";
import {readSearchApprovalStatus} from "@/server/ai/search/approval-status";
export async function POST(request:Request){return readRoute(request,input=>readSearchApprovalStatus(input,request.signal));}
