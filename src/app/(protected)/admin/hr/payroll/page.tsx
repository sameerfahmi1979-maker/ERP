import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { DollarSign, Landmark, PauseCircle } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { HrReportsMenu } from "@/components/erp/hr-reports-menu";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAYROLL_SECTIONS = [
  {
    href: "/admin/hr/payroll/salaries",
    icon: DollarSign,
    title: "Salary Profiles",
    description: "View employee payroll profiles, gross salaries, and payroll group assignments.",
    permission: "hr.payroll.view",
  },
  {
    href: "/admin/hr/payroll/wps",
    icon: Landmark,
    title: "WPS Readiness",
    description: "Monitor WPS readiness status, missing data, and payroll holds across all employees.",
    permission: "hr.payroll.view",
  },
];

export default async function HrPayrollHubPage() {
  const authContext = await getAuthContext();

  const canView =
    hasPermission(authContext, "hr.payroll.view") ||
    authContext.roleCodes?.includes("system_admin");

  if (!canView) {
    redirect("/admin");
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Payroll &amp; WPS</h1>
          <p className="text-muted-foreground mt-1">
            Manage payroll readiness, salary profiles, WPS enrollment, and payroll holds.
          </p>
        </div>
        <HrReportsMenu reports={[{ reportCode: "HR_WPS_READINESS", label: "WPS Readiness" }]} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PAYROLL_SECTIONS.map((section) => {
          const canAccess =
            hasPermission(authContext, section.permission) ||
            authContext.roleCodes?.includes("system_admin");
          if (!canAccess) return null;
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">{section.title}</CardTitle>
                  </div>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}

        {/* Payroll holds — note */}
        <Card className="border-dashed">
          <CardHeader>
            <div className="flex items-center gap-2">
              <PauseCircle className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base text-muted-foreground">Payroll Holds</CardTitle>
            </div>
            <CardDescription>
              Place or release payroll holds from the individual Employee Profile → Payroll &amp; WPS tab.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
