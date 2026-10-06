import {readEmployees,employeeReadSchema} from "@/server/reads/employees";
import {readRoute} from "@/server/reads/route-response";
export const dynamic="force-dynamic";
export async function POST(request:Request){return readRoute(request,input=>{const p=employeeReadSchema.safeParse(input);return p.success?readEmployees(p.data):Promise.resolve({success:false,error:"Invalid employee search or page"});});}
