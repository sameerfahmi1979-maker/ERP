import {readHrTimeChoices} from "@/server/reads/hr-time-choices";
import {readRoute} from "@/server/reads/route-response";
export async function POST(request:Request){return readRoute(request,params=>readHrTimeChoices(params,request.signal));}
