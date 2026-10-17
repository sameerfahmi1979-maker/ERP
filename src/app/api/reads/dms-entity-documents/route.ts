import {readRoute} from "@/server/reads/route-response";
import {readDmsEntityDocuments} from "@/server/reads/dms-entity-documents";
export const dynamic="force-dynamic";
export async function POST(request:Request) {
  return readRoute(request,input=>readDmsEntityDocuments(input,undefined,request.signal));
}
// Compatibility only: adopted clients use POST so search/parent criteria do not
// enter infrastructure URL logs. Both methods retain identical admission rules.
export async function GET(request:Request) {
  return readRoute(request,input=>readDmsEntityDocuments(input,undefined,request.signal));
}
