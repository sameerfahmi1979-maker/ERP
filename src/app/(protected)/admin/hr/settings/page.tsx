import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect } from "next/navigation";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPSectionCard } from "@/components/erp/section-card";
import Link from "next/link";
import {
  UserSquare2, Briefcase, BarChart3, CreditCard, FileText,
  GraduationCap, ShieldCheck, HeartPulse, Umbrella, Users,
  DollarSign, Calendar, Building, ClipboardList, CheckSquare,
  Grid3X3, Map, GitBranch,
} from "lucide-react";

const SETTINGS_GROUPS = [
  {
    group: "Employee Profile",
    color: "from-blue-500/10 to-blue-600/10 border-blue-200/60",
    items: [
      { label: "Employee Categories", href: "/admin/hr/settings/employee-categories", icon: UserSquare2, description: "Staff, outsourced, PRO, etc." },
      { label: "Employment Types", href: "/admin/hr/settings/employment-types", icon: Briefcase, description: "Full-time, part-time, contract, etc." },
      { label: "Grades", href: "/admin/hr/settings/grades", icon: BarChart3, description: "Salary grades and job levels" },
      { label: "Relationship Types", href: "/admin/hr/settings/relationship-types", icon: Users, description: "Emergency contact relationships" },
    ],
  },
  {
    group: "Compliance & Compliance Documents",
    color: "from-amber-500/10 to-amber-600/10 border-amber-200/60",
    items: [
      { label: "Identity Document Types", href: "/admin/hr/settings/identity-document-types", icon: FileText, description: "Passport, Emirates ID, visa, etc." },
      { label: "Access Card Types", href: "/admin/hr/settings/access-card-types", icon: CreditCard, description: "CICPA, ADNOC, client badges, etc." },
      { label: "Medical Record Types", href: "/admin/hr/settings/medical-record-types", icon: HeartPulse, description: "Fitness certificates, insurance, etc." },
      { label: "PRO Process Types", href: "/admin/hr/settings/pro-process-types", icon: ClipboardList, description: "Visa, labour card, permit processes" },
    ],
  },
  {
    group: "Training",
    color: "from-green-500/10 to-green-600/10 border-green-200/60",
    items: [
      { label: "Training Categories", href: "/admin/hr/settings/training-categories", icon: GraduationCap, description: "Safety, technical, regulatory, etc." },
      { label: "Training Types", href: "/admin/hr/settings/training-types", icon: ShieldCheck, description: "BOSIET, H2S, first aid, etc." },
    ],
  },
  {
    group: "Leave & Payroll",
    color: "from-purple-500/10 to-purple-600/10 border-purple-200/60",
    items: [
      { label: "Leave Types", href: "/admin/hr/settings/leave-types", icon: Umbrella, description: "Annual, sick, emergency, etc." },
      { label: "Salary Component Types", href: "/admin/hr/settings/salary-component-types", icon: DollarSign, description: "Basic, allowances, deductions, etc." },
      { label: "Payroll Groups", href: "/admin/hr/settings/payroll-groups", icon: Calendar, description: "Monthly, weekly payment cycles" },
    ],
  },
  {
    group: "Legal & Workflow",
    color: "from-rose-500/10 to-rose-600/10 border-rose-200/60",
    items: [
      { label: "MOHRE Establishments", href: "/admin/hr/settings/mohre-establishments", icon: Building, description: "Labour establishment registrations" },
      { label: "Readiness Rules", href: "/admin/hr/settings/readiness-rule-templates", icon: CheckSquare, description: "Employee readiness requirement rules" },
      { label: "Role Requirement Matrix", href: "/admin/hr/settings/role-requirement-matrix", icon: Grid3X3, description: "Category-based required documents" },
      { label: "Site Requirement Matrix", href: "/admin/hr/settings/site-requirement-matrix", icon: Map, description: "Site-based access and training rules" },
      { label: "Approval Workflows", href: "/admin/hr/settings/approval-workflows", icon: GitBranch, description: "Leave and process approval chains" },
    ],
  },
];

export default async function HrSettingsPage() {
  const ctx = await getAuthContext();
  const canView =
    hasPermission(ctx, "hr.settings.view") ||
    hasPermission(ctx, "hr.settings.manage") ||
    hasPermission(ctx, "hr.admin");
  if (!canView) redirect("/dashboard");

  return (
    <div className="flex flex-col gap-6">
      <ERPPageHeader
        title="HR Settings"
        description="Configure HR module lookup tables, compliance rules, payroll groups, and approval workflows"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "HR Settings" },
        ]}
      />
      <div className="flex flex-col gap-6">
        {SETTINGS_GROUPS.map((group) => (
          <ERPSectionCard
            key={group.group}
            title={group.group}
            description={`${group.items.length} setting${group.items.length > 1 ? "s" : ""}`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-start gap-3 rounded-lg border bg-gradient-to-br ${group.color} p-4 transition-all hover:shadow-sm hover:scale-[1.01]`}
                  >
                    <div className="mt-0.5 flex-shrink-0 rounded-md bg-background/80 p-1.5 shadow-sm">
                      <Icon className="h-4 w-4 text-foreground/70" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-tight">{item.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground leading-tight">{item.description}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </ERPSectionCard>
        ))}
      </div>
    </div>
  );
}
