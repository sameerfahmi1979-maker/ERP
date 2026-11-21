import { z } from "zod";
import { rpc, type Db } from "./hr-reads";
import { dbRevision, denied, human } from "./hr-shapes";
import { checkedRows, fields, pageOf, recordDetails, requireDomain, rid, str, type Row } from "./hr-page";
import type { ExpandedInput } from "./hr-services-contracts";

const records = {
  assignments:{table:"employee_assignments",title:"assignment_type",status:"assignment_status",start:"effective_from",end:"effective_to",extra:[],source:null},
  requirements:{table:"employee_role_requirements",title:null,status:"status",start:null,end:"expiry_date",extra:["is_required","is_met"],source:null},
  readiness:{table:"employee_site_readiness",title:null,status:"readiness_status",start:null,end:null,extra:["checked_at"],source:null},
  blocks:{table:"employee_operational_blocks",title:null,status:"block_status",start:"effective_from",end:"effective_to",extra:[],source:null},
  assets:{table:"employee_assets",title:"asset_description",status:"status",start:"issued_date",end:"return_due_date",extra:["asset_type","asset_reference","returned_date","condition_on_issue","condition_on_return"],source:"asset"},
  ppe:{table:"employee_ppe_issues",title:"ppe_item",status:"status",start:"issued_date",end:"expiry_or_replacement_date",extra:["quantity","standard_or_size","returned_date"],source:"ppe"},
  accommodation:{table:"employee_accommodation_records",title:"accommodation_location",status:"status",start:"assigned_from",end:"assigned_to",extra:["accommodation_type","room_or_bed_no"],source:"accommodation"},
} as const;
type Kind=keyof typeof records;
async function read(db:Db,employeeId:number,kind:Kind,page:number,id?:number,date?:string) {
  const c=records[kind];
  const columns=[...new Set(["id","workspace_revision",c.title,c.status,c.start,c.end,...c.extra].filter(Boolean))];
  const q=db.from(c.table).select(columns.join(",")).eq("employee_id",employeeId).is("deleted_at",null);
  if(id)q.eq("id",id);
  if(date && c.start)q.lte(c.start,date);
  if(date && c.end)q.or(`${c.end}.is.null,${c.end}.gte.${date}`);
  if(date && kind==="readiness")q.lt("checked_at",new Date(Date.parse(date+"T20:00:00Z")).toISOString());
  if(date && kind==="blocks")q.eq("block_status","active");
  if(date && kind==="assignments")q.eq("assignment_status","active");
  return checkedRows(await q.order("id",{ascending:false}).range((page-1)*25,(page-1)*25+25));
}
function shape(r:Row,kind:Kind) {
  const c=records[kind],id=rid(r),revision=dbRevision.parse(r.workspace_revision);
  return {id,revision,kind,title:c.title?str(r,c.title)??human(kind):human(kind),status:z.string().parse(r[c.status]),
    startDate:c.start?str(r,c.start):null,endDate:c.end?str(r,c.end):null,checkedAt:str(r,"checked_at"),source:c.source?{kind:c.source,id,revision}:null};
}
export async function workRead(db:Db,i:ExpandedInput<"work"|"operationRecords"|"operationDetail"|"teamReadiness">) {
  if(i.op==="teamReadiness"){
    const raw=await rpc(db,"mobile_hr_v5_team_readiness",{p_date:i.date,p_search:i.search,p_company:i.companyId,p_branch:i.branchId,p_site:i.siteId,p_page:i.page});
    const row=z.object({employeeId:z.number(),employeeCode:z.string(),name:z.string(),company:z.string().nullable(),branch:z.string().nullable(),site:z.string().nullable(),status:z.string(),checkedAt:z.string().nullable(),hasOperationalBlock:z.boolean()});
    return pageOf(null,i.page,z.array(row).max(26).parse(raw));
  }
  await requireDomain(db,i.employeeId,"hr.assignments.view");
  if(i.op==="work"){
    const get=async(kind:Kind)=>pageOf(i.employeeId,1,(await read(db,i.employeeId,kind,1,undefined,i.date)).map(r=>shape(r,kind)));
    const [a,r,b]=await Promise.all([get("assignments"),get("readiness"),get("blocks")]);
    return {employeeId:i.employeeId,date:i.date,assignments:a.rows,readiness:r.rows,blocks:b.rows,more:{assignments:a.more,readiness:r.more,blocks:b.more}};
  }
  if(i.op==="operationRecords")return pageOf(i.employeeId,i.page,(await read(db,i.employeeId,i.kind,i.page)).map(r=>shape(r,i.kind)));
  const [r]=await read(db,i.employeeId,i.kind,1,i.id);
  if(!r)throw denied();
  const detail=await recordDetails(db,i.employeeId,i.kind,i.id);
  return {employeeId:i.employeeId,kind:i.kind,row:shape(r,i.kind),fields:[...fields(r,records[i.kind].extra),...detail.fields],evidence:detail.evidence};
}
