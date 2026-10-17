import {readRoute} from "@/server/reads/route-response";
import {readDmsDashboard} from "@/server/reads/dms-dashboard";
export const dynamic="force-dynamic";
export async function POST(request:Request){return readRoute(request,input=>readDmsDashboard(input,undefined,request.signal));}
export async function GET(request:Request){return readRoute(request,input=>readDmsDashboard(input,undefined,request.signal));}
