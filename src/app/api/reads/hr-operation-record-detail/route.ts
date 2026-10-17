import {readHrOperationRecordDetail} from "@/server/reads/hr-operation-records";
import {readRoute} from "@/server/reads/route-response";
export async function POST(request: Request) {return readRoute(request, readHrOperationRecordDetail);}
