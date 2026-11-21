import { z } from "zod";
import { rpc, type Db } from "./hr-reads";
import { dbRevision, denied } from "./hr-shapes";
import { checkedRows,cursorOf,fields,pageOf,rawRows,related,recordDetails,requireDomain,rid,str,type Row } from "./hr-page";
import { subjectPhoto } from "./hr-photo";
import type { ExpandedInput } from "./hr-services-contracts";
type Input=ExpandedInput<"proProcess"|"proProcesses"|"dependents"|"dependent"|"onboarding"|"onboardingTask"|"offboarding"|"clearance"|"clearanceHistory">;
export async function lifecycle(db:Db,i:Input) {
  const employeeId=i.employeeId,page="page" in i?i.page:1,start=(page-1)*25;
  const open=(r:Row,kind:string)=>({kind,id:rid(r),revision:dbRevision.parse(r.workspace_revision??r.revision)});
  if(i.op==="onboarding"||i.op==="onboardingTask") {
    const all=rawRows.parse(await rpc(db,"mobile_hr_v5_tasks",{p_employee:employeeId,p_id:i.op==="onboardingTask"?i.id:null,p_page:page}));
    if(i.op==="onboarding")return pageOf(employeeId,page,all.map(r=>({id:rid(r),revision:dbRevision.parse(r.revision),title:r.title,category:r.category,status:r.status,dueDate:r.dueDate,required:r.required,evidenceRequired:r.evidenceRequired,assignedTo:r.assignedTo})));
    const [r]=all;if(!r||r.id!==i.id)throw denied();
    return {employeeId,source:open(r,"onboarding-task"),candidateId:r.candidateId,title:r.title,status:r.status,completionCriteria:r.completionCriteria??"",
      prerequisiteTaskId:r.prerequisiteTaskId,fields:fields(r,["category","required","dueDate","assignedTo"]),evidence:r.evidence,canSubmitEvidence:r.canSubmitEvidence};
  }
  if(i.op==="dependents"||i.op==="dependent"){
    await requireDomain(db,employeeId,"hr.compliance.view");
    const q=db.from("employee_dependents").select("id,workspace_revision,dependent_name_en,dependent_name_ar,date_of_birth,is_active,passport_expiry,emirates_id_expiry,residence_visa_expiry,sponsored_by,relationship:hr_relationship_types(name_en),nationality:countries(nationality_en)")
      .eq("employee_id",employeeId).is("deleted_at",null);
    if(i.op==="dependent")q.eq("id",i.id);
    const all=checkedRows(await q.order("id").range(start,start+25));
    if(i.op==="dependents") {
      const p=pageOf(employeeId,page,all);
      return {...p,rows:await Promise.all(p.rows.map(async r=>({id:rid(r),revision:dbRevision.parse(r.workspace_revision),name:r.dependent_name_en,
        relationship:related(r,"relationship","name_en"),dateOfBirth:r.date_of_birth,nationality:related(r,"nationality","nationality_en"),active:r.is_active,
        passportExpiry:r.passport_expiry,emiratesIdExpiry:r.emirates_id_expiry,visaExpiry:r.residence_visa_expiry,photo:await subjectPhoto(employeeId,rid(r))})))};
    }
    const [r]=all;if(!r)throw denied();
    const medical=await rpc(db,"f11_dependent_medical",{p_employee:employeeId,p_dependent:i.id,p_revision:r.workspace_revision});
    return {employeeId,source:open(r,"dependent"),name:r.dependent_name_en,fields:fields({...r,relationship:related(r,"relationship","name_en"),nationality:related(r,"nationality","nationality_en")},
      ["dependent_name_ar","relationship","date_of_birth","nationality","passport_expiry","emirates_id_expiry","residence_visa_expiry","sponsored_by","is_active"]),
      medical:medical?fields(z.record(z.string(),z.unknown()).parse(medical),["medical_insurance_provider","medical_insurance_policy","medical_insurance_card","medical_insurance_expiry"]):null,photo:await subjectPhoto(employeeId,i.id)};
  }
  if(i.op==="proProcess"||i.op==="proProcesses"){
    await requireDomain(db,employeeId,"hr.actions.view");
    const q=db.from("employee_pro_processes").select("id,workspace_revision,process_title,process_status,priority,request_date,target_date,submitted_date,completed_date,assigned:user_profiles!employee_pro_processes_assigned_to_fkey(display_name)")
      .eq("employee_id",employeeId).is("deleted_at",null);
    if(i.op==="proProcess")q.eq("id",i.id);
    const all=checkedRows(await q.order("id").range(start,start+25)).map(r=>({id:rid(r),revision:dbRevision.parse(r.workspace_revision),title:r.process_title,status:r.process_status,priority:r.priority,
      requestDate:r.request_date,targetDate:r.target_date,submittedDate:r.submitted_date,completedDate:r.completed_date,assignedTo:related(r,"assigned","display_name")}));
    if(i.op==="proProcesses")return pageOf(employeeId,page,all);
    const [r]=all;if(!r)throw denied();
    return {...r,employeeId,source:open(r,"pro-process"),fields:fields(r,["priority","requestDate","targetDate","submittedDate","completedDate","assignedTo"]),evidence:(await recordDetails(db,employeeId,"pro-process",i.id)).evidence};
  }
  await requireDomain(db,employeeId,"hr.eos.view","hr.actions.view");
  if(i.op==="offboarding"){
    const all=checkedRows(await db.from("employee_eos_cases").select("id,workspace_revision,eos_type,case_status,last_working_date,notice_date,clearance_completed,final_settlement_status")
      .eq("employee_id",employeeId).is("deleted_at",null).order("id").range(start,start+25));
    return pageOf(employeeId,page,all.map(r=>({id:rid(r),revision:dbRevision.parse(r.workspace_revision),type:r.eos_type,status:r.case_status,lastWorkingDate:r.last_working_date,noticeDate:r.notice_date,clearanceCompleted:r.clearance_completed,settlementStatus:r.final_settlement_status})));
  }
  const parent=checkedRows(await db.from("employee_eos_cases").select("id").eq("employee_id",employeeId).eq("id",i.caseId).is("deleted_at",null).limit(1));
  if(!parent.length)throw denied();
  if(i.op==="clearance"){
    const rows=checkedRows(await db.from("employee_clearance_items").select("id,workspace_revision,clearance_area,item_title,item_status")
      .eq("employee_id",employeeId).eq("eos_case_id",i.caseId).is("deleted_at",null).order("id").range(start,start+25));
    const p=pageOf(employeeId,page,rows);
    return {...p,rows:await Promise.all(p.rows.map(async r=>({id:rid(r),revision:dbRevision.parse(r.workspace_revision),caseId:i.caseId,area:r.clearance_area,title:r.item_title,status:r.item_status,evidence:(await recordDetails(db,employeeId,"clearance",rid(r),i.caseId)).evidence})))};
  }
  const rows=rawRows.parse(await rpc(db,"f12_clearance_history",{p_employee:employeeId,p_case:i.caseId,p_item:i.id,p_after:i.after}));
  return cursorOf(employeeId,await Promise.all(rows.map(async r=>{
    const details=await recordDetails(db,employeeId,"clearanceHistory",rid(r),i.caseId);
    return {id:rid(r),revision:dbRevision.parse(r.revision),action:r.action,actorLabel:details.actorLabel,at:str(r,"created_at"),status:r.status,evidence:details.evidence};
  })));
}
