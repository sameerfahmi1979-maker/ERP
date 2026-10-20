import {readRoute} from '@/server/reads/route-response';
import {readEmployeeProfileChoices} from '@/server/reads/employee-profile-choices';
export async function POST(request:Request){return readRoute(request,params=>readEmployeeProfileChoices(params,request.signal));}
