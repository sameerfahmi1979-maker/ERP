import { z } from "zod";
import { canUseApplication, type AuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";
import { hrCommand, id, type HrCommand } from "./hr-contracts";
import { type Db, capabilities, employeeContext, employees, evidencePage, home, ownAccess, ownDomainRead, leaveRead, pageRows, profile, renewalRead, rpc, staffCapabilities, timeRead } from "./hr-reads";
import { roster } from "./hr-roster";
import { conflict, dbRevision, denied, field, formatProposal, HrError, human, normalizeReceipt, proposalRow } from "./hr-shapes";

type Input<K extends HrCommand["op"]>=Extract<HrCommand,{op:K}>;
const command=(db:Db,action:string,data:Record<string,unknown>,mutating=false)=>rpc(db,"mobile_hr_command_v1",{p_action:action,p_data:data},mutating);
const staffRow=z.object({id,employeeId:id,kind:z.enum(["approval","leave"]),employeeLabel:z.string().nullable(),revision:dbRevision,label:z.string(),status:z.string(),canDecide:z.boolean(),startDate:z.string().nullable(),endDate:z.string().nullable(),
  leaveType:z.string().nullable(),totalDays:z.number().nullable(),certificateStatus:z.string().nullable(),certificateReference:z.string().nullable()});
async function staffInbox(db:Db,i:Input<"inbox"|"opening">){
  if(i.kind==="proposal")throw denied();
  const raw=await rpc(db,"mobile_hr_staff_inbox",{p_kind:i.kind,p_after:i.op==="inbox"?i.after:0,p_employee:i.op==="opening"?i.employeeId:null,p_id:i.op==="opening"?i.id:null});
  const all=z.array(staffRow).max(26).parse(raw).map(r=>({...r,reference:(r.kind==="leave"?"Leave request #":"HR approval #")+r.id}));
  if(i.op==="opening"){
    const r=all[0];
    if(!r || r.id!==i.id || r.kind!==i.kind || r.employeeId!==i.employeeId || r.revision!==i.revision)throw conflict();
    return {...r,fields:[field("Subject",r.label),...(i.kind==="leave"?[field("Leave type",r.leaveType),field("Charged days",r.totalDays),field("Start date",r.startDate),field("End date",r.endDate),
      ...(r.certificateStatus?[field("Certificate integrity",r.certificateStatus)]:[]),...(r.certificateReference?[field("Certificate reference",r.certificateReference)]:[])]:[])]};
  }
  const {rows,more}=pageRows(all);
  return {rows,more,nextAfterId:more?rows.at(-1)!.id:null};
}
const listEntry=(r:z.infer<typeof proposalRow>,employeeLabel:string|null)=>({employeeLabel,reference:"HR proposal #"+r.id,id:r.id,employeeId:r.employeeId,kind:"proposal" as const,label:human(r.kind),status:r.status,revision:r.revision});
async function subjectLabels(db:Db,ids:number[]){
  const distinct=[...new Set(ids)];
  const labels=new Map<number,string>();
  if(!distinct.length)return labels;
  const {data,error}=await db.from("employees").select("id,employee_code,full_name_en").in("id",distinct).is("deleted_at",null).limit(distinct.length);
  if(error)throw new HrError(503,"The employee labels could not be verified.");
  for(const s of z.array(z.object({id,employee_code:z.string(),full_name_en:z.string()})).max(25).parse(data))labels.set(s.id,s.employee_code+" — "+s.full_name_en);
  return labels;
}
async function requests(db:Db,i:Input<"inbox"|"opening"|"requests">){
  if(i.op!=="requests" && i.kind!=="proposal")return staffInbox(db,i);
  if(i.op==="opening"){
    const r=proposalRow.parse(await command(db,"request.open",{id:i.id}));
    if(r.id!==i.id||r.employeeId!==i.employeeId)throw denied();
    if(r.revision!==i.revision)throw conflict();
    const labels=await subjectLabels(db,[r.employeeId]),entry=listEntry(r,labels.get(r.employeeId)??null);
    return {...entry,canDecide:r.canDecide,fields:[field("Employee",entry.employeeLabel??"Employee #"+r.employeeId),field("Request",entry.reference),field("Requested",r.createdAt),...formatProposal(r.kind,r.proposal),...(r.decisionReason?[field("Decision reason",r.decisionReason)]:[])]};
  }
  const mode=i.op==="inbox"?"review":i.scope==="own"?"mine":"team";
  const raw=await command(db,"request.list",{mode,afterId:i.after,limit:25});
  const result=z.object({items:z.array(proposalRow).max(25),nextAfterId:id.nullable()}).parse(raw);
  const labels=await subjectLabels(db,result.items.map(r=>r.employeeId));
  return {rows:result.items.map(r=>listEntry(r,labels.get(r.employeeId)??null)),more:result.nextAfterId!==null,nextAfterId:result.nextAfterId};
}
type Mutation=Input<"profileCorrection"|"timeCorrection"|"renewalSubmit"|"leaveSubmit"|"leaveCancel"|"decision"|"rosterApprove">;
async function mutate(db:Db,i:Mutation){
  const base={employeeId:i.employeeId,operationId:i.operationId};
  let raw:unknown;
  let expectedId:number|undefined;
  switch(i.op){
    case "profileCorrection":
      raw=await command(db,"request.submit",{...base,kind:"profile-correction",proposal:{sourceRevision:i.revision,changes:i.changes}},true);break;
    case "timeCorrection":
      raw=await command(db,"request.submit",{...base,kind:"attendance-correction",proposal:{date:i.date,reason:i.reason,...(i.id!==null?{summaryId:i.id,sourceRevision:i.revision}:{})}},true);break;
    case "renewalSubmit":
      raw=await command(db,"request.submit",{...base,kind:"compliance-renewal",proposal:{sourceId:i.id,sourceRevision:i.revision,sourceKind:i.kind,reason:i.reason,
        ...(i.documentId!==null?{documentId:i.documentId,documentVersionId:i.documentVersionId}:{})}},true);break;
    case "leaveSubmit":
      raw=await command(db,"leave.submit",{...base,leaveTypeId:i.leaveTypeId,startDate:i.startDate,endDate:i.endDate,reason:i.reason,
        ...(i.documentId!==null?{documentId:i.documentId,documentVersionId:i.documentVersionId}:{})},true);break;
    case "leaveCancel":case "decision":case "rosterApprove":{
      expectedId=i.id;
      const data={...base,id:i.id,revision:i.revision};
      if(i.op==="decision")raw=await command(db,i.kind==="proposal"?"request.decide":i.kind==="approval"?"approval.decide":"leave.decide",{...data,decision:i.decision,...(i.reason?{reason:i.reason}:{})},true);
      else if(i.op==="rosterApprove")raw=await command(db,"attendance.approve",data,true);
      else raw=await command(db,"leave.cancel",{...data,reason:i.reason},true);
      break;
    }
  }
  return normalizeReceipt(raw,i.operationId,i.employeeId,expectedId);
}
export function dispatchHr(raw:Input<"profile">,ctx:AuthContext):ReturnType<typeof profile>;
export function dispatchHr(raw:HrCommand,ctx:AuthContext):Promise<unknown>;
export async function dispatchHr(raw:HrCommand,ctx:AuthContext){
  if(!canUseApplication(ctx))throw denied();
  const i=hrCommand.parse(raw);
  const db=await createClient();
  switch(i.op){
    case "home":return home(db,ctx);
    case "profile":return profile(db,ctx,i.employeeId);
    case "employees":return employees(db,ctx,i);
    case "receipt":{
      const data=await command(db,"receipt",{operationId:i.operationId});
      if(!data)throw new HrError(503,"No current original receipt could be confirmed.",true);
      return normalizeReceipt(data,i.operationId);
    }
    case "requests":case "opening":case "inbox":{
      if(i.op==="inbox" || (i.op==="requests" && i.scope==="team")){
        const staff=await staffCapabilities(db);
        const allowed=i.op==="requests"?staff.requestsTeam:i.kind==="proposal"?staff.approvalsProposal:i.kind==="leave"?staff.approvalsLeave:staff.approvalsGeneral;
        if(!allowed)throw denied();
      } else if(i.op==="requests" && !(await ownAccess(db))?.mine)throw denied();
      return requests(db,i);
    }
    case "roster":case "rosterChoices":case "rosterOpening":case "rosterSave":case "rosterReceipt":return roster(db,ctx,i);
    case "decision":case "rosterApprove":case "profileCorrection":case "timeCorrection":case "renewalSubmit":case "leaveSubmit":case "leaveCancel":return mutate(db,i);
    case "leaveRequests":case "leaveOptions":case "leaveBalances":case "time":case "renewals":case "evidence":{
      const own=await ownAccess(db);
      if(own?.employeeId===i.employeeId && !own.profile)return ownDomainRead(db,own,i);
      const a=await employeeContext(db,ctx,i.employeeId,own?.employeeId??null);
      switch(i.op){
        case "leaveRequests":case "leaveOptions":case "leaveBalances":return leaveRead(db,a,i);
        case "time":return timeRead(db,a,i);
        case "renewals":return renewalRead(db,a,i);
        case "evidence":{
          const allowed=capabilities(ctx,a);
          if(!allowed.evidence || i.purpose==="leave" && !allowed.leaveCertificate)throw denied();
          return evidencePage(db,i);
        }
      }
    }
    default:return (await import("./hr-expanded")).expandedHr(db,ctx,i);
  }
}
