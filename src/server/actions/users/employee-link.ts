"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, assertAccountActive, hasPermissionInScope, hasGlobalPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";

async function targetForLink(profileId: number) {
  if (!Number.isSafeInteger(profileId) || profileId <= 0) throw new Error("Invalid account");
  const ctx=await getAuthContext(); assertAccountActive(ctx);
  const {data,error}=await createAdminClient().from("user_profiles").select("id,owner_company_id,branch_id").eq("id",profileId).single();
  if(error || !data || !(data.owner_company_id===null?hasGlobalPermission(ctx,"users.employee_link.manage"):hasPermissionInScope(ctx,"users.employee_link.manage",data.owner_company_id,data.branch_id))) throw new Error("Access denied");
  return data;
}
export async function getEmployeeIdentityLink(profileId:number,search="") {
  try {
    const target=await targetForLink(profileId);
    if(search.length>100) return {success:false as const,error:"Search is too long"};
    const db=createAdminClient();
    const link=await db.from("erp_user_employee_links").select("employee_id,linked_at").eq("user_profile_id",profileId).maybeSingle();
    if(link.error) throw link.error;
    let choices=db.from("employees").select("id,employee_code,full_name_en").eq("owner_company_id",target.owner_company_id??-1).is("deleted_at",null);
    choices=target.branch_id===null?choices.is("branch_id",null):choices.eq("branch_id",target.branch_id);
    if(search) choices=choices.ilike("full_name_en",`%${search}%`);
    const result=await choices.order("full_name_en").limit(50);
    if(result.error) throw result.error;
    let currentQuery = db.from("employees").select("id,employee_code,full_name_en")
      .eq("id",link.data?.employee_id??-1).eq("owner_company_id",target.owner_company_id??-1).is("deleted_at",null);
    currentQuery=target.branch_id===null?currentQuery.is("branch_id",null):currentQuery.eq("branch_id",target.branch_id);
    const current=link.data?.employee_id?await currentQuery.maybeSingle():null;
    if(current?.error) throw current.error;
    return {success:true as const,data:{current:current?.data??null,choices:result.data,linkedAt:link.data?.linked_at??null}};
  } catch {return {success:false as const,error:"Employee link is unavailable or access is denied."};}
}
export async function setEmployeeIdentityLink(profileId:number,employeeId:number|null) {
  try {
    await targetForLink(profileId);
    if(employeeId!==null && (!Number.isSafeInteger(employeeId)||employeeId<=0)) return {success:false,error:"Invalid employee"};
    const {error}=await (await createClient()).rpc("f03_set_employee_link",{profile_id:profileId,employee_id:employeeId});
    if(error) return {success:false,error:"Link not changed. Check matching company/branch and that the employee is not linked to another account."};
    revalidatePath(`/admin/users/record/${profileId}`);
    return {success:true};
  } catch {return {success:false,error:"Employee link could not be changed."};}
}
