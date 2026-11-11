"use client";
import {useRef,useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useQueryClient} from '@tanstack/react-query';
import {UsersRound,RefreshCw,ArrowUpRight,ClipboardList,CalendarClock,ShieldCheck,Briefcase,Landmark,Building2} from 'lucide-react';
import type {AuthContext} from '@/lib/rbac/check';
import {hasPermission} from '@/lib/rbac/scope';
import {hrReadIdentity} from '@/lib/reads/hr-read-identity';
import {hrDashboardCalendar} from '@/lib/hr/dashboard-metrics';
import {DASHBOARD_DEFINITIONS,DASHBOARD_GROUPS,DASHBOARD_HERO,dashboardMetricLabel,type DashboardScope,type DashboardMetric,type DashboardRow} from '@/lib/hr/dashboard-workspace';
import {useHrDashboardWorkspace} from '@/hooks/use-hr-dashboard-workspace';
import {useRealtimeSync} from '@/hooks/realtime/use-realtime-sync';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Card,CardHeader,CardTitle,CardContent} from '@/components/ui/card';
import {DmsCategoryBarChart} from '@/features/dms/dashboard/dms-category-bar-chart';

export function HrDashboardWorkspace({authContext}:{authContext:AuthContext}) {
 return <Dashboard key={hrReadIdentity(authContext)} auth={authContext}/>;
}
const fieldClass='h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground [color-scheme:light] dark:[color-scheme:dark]';
function Records({items}:{items:DashboardRow[]}) {
 return <ul className="divide-y">{items.map(row=><li key={row.key} className="py-3"><Link href={row.href} className="group flex min-w-0 items-start justify-between gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-primary"><span className="min-w-0"><span className="block break-words text-sm font-medium group-hover:underline">{row.label}</span><span className="block break-words text-xs text-muted-foreground">{row.reference} · {row.detail}{row.date?` · ${row.date.slice(0,10)}`:''}</span></span><ArrowUpRight aria-hidden className="h-4 w-4 shrink-0"/></Link></li>)}</ul>;
}
function MetricState({metric}:{metric?:DashboardMetric}) {
 return <p role="status" className="py-3 text-sm text-muted-foreground">{metric?.status==='ready'?'No matching records.':metric?.reason??dashboardMetricLabel(metric)}</p>;
}
function Dashboard({auth}:{auth:AuthContext}) {
 const path=usePathname(),active=path==='/admin/hr/dashboard';
 const [scope,setScope]=useState<DashboardScope>({date:hrDashboardCalendar().today,expiryDays:'30'});
 const [draft,setDraft]=useState(scope),[selected,setSelected]=useState<string|null>(null),[page,setPage]=useState(1),[chart,setChart]=useState('department');
 const panel=useRef<HTMLElement>(null),qc=useQueryClient();
 const read=useHrDashboardWorkspace(auth,{mode:'overview',scope},active);
 const choices=useHrDashboardWorkspace(auth,{mode:'options',scope:{}},active);
 const detail=useHrDashboardWorkspace(auth,{mode:'records',scope,metric:selected??'workforce',page},active&&selected!==null);
 const refresh=()=>{void qc.invalidateQueries({queryKey:['hr','dashboard','workspace',hrReadIdentity(auth)]});};
 const realtime={enabled:active&&!read.denied,debounceMs:1000,onEvent:refresh};
 useRealtimeSync({...realtime,table:'employees'});
 useRealtimeSync({...realtime,table:'employee_attendance_daily_summary'});
 useRealtimeSync({...realtime,table:'employee_leave_requests'});
 useRealtimeSync({...realtime,table:'employee_identity_documents'});
 const open=(key:string)=>{setSelected(key);setPage(1);requestAnimationFrame(()=>{panel.current?.focus();panel.current?.scrollIntoView({block:'nearest',behavior:'instant'});});};
 const apply=()=>{setScope(draft);setSelected(null);setPage(1);};
 const metrics=read.data?.metrics;
 const definition=DASHBOARD_DEFINITIONS.find(d=>d.key===selected);
 const detailMetric=selected?detail.data?.metrics[selected]:undefined;
 const permission=(code:string)=>hasPermission(auth,`hr.${code}`);
 const denied=read.denied||choices.denied||selected!==null&&detail.denied;
 if(denied)return <div role="alert">Your HR dashboard access could not be verified. Sign in again or contact your administrator.</div>;
 const chartData=read.data?.charts?.find(c=>c.key===chart);
 const shortcut=[['employees.create','Add employee','/admin/hr/employees/record/new'],['attendance.view','Daily attendance','/admin/hr/time/attendance'],['leave.view','Leave requests','/admin/hr/time/leave'],['employees.view','Document browser','/admin/hr/document-browser'],['recruitment.view','Recruitment','/admin/hr/recruitment/candidates']];
 const panelKeys=['expired','leave_pending','approvals','onboarding','payroll_holds','pro'];
 return <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6">
  <header className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="rounded-lg bg-primary/10 p-2 text-primary"><UsersRound className="h-5 w-5"/></span><div><h1 className="text-lg font-semibold">HR Dashboard</h1><p className="text-sm text-muted-foreground">Your workforce, today’s entries and the work needing attention.</p></div></div><Button variant="outline" onClick={refresh} disabled={read.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${read.isFetching?'animate-spin':''}`}/>Refresh</Button></header>
  <Card><CardContent className="space-y-3 p-4"><form onSubmit={e=>{e.preventDefault();apply();}} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-7">
   <label className="min-w-0 text-xs font-medium">Company<select aria-label="Company" className={fieldClass} value={draft.companyId??''} onChange={e=>setDraft({...draft,companyId:e.target.value?Number(e.target.value):undefined,branchId:undefined,departmentId:undefined,siteId:undefined})}><option value="">All permitted companies</option>{choices.data?.options?.companies.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
   <label className="min-w-0 text-xs font-medium">Branch<select aria-label="Branch" className={fieldClass} disabled={!draft.companyId} value={draft.branchId??''} onChange={e=>setDraft({...draft,branchId:e.target.value?Number(e.target.value):undefined})}><option value="">All permitted branches</option>{choices.data?.options?.branches.filter(c=>c.companyId===draft.companyId).map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
   <label className="min-w-0 text-xs font-medium">Department<select aria-label="Department" className={fieldClass} value={draft.departmentId??''} onChange={e=>setDraft({...draft,departmentId:e.target.value?Number(e.target.value):undefined})}><option value="">All departments</option>{choices.data?.options?.departments.filter(c=>!draft.companyId||c.companyId==null||c.companyId===draft.companyId).map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
   <label className="min-w-0 text-xs font-medium">Primary site<select aria-label="Primary site" className={fieldClass} value={draft.siteId??''} onChange={e=>setDraft({...draft,siteId:e.target.value?Number(e.target.value):undefined})}><option value="">All sites</option>{choices.data?.options?.sites.filter(c=>!draft.companyId||c.companyId==null||c.companyId===draft.companyId).map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
   <label className="min-w-0 text-xs font-medium">Date (Dubai)<Input required aria-label="Date (Dubai)" type="date" value={draft.date??''} onChange={e=>setDraft({...draft,date:e.target.value})}/></label>
   <label className="min-w-0 text-xs font-medium">Expiring within<select aria-label="Expiring within" className={fieldClass} value={draft.expiryDays} onChange={e=>setDraft({...draft,expiryDays:e.target.value as DashboardScope['expiryDays']})}>{(['7','30','60','90'] as const).map(v=><option key={v} value={v}>{v} days</option>)}</select></label><Button type="submit">Apply filters</Button>
  </form>{choices.isError&&<p role="alert" className="text-sm text-destructive">Filter choices could not load. <button className="underline" onClick={choices.retry}>Retry choices</button></p>}
  <p className="text-xs text-muted-foreground">Figures use the applied filters and your current access. The date selects attendance, leave and expiry checks; workforce status is current, not a historical headcount. Site means employee primary site or recruitment work site.</p>
  </CardContent></Card>
  <nav aria-label="HR quick actions" className="flex flex-wrap gap-2">{shortcut.filter(([p,,href])=>permission(p)&&(href!=='/admin/hr/document-browser'||hasPermission(auth,'dms.documents.view')||hasPermission(auth,'dms.admin'))).map(([,label,href])=><Link key={href} className="rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary" href={href}>{label}</Link>)}</nav>
  <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{read.data?`Updated ${new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dubai',dateStyle:'medium',timeStyle:'short'}).format(new Date(read.data.asOf))} · Dubai`:read.isError?'Dashboard unavailable':'Updating dashboard…'}</span><span>Refreshes every minute while active. Click a figure to see matching records.</span></div>
  {read.isError&&<p role="alert" className="rounded-md border border-destructive p-4">The HR dashboard could not load. <button onClick={read.retry} className="underline">Try again</button></p>}
  {metrics&&Object.values(metrics).some(m=>m.status==='failed')&&<p role="alert" className="text-sm text-destructive">Some sections could not load. Other confirmed figures remain available; refresh to retry.</p>}
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">{DASHBOARD_HERO.map(key=>{const d=DASHBOARD_DEFINITIONS.find(d=>d.key===key)!,m=metrics?.[key];return <button key={key} disabled={m?.status!=='ready'} onClick={()=>open(key)} className="rounded-lg border bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent/30 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default"><span className="block text-xs font-medium text-muted-foreground">{d.label}</span><span className="my-2 block text-2xl font-semibold tabular-nums">{dashboardMetricLabel(m)}</span><span className="block text-xs text-muted-foreground">{d.unit}{key==='expiring'?` · next ${scope.expiryDays} days`:''}</span></button>;})}</div>
  <section ref={panel} tabIndex={-1} aria-label="Matching records" className="scroll-mt-4 focus:outline-none">{selected&&<Card><CardHeader className="flex flex-wrap flex-row items-center justify-between gap-2"><div><CardTitle className="text-base">{definition?.label}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{definition?.hint??'Matching records under the applied filters; open a record to review its current details.'}</p></div><Button variant="ghost" onClick={()=>setSelected(null)}>Close records</Button></CardHeader><CardContent>
   {detail.isError?<p role="alert">Matching records could not load. <button onClick={detail.retry} className="underline">Retry records</button></p>:detailMetric?.status==='ready'&&detailMetric.items.length?<Records items={detailMetric.items}/>:<MetricState metric={detailMetric}/>}
   {detailMetric?.status==='ready'&&<div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm"><span>{detailMetric.value} matching {definition?.unit} · Page {page} of {Math.max(1,Math.ceil((detailMetric.value??0)/25))}</span><div className="flex gap-2"><Button variant="outline" disabled={page===1||detail.isFetching} onClick={()=>setPage(p=>p-1)}>Previous</Button><Button variant="outline" disabled={page*25>=(detailMetric.value??0)||detail.isFetching} onClick={()=>setPage(p=>p+1)}>Next</Button></div></div>}
  </CardContent></Card>}</section>
  <section className="space-y-3"><h2 className="text-sm font-semibold">Needs your attention</h2><div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{panelKeys.map(key=>{const d=DASHBOARD_DEFINITIONS.find(d=>d.key===key)!,m=metrics?.[key];return <Card key={key}><CardHeader className="pb-2"><CardTitle className="text-sm">{d.label}</CardTitle></CardHeader><CardContent>{m?.status==='ready'&&m.items.length?<Records items={m.items}/>:<MetricState metric={m}/>}<Button className="mt-2" variant="outline" size="sm" disabled={m?.status!=='ready'} onClick={()=>open(key)}>View all{m?.status==='ready'?` (${m.value})`:''}</Button></CardContent></Card>;})}</div></section>
  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-sm">Workforce distribution</CardTitle><select aria-label="Workforce chart" className={`${fieldClass} !w-auto`} value={chart} onChange={e=>setChart(e.target.value)}>{['company','department','category','site'].map(key=><option key={key} value={key}>{key==='site'?'Primary site':key[0].toUpperCase()+key.slice(1)}</option>)}</select></div><p className="text-xs text-muted-foreground">Active, probation and on-leave employees under the applied filters. Chart shows the top eight groups; all counts are listed below.</p></CardHeader><CardContent>{chartData?.items.length?<><DmsCategoryBarChart valueLabel="Employees" data={chartData.items.slice(0,8).map(c=>({name:c.label,count:c.value}))}/><details className="mt-2 text-xs"><summary className="cursor-pointer">All groups and counts</summary><ul>{chartData.items.map((r,i)=><li key={i} className="flex justify-between gap-4 py-1"><span>{r.label}</span><span>{r.value}</span></li>)}</ul></details></>:<p className="text-sm text-muted-foreground">{read.isError?'Could not load':!read.data?'Loading…':chartData?'No matching employees.':'Chart unavailable or restricted.'}</p>}</CardContent></Card>
   <Card><CardHeader><CardTitle className="text-sm">Documents and time at a glance</CardTitle><p className="text-xs text-muted-foreground">Independent totals; document and employee counts are not added together.</p></CardHeader><CardContent className="space-y-2">{['attendance_missing','missing_punches','cards_due','training_due','unverified'].map(key=>{const d=DASHBOARD_DEFINITIONS.find(d=>d.key===key)!,m=metrics?.[key];return <button key={key} onClick={()=>open(key)} disabled={m?.status!=='ready'} className="flex w-full items-center justify-between gap-4 rounded-md border p-3 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"><span>{d.label}<span className="block text-xs text-muted-foreground">{d.unit}</span></span><span className="font-semibold">{dashboardMetricLabel(m)}</span></button>;})}</CardContent></Card>
  </div>
  <section className="space-y-3"><h2 className="text-sm font-semibold">Explore HR</h2><div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{DASHBOARD_GROUPS.map((group,index)=>{const Icon=[UsersRound,CalendarClock,ShieldCheck,Briefcase,Landmark,Building2][index];return <Card key={group}><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Icon className="h-4 w-4 text-primary"/>{group}</CardTitle></CardHeader><CardContent>{DASHBOARD_DEFINITIONS.filter(d=>d.group===group).map(d=>{const m=metrics?.[d.key];return <button key={d.key} className="flex w-full items-start justify-between gap-3 border-b py-2.5 text-left text-sm last:border-0 hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-primary" disabled={m?.status!=='ready'} onClick={()=>open(d.key)}><span>{d.label}<span className="block text-xs text-muted-foreground">{d.unit}</span></span><span className="shrink-0 font-medium tabular-nums">{dashboardMetricLabel(m)}</span></button>;})}</CardContent></Card>;})}</div></section>
  <p className="flex items-start gap-2 text-xs text-muted-foreground"><ClipboardList className="h-4 w-4 shrink-0"/>Readiness and payroll figures are review indicators, not clearance or payment approval. Medical validity and stock-owner clearance remain governed by their existing rules.</p>
 </div>;
}
