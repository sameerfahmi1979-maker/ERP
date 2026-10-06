import {readEmployeeFilterOptions} from "@/server/reads/employee-filter-options";
import {readRoute} from "@/server/reads/route-response";
export const dynamic="force-dynamic";
export async function POST(request:Request){return readRoute(request,params=>readEmployeeFilterOptions("designations",params));}
