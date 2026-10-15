import {readHrRecordChoices} from "@/server/reads/hr-record-choices";
import {readRoute} from "@/server/reads/route-response";
export async function POST(request:Request){return readRoute(request,params=>readHrRecordChoices(params,request.signal));}
