import {readPayrollInquiry} from "@/server/reads/hr-payroll-inquiries";
import {readRoute} from "@/server/reads/route-response";
export async function POST(request: Request) {return readRoute(request, params => readPayrollInquiry(params, undefined, request.signal));}
