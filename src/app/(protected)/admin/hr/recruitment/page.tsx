import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { getRecruitmentSummary } from "@/server/actions/hr/recruitment";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Briefcase, Calendar, Gift, CheckSquare, ArrowRight } from "lucide-react";
import { HrReportsMenu } from "@/components/erp/hr-reports-menu";

export default async function RecruitmentHubPage() {
  const ctx = await getAuthContext();
  const canView = hasPermission(ctx, "hr.recruitment.view") || hasPermission(ctx, "hr.recruitment.manage") || ctx.roleCodes?.includes("system_admin");
  if (!canView) redirect("/admin");

  const summaryRes = await getRecruitmentSummary();
  const summary = summaryRes.data;

  const cards = [
    {
      title: "Job Requisitions",
      description: "Manage open positions and hiring requests",
      href: "/admin/hr/recruitment/requisitions",
      icon: Briefcase,
      stats: summary ? [
        { label: "Total", value: summary.total_requisitions },
        { label: "Open", value: summary.open_requisitions },
      ] : [],
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      title: "Candidates",
      description: "Track candidate applications and pipeline",
      href: "/admin/hr/recruitment/candidates",
      icon: Users,
      stats: summary ? [
        { label: "Total", value: summary.total_candidates },
        { label: "Active", value: summary.active_candidates },
      ] : [],
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      title: "Interviews",
      description: "Schedule and track interview sessions",
      href: "/admin/hr/recruitment/interviews",
      icon: Calendar,
      stats: summary ? [
        { label: "This Week", value: summary.interviews_this_week },
      ] : [],
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      title: "Offers",
      description: "Manage candidate offers and approvals",
      href: "/admin/hr/recruitment/offers",
      icon: Gift,
      stats: summary ? [
        { label: "Pending", value: summary.pending_offers },
      ] : [],
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      title: "Onboarding",
      description: "Track onboarding checklists and tasks",
      href: "/admin/hr/recruitment/onboarding",
      icon: CheckSquare,
      stats: summary ? [
        { label: "Pending Tasks", value: summary.pending_onboarding_tasks },
      ] : [],
      color: "text-rose-600",
      bg: "bg-rose-50",
    },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Recruitment & Onboarding</h1>
          <p className="text-muted-foreground mt-1">Manage your recruitment pipeline from job requisitions to employee onboarding.</p>
        </div>
        <HrReportsMenu reports={[
          { reportCode: "HR_CANDIDATE_PIPELINE", label: "Candidate Pipeline" },
          { reportCode: "HR_REQUISITIONS", label: "Job Requisitions" },
          { reportCode: "HR_ONBOARDING_TASKS", label: "Onboarding Tasks" },
        ]} />
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Open Positions" value={summary.open_requisitions} />
          <StatCard label="Active Candidates" value={summary.active_candidates} />
          <StatCard label="Pending Offers" value={summary.pending_offers} />
          <StatCard label="Conversions (Month)" value={summary.conversions_this_month} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <Link key={card.href} href={card.href}>
            <Card className="shadow-none border hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer h-full">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`p-2.5 rounded-lg ${card.bg} flex-shrink-0`}>
                    <card.icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900">{card.title}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">{card.description}</p>
                    {card.stats.length > 0 && (
                      <div className="flex items-center gap-4 mt-2">
                        {card.stats.map((stat) => (
                          <div key={stat.label}>
                            <span className="text-lg font-bold">{stat.value}</span>
                            <span className="text-xs text-muted-foreground ml-1">{stat.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-400 flex-shrink-0 mt-1" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="shadow-none border">
      <CardContent className="p-4">
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
