import { z } from "zod";
import { hrSubjectPermission } from "@/server/reads/hr-subject-access";
import { denied, human, unavailable } from "./hr-shapes";
import { rpc,pageRows, type Db } from "./hr-reads";
export const rawRows=z.array(z.record(z.string(),z.unknown())).max(26);
export const pageOf=<T>(employeeId:number|null,page:number,all:T[])=>({employeeId,page,pageSize:25,...pageRows(all)});
export const cursorOf=<T extends {id:number}>(employeeId:number|null,all:T[])=>{
  const p=pageRows(all);return {employeeId,...p,nextAfterId:p.more?p.rows.at(-1)!.id:null};
};
export async function requireDomain(db:Db,employeeId:number,...codes:string[]) {
  const allowed=await Promise.all(codes.map(code=>hrSubjectPermission(db,employeeId,code)));
  if(!allowed.some(Boolean))throw denied();
}
export function checkedRows(result:{error:unknown;data:unknown}) {
  if(result.error)throw unavailable();
  return rawRows.parse(result.data);
}
export type Row = Record<string,unknown>;
export const str=(r:Row,k:string)=>z.string().nullable().parse(r[k]??null);
export const rid=(r:Row,k="id")=>z.number().int().safe().positive().parse(r[k]);
export function fields(r:Row,keys:readonly string[]) {
  return keys.map(key=>({key,label:human(key),value:r[key]==null?null:String(r[key])}));
}
export function related(r:Row,key:string,column:string) {
  const relation=r[key];return relation && typeof relation==="object" && column in relation ? str(relation as Row,column) : null;
}

export async function recordDetails(db:Db,employee:number,kind:string,id:number,caseId:number|null=null) {
  return z.strictObject({
    fields:z.array(z.strictObject({key:z.string(),label:z.string(),value:z.string().nullable()})),
    evidence:z.strictObject({documentId:z.number().int().positive(),documentVersionId:z.number().int().positive()}).nullable(),
    actorLabel:z.string().nullable(),
  }).parse(await rpc(db,"mobile_hr_v5_detail",{p_employee:employee,p_kind:kind,p_id:id,p_case:caseId}));
}
