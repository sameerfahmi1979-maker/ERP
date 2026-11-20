import { z } from "zod";
import type { AuthContext } from "@/lib/rbac/check";
import { canUseHrChild } from "@/lib/hr/child-authority";
import { type AttendanceRosterRow } from "@/lib/hr/attendance-workbench-contract";
import { readAttendanceChoices,readTimesheetSites,readAttendanceRoster,readAttendanceEntryOpening,saveAttendanceRow,reconcileAttendanceRow } from "@/server/actions/hr/attendance-workbench";
import { choicePage, linkedEmployee, rpc, type Db } from "./hr-reads";
import { type HrCommand } from "./hr-contracts";
import { conflict, denied, HrError, normalizeReceipt, unavailable } from "./hr-shapes";

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
  const [r,linked]=await Promise.all([db.from("employee_attendance_daily_summary").select("id,employee_id,workspace_revision,created_by,updated_by,approval_status").in("id",ids).limit(25),linkedEmployee(db,ctx)]);
  if(r.error)throw unavailable();
  return rows.map(row=>{
    const source=r.data?.find(x=>x.id===row.id && x.employee_id===row.employee_id && String(x.workspace_revision)===row.revision);
    const actor=ctx.profile!.id;
    const canApprove=!!source && source.approval_status==="pending" && source.created_by!=null && source.created_by!==actor &&
      source.updated_by!==actor && linked!==row.employee_id;
    return {...row,canApprove};
  });
}
export async function roster(db:Db,ctx:AuthContext,i:RosterInput){
  if(!canUseHrChild(ctx,"attendance-summary"))throw denied();
  switch(i.op){
    case "rosterChoices":{
      if(i.kind==="company"||i.kind==="branch")return scopes(db,i.company,i.kind==="branch",i.after,i.search);
      if(i.company===null)throw denied();
      await authorizeScope(db,i.company,i.branch);
      const r=i.kind==="workSite"?await readTimesheetSites({company:i.company,date:i.date,search:i.search,after:i.after}):
        await readAttendanceChoices({kind:i.kind,company:i.company,branch:i.branch,date:i.date,search:i.search,after:i.after});
      if(!r.success)throw "denied" in r && r.denied?denied():unavailable();
      return {rows:r.rows,more:r.hasMore};
    }
    case "roster":{
      await authorizeScope(db,i.company,i.branch);
      const {op,...input}=i;void op;
      const r=await readAttendanceRoster(input);
      if(!r.success)throw r.denied?denied():unavailable();
      return {...r.data,rows:await withReviewState(db,ctx,r.data.rows),more:r.data.total>r.data.page*25};
    }
    case "rosterOpening":{
      const r=await readAttendanceEntryOpening(i.employeeId,i.id);
      if(!r.success)throw r.denied?denied():unavailable();
      const [row]=await withReviewState(db,ctx,[r.data.row]);
      return {...r.data,row};
    }
    case "rosterSave":{
      const r=await saveAttendanceRow(i.request);
      if(!r.success){
        if(r.denied)throw denied();
        if(r.conflict)throw conflict();
        throw new HrError(r.uncertain?503:422,r.error,r.uncertain);
      }
      return nativeReceipt(r.data,i.request.operation,i.request.employeeId,i.request.id);
    }
    case "rosterReceipt":{
      const r=await reconcileAttendanceRow(i.operationId);
      if(!r.success)throw r.denied?denied():new HrError(503,"The original attendance outcome is unresolved.",true);
      return nativeReceipt(r.data,i.operationId);
    }
  }
}
function nativeReceipt(raw:unknown,operation:string,employee?:number,id?:number|null){
  const r=z.object({operation_id:z.uuid(),employee_id:z.number(),id:z.number(),revision:z.string(),replayed:z.boolean()}).parse(raw);
  return normalizeReceipt({operationId:r.operation_id,employeeId:r.employee_id,id:r.id,revision:r.revision,replayed:r.replayed},operation,employee,id);
}