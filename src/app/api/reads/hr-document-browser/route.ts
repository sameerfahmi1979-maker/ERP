import {readRoute} from "@/server/reads/route-response";
import {readHrDocumentBrowser} from "@/server/reads/hr-document-browser";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {return readRoute(request, input => readHrDocumentBrowser(input, undefined, request.signal));}
