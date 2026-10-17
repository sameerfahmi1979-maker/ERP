import {readHrDocumentChoices} from "@/server/reads/hr-document-choices";
import {readRoute} from "@/server/reads/route-response";
export async function POST(request:Request){return readRoute(request,p=>readHrDocumentChoices(p,request.signal));}
