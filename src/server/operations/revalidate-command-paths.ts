import "server-only";
import { revalidatePath } from "next/cache";
import type { OperationsRefreshResult, OperationsRefreshTarget } from "@/lib/operations/command-result";

const workshopJobWork = "/modules/workshop/job-work";
const workshop = "/modules/workshop";
const recovery = "/admin/hr/operations/recoveries";
const labour = "/admin/hr/operations/workshop-labour";
const payroll = "/admin/hr/payroll/workshop";
const supply = ["/modules/inventory", "/modules/procurement", "/modules/fleet/fuel"];

type RefreshPath = string | [string, "page"];
function jobDetail(job: number | null): RefreshPath {
  return job ? `${workshopJobWork}/${job}` : [`${workshopJobWork}/[id]`, "page"];
}

function pathsFor(target: OperationsRefreshTarget): RefreshPath[] {
  switch (target.kind) {
    case "supply":
      return target.job === undefined ? supply : [...supply, jobDetail(target.job)];
    case "workshop":
      return [workshop, "/admin/hr/operations/workshop-referrals", `/modules/fleet/${target.asset}`,
        ...(target.job ? [workshopJobWork, jobDetail(target.job)] : [])];
    case "job-work":
      return [workshop, labour, payroll, workshopJobWork, jobDetail(target.job)];
    case "recovery":
      return [recovery];
  }
}

export const operationsRefreshAdmission = {
  supply: [...supply, workshopJobWork],
  workshop: [workshop],
  "job-work": [workshopJobWork, labour, payroll],
  recovery: [recovery],
};

export function refreshOperationsPaths(target: OperationsRefreshTarget): OperationsRefreshResult {
  let failed = false;
  for (const path of pathsFor(target)) {
    try {
      if (typeof path === "string") revalidatePath(path);
      else revalidatePath(...path);
    } catch {
      failed = true;
    }
  }
  return failed ? { refreshFailed: true, refreshTarget: target } : { refreshFailed: false };
}

