import {readHrActionRecordDetail} from "@/server/reads/hr-action-records";
import {readRoute} from "@/server/reads/route-response";
export async function POST(request: Request) {return readRoute(request, readHrActionRecordDetail);}
