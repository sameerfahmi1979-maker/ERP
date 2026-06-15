import {
  BellIcon,
  Building2Icon,
  CarIcon,
  ClipboardListIcon,
  FileTextIcon,
  PackageIcon,
  ShieldIcon,
  WrenchIcon,
} from "lucide-react";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";

const modules = [
  { title: "HR", description: "Employees, attendance, payroll", icon: Building2Icon },
  { title: "Fleet", description: "Vehicles, assignments, compliance", icon: CarIcon },
  { title: "Workshop", description: "Jobs, parts, service orders", icon: WrenchIcon },
  { title: "Operations", description: "Daily operations control tower", icon: ClipboardListIcon },
  { title: "Equipment Rental", description: "Rental contracts and utilization", icon: PackageIcon },
  { title: "DMS", description: "Documents, workflows, retention", icon: FileTextIcon },
  { title: "HSE", description: "Incidents, inspections, permits", icon: ShieldIcon },
  { title: "Inventory", description: "Stock, warehouses, movements", icon: PackageIcon },
  { title: "Procurement", description: "RFQs, POs, vendor management", icon: ClipboardListIcon },
  { title: "Finance", description: "GL, AP/AR, reporting", icon: Building2Icon },
  { title: "Notifications", description: "Alerts and delivery channels", icon: BellIcon },
  { title: "Expiry Dashboard", description: "License and certificate expiry", icon: BellIcon },
  { title: "Audit Logs", description: "System activity and compliance trail", icon: ClipboardListIcon },
];

export default async function DashboardPage() {
  const ctx = await getAuthContext();
  const canViewDashboard = hasPermission(ctx, "dashboard.view");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <PageBreadcrumb items={[{ label: "Dashboard" }]} />
        <h1 className="text-2xl font-semibold tracking-tight">ERP Dashboard</h1>
        <p className="text-muted-foreground">
          Foundation workspace for Alliance Gulf Transport enterprise modules.
        </p>
      </div>

      {!canViewDashboard ? (
        <Card>
          <CardHeader>
            <CardTitle>Limited access</CardTitle>
            <CardDescription>
              Your account does not yet have the dashboard.view permission. Assign roles after
              migration and admin bootstrap.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((module) => (
          <Card key={module.title} className="opacity-90">
            <CardHeader className="flex flex-row items-start gap-3">
              <module.icon className="mt-0.5 text-muted-foreground" />
              <div>
                <CardTitle className="text-base">{module.title}</CardTitle>
                <CardDescription>{module.description}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Module placeholder — not implemented in Phase 001.</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
