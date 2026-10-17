import "server-only";
import {getReadAuthContext} from "./read-context";
import {canBrowseEmployees} from "@/lib/rbac/employee-access";
import { z } from "zod";
import { hasPermission, type AuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";
import { readAllPages } from "./all-pages";
import type { ERPComboboxOption } from "@/components/erp/combobox";
const schema=z.object({owner_company_id:z.number().int().positive().optional(),department_id:z.number().int().positive().optional(),selectedId:z.number().int().positive().optional()}).strict();
export async function readEmployeeFilterOptions(kind:"departments"|"designations"|"companies"|"countries",input:unknown,context?:AuthContext):Promise<{success:boolean;data?:ERPComboboxOption[];error?:string}> {
  try {
    const ctx=context??await getReadAuthContext();
    if(kind==="companies"||kind==="countries") {
      if(!canBrowseEmployees(ctx))return{success:false,error:"Permission denied"};
    } else if(!hasPermission(ctx,"common_md.view")&&!hasPermission(ctx,`common_md.${kind}.view`))return{success:false,error:"Permission denied"};
    const parsed=schema.safeParse(input??{});if(!parsed.success)return{success:false,error:"Invalid lookup parameters"};
    const p=parsed.data,db=await createClient(),column=kind==="departments"?"department":"designation";
    if(kind==="companies"||kind==="countries") {
      const company=kind==="companies";
      type Choice={id:number;name:string;code:string;status?:string;is_active?:boolean};
      const rows=await readAllPages<Choice>(async(from,to)=>{
        let q=db.from(company?"owner_companies":"countries").select(company?"id,name:legal_name_en,code:company_code,status":"id,name:name_en,code:country_code,is_active",{count:"exact"}).order(company?"legal_name_en":"name_en").order("id");
        const active=company?"status.eq.active":"is_active.eq.true";
        q=p.selectedId?q.or(`${active},id.eq.${p.selectedId}`):company?q.eq("status","active"):q.eq("is_active",true);
        const r=await q.range(from,to);return {...r,data:r.data as unknown as Choice[]|null};
      },{identity:row=>row.id,maxRows:5000});
      return {success:true,data:rows.map(row=>({value:row.id,code:row.code,label:row.name+((company?row.status==="active":row.is_active)?"":" (inactive)")}))};
    }
    type Row={id:number;name:string;code:string;is_active:boolean};
    const data=await readAllPages<Row>(async(from,to)=>{
      let q=db.from(kind).select(`id,name:${column}_name_en,code:${column}_code,is_active`,{count:"exact"}).is("deleted_at",null).order(`${column}_name_en`).order("id");
      q=p.selectedId?q.or(`is_active.eq.true,id.eq.${p.selectedId}`):q.eq("is_active",true);
      if(p.owner_company_id)q=q.eq("owner_company_id",p.owner_company_id);
      if(kind==="designations"&&p.department_id)q=q.eq("department_id",p.department_id);
      const r=await q.range(from,to);return{...r,data:r.data as unknown as Row[]|null};
    },{identity:row=>row.id,maxRows:5000});
    return{success:true,data:data.map(row=>({value:row.id,label:row.name+(row.is_active?"":" (inactive)"),code:row.code}))};
  }catch{return{success:false,error:"Choices could not be completely loaded. Please retry."};}
}
