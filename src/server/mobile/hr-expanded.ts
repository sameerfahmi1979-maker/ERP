import type { AuthContext } from "@/lib/rbac/check";
import type { ExpandedCommand } from "./hr-services-contracts";
import type { Db } from "./hr-reads";
import { directory, employeeRecord } from "./hr-directory";
import { lifecycle } from "./hr-lifecycle";
import { workRead } from "./hr-work";
import { teamCalendar } from "./hr-calendar";
import { issuedDocuments } from "./hr-wallet";
import { serviceReadWrite } from "./hr-services";
import { fulfilService } from "./hr-fulfilment";

export function expandedHr(db:Db,ctx:AuthContext,i:ExpandedCommand) {
  switch(i.op){
    case "directory":case "directoryChoices":return directory(db,i);
    case "employeeRecord":return employeeRecord(db,ctx,i.employeeId);
    case "work":case "operationRecords":case "operationDetail":case "teamReadiness":return workRead(db,i);
    case "dependents":case "dependent":case "onboarding":case "onboardingTask":case "offboarding":case "clearance":case "clearanceHistory":
    case "proProcesses":case "proProcess":return lifecycle(db,i);
    case "issuedDocuments":return issuedDocuments(db,i);
    case "teamCalendar":return teamCalendar(db,i);
    case "serviceFulfil":return fulfilService(db,i);
    default:return serviceReadWrite(db,i);
  }
}
