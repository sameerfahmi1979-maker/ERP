"use client";
import {useState,type ReactNode} from "react";
import {useQueryClient} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import {useRealtimeSync} from "@/hooks/realtime/use-realtime-sync";
import {invalidateDmsDashboard} from "@/lib/query/invalidation";
import {useDmsDashboard} from "@/hooks/use-dms-dashboard";
import {dmsDashboardIdentity,type DmsDashboardUnavailable} from "@/lib/reads/dms-dashboard-schema";
import {Button} from "@/components/ui/button";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {Skeleton} from "@/components/ui/skeleton";
import {cn} from "@/lib/utils";
import {RefreshCw,FolderKanban,TrendingUp,PieChart,Bot,CalendarClock,BellRing} from "lucide-react";
import {DmsKpiCards} from "./dms-kpi-cards";
import {DmsDocumentsOverTimeChart} from "./dms-documents-over-time-chart";
import {DmsCategoryBarChart} from "./dms-category-bar-chart";
import {DmsAiPipelineChart} from "./dms-ai-pipeline-chart";
import {DmsExpiryTimelineChart} from "./dms-expiry-timeline-chart";
import {DmsInboxPanel,DmsExpiringPanel,DmsRenewalsPanel} from "./dms-action-panels";
import {DmsDashboardSectionState} from "./dms-dashboard-section-state";
type RangeDays=7|30|90;
type Props={authContext:AuthContext};
// Identity-keyed UI owns range and callbacks; no private SSR seed or old-owner
// fallback survives an account/role/scope change in the workspace.
export function DmsDashboardPageClient({authContext}:Props){return <DmsDashboardInstance key={dmsDashboardIdentity(authContext)} authContext={authContext}/>;}
function ChartCard({title,subtitle,icon,children}:{title:string;subtitle:string;icon:ReactNode;children:ReactNode}){
  return <Card className="shadow-sm"><CardHeader className="pb-2 pt-4 px-4"><div className="flex items-center gap-2">{icon}<CardTitle className="text-sm font-semibold">{title}</CardTitle></div><p className="text-[11px] text-muted-foreground pl-[22px]">{subtitle}</p></CardHeader><CardContent className="px-4 pb-4">{children}</CardContent></Card>;
}
function DmsDashboardInstance({authContext}:Props){
  const queryClient=useQueryClient(),[rangeDays,setRangeDays]=useState<RangeDays>(30),read=useDmsDashboard(authContext,{rangeDays}),s=read.data;
  useRealtimeSync({table:"dms_documents",event:"*",debounceMs:800,onEvent:()=>invalidateDmsDashboard(queryClient)});
  useRealtimeSync({table:"dms_upload_sessions",event:"*",debounceMs:600,onEvent:()=>invalidateDmsDashboard(queryClient)});
  const unavailable=(state:DmsDashboardUnavailable)=><DmsDashboardSectionState status={state.status} onRetry={read.retry}/>;
  return <div className="space-y-6">
    <div className="flex items-center justify-between flex-wrap gap-3"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><FolderKanban className="h-[18px] w-[18px]"/></span><div><h1 className="text-lg font-semibold leading-tight">DMS Dashboard</h1><p className="text-xs text-muted-foreground">Intake, processing and expiry for records you are permitted to view</p></div></div>
      <div className="flex items-center gap-2"><div className="flex rounded-lg border bg-muted/30 p-0.5 gap-0.5" aria-label="Documents added date range">{([7,30,90] as const).map(days=><button key={days} aria-pressed={rangeDays===days} onClick={()=>setRangeDays(days)} className={cn("px-3 py-1 rounded-md text-xs font-medium transition-all focus-visible:outline-2",rangeDays===days?"bg-background shadow text-foreground":"text-muted-foreground hover:text-foreground")}>{days}d</button>)}</div><Button variant="ghost" size="icon" className="h-8 w-8" onClick={read.retry} disabled={read.denied||read.isFetching} title="Refresh dashboard" aria-label="Refresh dashboard"><RefreshCw className={cn("h-3.5 w-3.5",read.isFetching&&"animate-spin")}/></Button></div>
    </div>
    {read.denied?<div role="alert" className="p-4 text-sm">Your dashboard access could not be verified. Sign in again or contact your administrator.</div>:!s?(read.isError?<div role="alert" className="p-4 text-sm">The dashboard could not be loaded. <button className="underline text-primary" onClick={read.retry}>Retry dashboard</button></div>:<div role="status" aria-label="Loading dashboard"><Skeleton className="h-32 w-full"/><Skeleton className="mt-4 h-48 w-full"/></div>):<>
      <DmsKpiCards stats={s} sparklineData={s.documents_by_day.status==="ready"?s.documents_by_day.items:undefined}/>
      {[s.total_documents,s.added_this_month,s.added_last_month,s.inbox_pending,s.expiring_30_days,s.review_queue_pending,s.storage_bytes].some(v=>v.status==="failed")&&<div role="alert" className="text-xs text-muted-foreground">Some totals could not be completely loaded. <button onClick={read.retry} className="underline text-primary">Retry dashboard</button></div>}
      {[s.storage_bytes].some(v=>v.status==="too_large")&&unavailable({status:"too_large"})}
      <div className="flex items-center gap-2 pt-1"><TrendingUp className="h-3.5 w-3.5 text-muted-foreground"/><h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Analytics</h2></div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Documents Added Over Time" subtitle={`Created since ${new Date(Date.parse(s.asOf)-rangeDays*86400000).toISOString().slice(0,10)}; permitted archived records included`} icon={<TrendingUp className="h-3.5 w-3.5 text-blue-500"/>}>{s.documents_by_day.status==="ready"?<DmsDocumentsOverTimeChart data={s.documents_by_day.items} rangeDays={rangeDays}/>:unavailable(s.documents_by_day)}</ChartCard>
        <ChartCard title="Documents by Category" subtitle="Top eight named categories across permitted non-archived records" icon={<PieChart className="h-3.5 w-3.5 text-violet-500"/>}>{s.documents_by_category.status==="ready"?(s.documents_by_category.items.length?<DmsCategoryBarChart data={s.documents_by_category.items}/>:<div className="h-48 flex items-center justify-center text-xs text-muted-foreground">No permitted categorised documents</div>):unavailable(s.documents_by_category)}</ChartCard>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="AI Pipeline Status" subtitle="Independent counts; stages can overlap. Archived records are included." icon={<Bot className="h-3.5 w-3.5 text-emerald-500"/>}>{s.ai_pipeline.status==="ready"?<DmsAiPipelineChart data={s.ai_pipeline.items}/>:unavailable(s.ai_pipeline)}</ChartCard>
        <ChartCard title="Expiry Timeline" subtitle="Permitted, non-superseded documents from today through 90 days" icon={<CalendarClock className="h-3.5 w-3.5 text-amber-500"/>}>{s.expiry_buckets.status==="ready"?<DmsExpiryTimelineChart data={s.expiry_buckets.items}/>:unavailable(s.expiry_buckets)}</ChartCard>
      </div>
      <div className="flex items-center gap-2 pt-1"><BellRing className="h-3.5 w-3.5 text-muted-foreground"/><h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Needs Your Attention</h2><span className="text-[11px] text-muted-foreground">Up to five records per panel; badges show each permitted total</span></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[220px]"><DmsInboxPanel panel={s.inbox_items} onRetry={read.retry}/><DmsExpiringPanel panel={s.expiring_items} onRetry={read.retry}/><DmsRenewalsPanel panel={s.renewal_items} onRetry={read.retry}/></div>
    </>}
  </div>;
}
