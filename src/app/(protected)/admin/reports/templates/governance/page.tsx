/**
 * Template Governance Dashboard — BRANDING.8
 * Shows governance status counts, approver queue, and failed security review list.
 */

import { redirect } from "next/navigation";
import { LoadError } from "@/components/erp/load-error";
import { getAuthContext, hasPermission,hasGlobalPermission } from "@/lib/rbac/check";
import {listBrandingProfiles} from '@/server/actions/reports/templates';
import { getGovernanceSummary } from "@/server/actions/reports/template-governance";
import { GovernanceDashboardClient } from "./governance-dashboard-client";
import {NotificationArrival} from '@/features/notifications/notification-open';
import {requireReportTemplateCapability} from '@/server/report-template-authority';

export const metadata = { title: "Template Governance" };

export default async function TemplateGovernancePage({searchParams}:{searchParams?:Promise<{template_id?:string;f10_open?:string}>}) {
  const ctx = await getAuthContext();
  const opening=await searchParams??{};
  let openedTemplate:number|null=null;
  let openedStatus:string|null=null;
  if(opening.template_id!==undefined){
    const id=Number(opening.template_id);
    if(Number.isSafeInteger(id)&&id>0){
      try{const target=await requireReportTemplateCapability(ctx,id,['reports.template.approve','reports.manage']);openedTemplate=id;openedStatus=target.template.governance_status;}
      catch{/* Missing/unauthorized target must not acknowledge a read. */}
    }
  }
  if (
    !hasPermission(ctx, "reports.view") &&
    !hasPermission(ctx, "reports.manage") &&
    !hasPermission(ctx, "reports.template.approve")
  ) {
    redirect("/admin/reports/templates");
  }

  const [summary,profiles] = await Promise.all([getGovernanceSummary(),listBrandingProfiles()]);
  if (!summary.success||!profiles.success) return <LoadError title="Template governance" retryHref="/admin/reports/templates/governance" />;

  const canApprove = hasPermission(ctx, "reports.template.approve");
  const canPublish = hasPermission(ctx, "reports.publish") || canApprove;
  const canManage = hasPermission(ctx, "reports.manage");

  return (
    <>{openedTemplate!==null&&<NotificationArrival token={opening.f10_open} path={`/admin/reports/templates/governance?template_id=${openedTemplate}`}/>}
    {opening.template_id&&<p role="status">{openedTemplate!==null?`Template ${openedTemplate}: current governance state is ${openedStatus}. ${openedStatus==='in_review'?'Choose its permitted review action below.':'The task has changed since the notification; no approval or publication was performed.'}`:'The requested template is unavailable or not permitted. Its notification has not been marked read.'}</p>}
    <GovernanceDashboardClient
      counts={summary.data?.counts ?? {}}
      inReviewTemplates={summary.data?.inReviewTemplates ?? []}
      failedSecurityReviewTemplates={summary.data?.failedSecurityReviewTemplates ?? []}
      canApprove={canApprove}
      canPublish={canPublish}
      canManage={canManage}
      profiles={profiles.data??[]}
      globalTemplateCapabilities={{manage:hasGlobalPermission(ctx,'reports.manage'),approve:hasGlobalPermission(ctx,'reports.template.approve'),publish:hasGlobalPermission(ctx,'reports.publish')||hasGlobalPermission(ctx,'reports.template.approve'),sign:hasGlobalPermission(ctx,'reports.sign')}}
    /></>
  );
}
