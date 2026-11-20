import { z } from "zod";
import type { AuthContext } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { attendanceRosterPage,attendanceRosterRow,attendanceReceipt,type AttendanceRosterRow } from "@/lib/hr/attendance-workbench-contract";
import { choicePage, ownAccess, rpc, type Db } from "./hr-reads";
import { type HrCommand } from "./hr-contracts";
import { denied, HrError, normalizeReceipt, unavailable } from "./hr-shapes";

type RosterInput=Extract<HrCommand,{op:"roster"|"rosterChoices"|"rosterOpening"|"rosterReceipt"|"rosterSave"}>;
async function scopes(db:Db,company:number|null,branch:boolean,after:number,search:string){
  return choicePage(await rpc(db,"mobile_hr_roster_scopes",{p_company:company,p_branch:branch,p_after:after,p_search:search}));
}
async function authorizeScope(db:Db,company:number,branch:number|null){
  const id=branch??company;
  const choices=await scopes(db,branch===null?null:company,branch!==null,id-1,"");
  if(choices.rows[0]?.id!==id)throw denied();
}
async function withReviewState(db:Db,ctx:AuthContext,rows:AttendanceRosterRow[]){
  const ids=rows.flatMap(x=>x.id!==null&&x.approval_status==="pending"?[x.id]:[]);
  if(!ids.length)return rows.map(x=>({...x,canApprove:false}));
  const [r,linked]=await Promise.all([db.from("employee_attendance_daily_summary").select("id,employee_id,workspace_revision,created_by,updated_by,approval_status").in("id",ids).limit(25),ownAccess(db)]);
  if(r.error)throw unavailable();
  return rows.map(row=>{
    const source=r.data?.find(x=>x.id===row.id && x.employee_id===row.employee_id && String(x.workspace_revision)===row.revision);
    const actor=ctx.profile!.id;
    const canApprove=!!source && source.approval_status==="pending" && source.created_by!=null && source.created_by!==actor &&
      source.updated_by!==actor && linked?.employeeId!==row.employee_id;
    return {...row,canApprove};
  });
}
export async function roster(db:Db,ctx:AuthContext,i:RosterInput){
  switch(i.op){
    case "rosterChoices":{
      if(i.kind==="company"||i.kind==="branch")return scopes(db,i.company,i.kind==="branch",i.after,i.search);
      if(i.company===null)throw denied();
      await authorizeScope(db,i.company,i.branch);
      const name=i.kind==="workSite"||i.kind==="site"?"mobile_hr_roster_sites":"mobile_hr_roster_groups";
      return choicePage(await rpc(db,name,{p_company:i.company,p_branch:i.branch,p_date:i.date,p_kind:i.kind,p_after:i.after,p_search:i.search}));
    }
    case "roster":{
      await authorizeScope(db,i.company,i.branch);
      const data=attendanceRosterPage.parse(await rpc(db,"f12_attendance_roster",{p_date:i.date,p_company:i.company,p_branch:i.branch,
        p_site:i.site,p_team:i.team,p_shift:i.shift,p_search:i.search,p_page:i.page,p_history:i.history,p_state:i.state}));
      if(data.page!==i.page)throw unavailable();
      return {...data,rows:await withReviewState(db,ctx,data.rows),more:data.total>data.page*25};
    }
    case "rosterOpening":{
      const raw=await rpc(db,"f12_attendance_entry_opening",{p_employee:i.employeeId,p_id:i.id});
      const data=z.object({date:z.iso.date(),company:z.number().int().positive().safe(),row:attendanceRosterRow}).parse(raw);
      if(data.row.employee_id!==i.employeeId || (i.id!==null && data.row.id!==i.id))throw denied();
      const [row]=await withReviewState(db,ctx,[data.row]);
      return {...data,row};
    }
    case "rosterSave":{
      const raw=await rpc(db,"f12_save_attendance",{p_request:i.request},true);
      const result=nativeReceipt(raw,i.request.operation,i.request.employeeId,i.request.id);
      try{
        revalidatePath("/admin/hr/time/attendance");
        revalidatePath(`/admin/hr/employees/record/${i.request.employeeId}`);
      }catch{/* The committed receipt remains authoritative. */}
      return result;
    }
    case "rosterReceipt":{
      const raw=await rpc(db,"f12_reconcile_attendance",{p_operation:i.operationId});
      return nativeReceipt(raw,i.operationId);
    }
  }
}
function nativeReceipt(raw:unknown,operation:string,employee?:number,id?:number|null){
  const result=attendanceReceipt.safeParse(raw);
  if(!result.success)throw new HrError(503,"The original attendance outcome is unresolved.",true);
  const r=result.data;
  return normalizeReceipt({operationId:r.operation_id,employeeId:r.employee_id,id:r.id,revision:r.revision,replayed:r.replayed},operation,employee,id);
}
