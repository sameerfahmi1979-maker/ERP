import { ERPStatCard } from "@/components/erp/stat-card";
import { ERPModuleCard } from "@/components/erp/module-card";
import { ERPSectionCard } from "@/components/erp/section-card";
import { ERPPageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Truck,
  Package,
  DollarSign,
  UserCog,
  Wrench,
  HardHat,
  ShoppingCart,
  FileText,
  Building2,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  Plus,
  TrendingUp,
} from "lucide-react";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const stats = [
  { title: "Total Employees", value: "1,247", change: "+12 this month", changeType: "positive" as const, icon: Users, iconColor: "text-blue-600" },
  { title: "Active Vehicles", value: "384", change: "6 in maintenance", changeType: "neutral" as const, icon: Truck, iconColor: "text-teal-600" },
  { title: "Pending Orders", value: "56", change: "-8 from yesterday", changeType: "positive" as const, icon: Package, iconColor: "text-amber-600" },
  { title: "Monthly Revenue", value: "AED 2.4M", change: "+18.2% vs last month", changeType: "positive" as const, icon: DollarSign, iconColor: "text-emerald-600" },
];

const modules = [
  { title: "Fleet Management", description: "Vehicle tracking, maintenance, fuel logs", icon: Truck, iconColor: "text-teal-600", bgColor: "bg-teal-50 dark:bg-teal-950/30", status: "active" as const, itemCount: 384 },
  { title: "HR & Payroll", description: "Employee records, attendance, payroll", icon: UserCog, iconColor: "text-blue-600", bgColor: "bg-blue-50 dark:bg-blue-950/30", status: "active" as const, itemCount: 1247 },
  { title: "Workshop", description: "Job cards, parts, service schedules", icon: Wrench, iconColor: "text-orange-600", bgColor: "bg-orange-50 dark:bg-orange-950/30", status: "active" as const, itemCount: 42 },
  { title: "HSE", description: "Safety incidents, inspections, compliance", icon: HardHat, iconColor: "text-red-600", bgColor: "bg-red-50 dark:bg-red-950/30", status: "active" as const, itemCount: 18 },
  { title: "Finance", description: "Invoices, expenses, budgets, reports", icon: DollarSign, iconColor: "text-emerald-600", bgColor: "bg-emerald-50 dark:bg-emerald-950/30", status: "active" as const },
  { title: "Inventory", description: "Stock levels, warehouses, transfers", icon: Package, iconColor: "text-purple-600", bgColor: "bg-purple-50 dark:bg-purple-950/30", status: "active" as const, itemCount: 2340 },
  { title: "Procurement", description: "Purchase orders, vendors, approvals", icon: ShoppingCart, iconColor: "text-pink-600", bgColor: "bg-pink-50 dark:bg-pink-950/30", status: "active" as const },
  { title: "Documents", description: "DMS, contracts, policies, templates", icon: FileText, iconColor: "text-slate-600", bgColor: "bg-slate-50 dark:bg-slate-950/30", status: "active" as const },
];

const recentActivity = [
  { action: "New employee onboarded", detail: "Ahmed Al Rashid — Driver Division", time: "5 min ago", type: "info" },
  { action: "Vehicle maintenance completed", detail: "Truck #TRK-0421 — Oil change & brake inspection", time: "22 min ago", type: "success" },
  { action: "Purchase order approved", detail: "PO-2026-0892 — Spare parts (AED 12,400)", time: "1 hr ago", type: "info" },
  { action: "Safety incident reported", detail: "Minor — Warehouse B loading dock", time: "2 hrs ago", type: "warning" },
  { action: "Payroll processed", detail: "May 2026 — 1,247 employees", time: "3 hrs ago", type: "success" },
];

const alerts = [
  { title: "12 vehicle registrations expiring", detail: "Within next 30 days", severity: "warning" },
  { title: "3 safety inspections overdue", detail: "HSE compliance required", severity: "error" },
  { title: "Budget threshold reached", detail: "Workshop Q2 budget at 92%", severity: "warning" },
];

export default async function DashboardPage() {
  const ctx = await getAuthContext();
  const canViewDashboard = hasPermission(ctx, "dashboard.view");

  if (!canViewDashboard) {
    return (
      <div className="flex flex-col gap-6">
        <ERPPageHeader
          title="Dashboard"
          description="Alliance Gulf Transport — ERP Foundation"
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Dashboard" },
          ]}
        />
        <Card>
          <CardHeader>
            <CardTitle>Limited access</CardTitle>
            <CardDescription>
              Your account does not yet have the dashboard.view permission. Assign roles after
              migration and admin bootstrap.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Page Header */}
      <ERPPageHeader
        title="Executive Dashboard"
        description="Alliance Gulf Transport — Operations Overview"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Dashboard" },
        ]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5">
              <TrendingUp className="h-3.5 w-3.5" />
              Reports
            </Button>
            <Button size="sm" className="h-9 text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Quick Action
            </Button>
          </div>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <ERPStatCard key={stat.title} {...stat} />
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <ERPSectionCard
          title="Recent Activity"
          description="Latest operations across all modules"
          actions={
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
              View All <ArrowUpRight className="h-3 w-3" />
            </Button>
          }
          className="lg:col-span-2"
        >
          <div className="space-y-3">
            {recentActivity.map((item, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0">
                <div className="mt-0.5">
                  <Clock className="h-4 w-4 text-muted-foreground/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.action}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.detail}</p>
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{item.time}</span>
              </div>
            ))}
          </div>
        </ERPSectionCard>

        {/* Alerts & Notifications */}
        <ERPSectionCard
          title="Alerts & Expiries"
          description="Items requiring attention"
          actions={
            <Badge variant="secondary" className="text-[10px]">
              {alerts.length} active
            </Badge>
          }
        >
          <div className="space-y-3">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/30"
              >
                <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${alert.severity === "error" ? "text-red-500" : "text-amber-500"}`} />
                <div>
                  <p className="text-sm font-medium text-foreground">{alert.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{alert.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </ERPSectionCard>
      </div>

      {/* Module Cards */}
      <ERPSectionCard
        title="ERP Modules"
        description="Quick access to all operational modules"
        actions={
          <Button variant="ghost" size="sm" className="h-7 text-xs">
            <Building2 className="h-3.5 w-3.5 mr-1" />
            Manage Modules
          </Button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
          {modules.map((module) => (
            <ERPModuleCard key={module.title} {...module} />
          ))}
        </div>
      </ERPSectionCard>
    </div>
  );
}
