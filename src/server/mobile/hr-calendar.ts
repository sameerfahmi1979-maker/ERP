import { z } from "zod";
import { rpc, type Db } from "./hr-reads";
import { pageOf } from "./hr-page";
import type { ExpandedInput } from "./hr-services-contracts";
import { id } from "./hr-contracts";
const row=z.strictObject({id,employeeId:id,employeeLabel:z.string(),startDate:z.iso.date(),endDate:z.iso.date(),status:z.string(),label:z.string()});
export async function teamCalendar(db:Db,i:ExpandedInput<"teamCalendar">) {
  const rows=await rpc(db,"mobile_hr_v5_calendar",{p_from:i.from,p_to:i.to,p_page:i.page,p_company:i.companyId,p_branch:i.branchId,p_employee:i.employeeId,p_search:i.search});
  return pageOf(i.employeeId,i.page,z.array(row).max(26).parse(rows));
}
