import "server-only";
import {getReadAuthContext} from "./read-context";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasPermission,type AuthContext } from "@/lib/rbac/check";
import { literalLike } from "@/lib/reads/search";
import { readAllPages } from "./all-pages";
import type {ActionResult,DepartmentRow} from "@/server/actions/common-master-data/departments";
export type DepartmentListRow=Pick<DepartmentRow,"id"|"department_code"|"department_name_en"|"department_name_ar"|"owner_company_id"|"branch_id"|"is_active"|"workspace_revision"|"owner_company">;
const schema=z.object({owner_company_id:z.number().int().positive().optional(),branch_id:z.number().int().positive().optional(),is_active:z.boolean().optional(),search:z.string().max(200).optional()}).strict();
export async function readDepartments(input:unknown={},context?:AuthContext):Promise<ActionResult<DepartmentListRow[]>> {
  try {
    const ctx=context??await getReadAuthContext();if(!hasPermission(ctx,"common_md.view")&&!hasPermission(ctx,"common_md.departments.view"))return{success:false,error:"Permission denied"};
    const parsed=schema.safeParse(input??{});if(!parsed.success)return{success:false,error:"Invalid department search"};
    const filters=parsed.data,db=await createClient();
    const rows=await readAllPages<DepartmentListRow>(async(from,to)=>{
      let q=db.from("departments").select("id,department_code,department_name_en,department_name_ar,owner_company_id,branch_id,is_active,workspace_revision,owner_company:owner_companies(id,legal_name_en,company_code)",{count:"exact"}).is("deleted_at",null).order("department_name_en").order("id");
      if(filters.owner_company_id)q=q.eq("owner_company_id",filters.owner_company_id);
      if(filters.branch_id)q=q.eq("branch_id",filters.branch_id);
      if(filters.is_active!==undefined)q=q.eq("is_active",filters.is_active);
      if(filters.search?.trim())q=q.ilike("department_name_en",literalLike(filters.search.trim()));
      const r=await q.range(from,to);return {...r,data:r.data as DepartmentListRow[]|null};
    },{identity:row=>row.id,maxRows:1000});
    return{success:true,data:rows};
  }catch{return{success:false,error:"Departments could not be completely loaded. Please retry."};}
}
