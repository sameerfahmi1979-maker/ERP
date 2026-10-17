import "server-only";
import type {createClient} from "@/lib/supabase/server";
/** Exact-subject checks distinguish forbidden from an authorized empty list. */
export async function hrSubjectPermission(db:Awaited<ReturnType<typeof createClient>>,employeeId:number,code:string):Promise<boolean>{
 const result=await db.rpc("f03_has_employee_permission",{employee_id:employeeId,permission_code:code});
 if(result.error||typeof result.data!=="boolean")throw Error("Employee permission could not be verified");
 return result.data;
}
