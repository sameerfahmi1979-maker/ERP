import {readHrLinkedDocuments} from "@/server/reads/hr-linked-documents";
import {readRoute} from "@/server/reads/route-response";
export async function POST(request:Request){return readRoute(request,p=>readHrLinkedDocuments(p,request.signal));}
