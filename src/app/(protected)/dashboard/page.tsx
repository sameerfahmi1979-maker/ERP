import Link from "next/link";
import {redirect} from "next/navigation";
import {Users, FileText, Building2, History} from "lucide-react";
import {ERPPageHeader} from "@/components/erp/page-header";
import {ERPStatCard} from "@/components/erp/stat-card";
import {ERPSectionCard} from "@/components/erp/section-card";
import {getAuthContext,hasPermission,isGlobalAdmin} from "@/lib/rbac/check";
import {getFirstPermittedRoute} from "@/lib/rbac/route-access-registry";
import {readHomeDashboard} from "@/server/reads/home-dashboard";

export default async function DashboardPage(){
  const ctx=await getAuthContext();
  if(!hasPermission(ctx,"dashboard.view"))redirect(getFirstPermittedRoute(ctx.permissionCodes,isGlobalAdmin(ctx)));
  const data=await readHomeDashboard(ctx);
  const label=(metric:{status:string;value?:number})=>metric.status==="ready"?String(metric.value):metric.status==="restricted"?"Restricted":"Unavailable";
  const cards=[
    {title:"Total Employees",value:label(data.employees),icon:Users,iconColor:"text-blue-600"},
    {title:"Queued / Processing AI Tasks",value:label(data.documentsPending),icon:FileText,iconColor:"text-amber-600"},
    {title:"Registered Parties",value:label(data.parties),icon:Building2,iconColor:"text-teal-600"},
  ];
  const links=[
    {permission:"hr.employees.view",label:"Employees",href:"/admin/hr/employees"},
    {permission:"hr.dashboard.view",label:"HR Dashboard",href:"/admin/hr/dashboard"},
    {permission:"dms.documents.view",label:"Documents",href:"/dms/documents"},
    {permission:"audit.view",label:"Audit Logs",href:"/admin/audit"},
    {permission:"reports.view",label:"Reports",href:"/admin/reports"},
  ].filter(item=>hasPermission(ctx,item.permission));
  return <div className="space-y-6 max-w-[1400px]">
    <ERPPageHeader title="Executive Dashboard" description="Current records available to your account" breadcrumbs={[{label:"Home",href:"/"},{label:"Dashboard"}]}/>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{cards.map(card=><ERPStatCard key={card.title} {...card}/>)}</div>
    <ERPSectionCard title="Recent Activity" description="Up to ten recent audit events available to your account">
      {data.activity.status!=="ready"?<p role="status">{data.activity.status==="restricted"?"Activity access is restricted.":"Activity could not be loaded. Reload to retry."}</p>:
        data.activity.rows.length===0?<p>No permitted audit events.</p>:
        <ul className="space-y-3">{data.activity.rows.map(row=><li key={row.id} className="flex gap-3 border-b py-2"><History aria-hidden className="h-4 w-4"/><span>{row.action} · {row.module_code??"General"}</span><time className="ml-auto text-sm text-muted-foreground" dateTime={row.created_at}>{row.created_at}</time></li>)}</ul>}
    </ERPSectionCard>
    <ERPSectionCard title="Your Modules" description="Open an available module">
      {links.length?<div className="flex flex-wrap gap-4">{links.map(item=><Link className="underline" key={item.href} href={item.href}>{item.label}</Link>)}</div>:<p>No additional modules are assigned.</p>}
    </ERPSectionCard>
  </div>;
}
