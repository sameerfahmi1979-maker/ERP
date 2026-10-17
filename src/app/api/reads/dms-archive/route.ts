import {readDmsArchivePage} from "@/server/reads/dms-archive";
import {readRoute} from "@/server/reads/route-response";
export const dynamic="force-dynamic";
export async function POST(request:Request){return readRoute(request,readDmsArchivePage);}
