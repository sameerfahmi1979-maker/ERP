import {readPayrollPoint} from "@/server/reads/hr-payroll-records";
import {readRoute} from "@/server/reads/route-response";
export async function POST(request: Request) {return readRoute(request, readPayrollPoint);}
