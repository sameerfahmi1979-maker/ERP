"use client";
import type {DmsDashboardUnavailable} from "@/lib/reads/dms-dashboard-schema";
export function dashboardStatusText(status:DmsDashboardUnavailable["status"]):string{
  return status==="restricted"?"Restricted":status==="too_large"?"Summary unavailable at this size":"Could not load";
}
export function DmsDashboardSectionState({status,onRetry}:{status:DmsDashboardUnavailable["status"];onRetry?:()=>void}){
  return <div className="flex min-h-32 flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground" role={status==="failed"?"alert":undefined}>
    <p>{status==="restricted"?"You do not have access to this summary.":status==="too_large"?"This summary is too large to load safely. Open the related list or contact your administrator.":"This summary could not be completely loaded."}</p>
    {status==="failed"&&onRetry&&<button className="underline text-primary focus-visible:outline-2" onClick={onRetry}>Retry dashboard</button>}
  </div>;
}
