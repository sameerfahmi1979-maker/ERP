import {readRoute} from '@/server/reads/route-response';
import {readReportSchedules} from '@/server/reads/report-schedules';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function POST(request:Request){return readRoute(request,input=>readReportSchedules(input,request.signal));}
