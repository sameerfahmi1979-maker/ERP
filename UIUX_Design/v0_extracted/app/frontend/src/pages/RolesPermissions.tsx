import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPSectionCard } from "@/components/erp/section-card";
import { ERPActionMenu } from "@/components/erp/action-menu";
import { ERPStatusBadge } from "@/components/erp/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Edit, Trash2, Shield, Users, Eye } from "lucide-react";

// Demo data
const roles = [
  { id: "1", name: "Super Admin", description: "Full system access", users: 2, status: "active" as const, isSystem: true },
  { id: "2", name: "Fleet Manager", description: "Manage fleet operations and vehicles", users: 4, status: "active" as const, isSystem: false },
  { id: "3", name: "HR Manager", description: "Manage employees, attendance, payroll", users: 3, status: "active" as const, isSystem: false },
  { id: "4", name: "Workshop Lead", description: "Manage workshop jobs and parts", users: 5, status: "active" as const, isSystem: false },
  { id: "5", name: "Finance Officer", description: "Manage invoices, expenses, budgets", users: 4, status: "active" as const, isSystem: false },
  { id: "6", name: "HSE Officer", description: "Safety management and compliance", users: 3, status: "active" as const, isSystem: false },
  { id: "7", name: "Driver", description: "Basic access for drivers", users: 280, status: "active" as const, isSystem: true },
  { id: "8", name: "Viewer", description: "Read-only access to reports", users: 12, status: "inactive" as const, isSystem: true },
];

const modules = ["Dashboard", "Fleet", "HR", "Workshop", "HSE", "Finance", "Inventory", "Procurement", "Documents"];
const permissions = ["View", "Create", "Edit", "Delete", "Export", "Approve"];

const permissionMatrix: Record<string, Record<string, boolean>> = {
  "Fleet Manager": { "Fleet-View": true, "Fleet-Create": true, "Fleet-Edit": true, "Fleet-Delete": false, "Fleet-Export": true, "Fleet-Approve": true, "Dashboard-View": true, "HR-View": true },
  "HR Manager": { "HR-View": true, "HR-Create": true, "HR-Edit": true, "HR-Delete": true, "HR-Export": true, "HR-Approve": true, "Dashboard-View": true },
};

export default function RolesPermissionsPage() {
  const [selectedRole, setSelectedRole] = useState("Fleet Manager");

  return (
    <AppLayout>
      <div className="space-y-6 max-w-[1400px]">
        <ERPPageHeader
          title="Roles & Permissions"
          description="Configure role-based access control for system modules"
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Administration", href: "/admin/users" },
            { label: "Roles & Permissions" },
          ]}
          actions={
            <Button size="sm" className="h-9 text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Create Role
            </Button>
          }
        />

        <Tabs defaultValue="roles" className="space-y-4">
          <TabsList className="h-9">
            <TabsTrigger value="roles" className="text-xs">Roles</TabsTrigger>
            <TabsTrigger value="matrix" className="text-xs">Permission Matrix</TabsTrigger>
          </TabsList>

          <TabsContent value="roles" className="space-y-4">
            <ERPSectionCard title="System Roles" description="Manage roles and their assigned users" noPadding>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/40">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider pl-5">Role</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Description</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Users</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Type</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((role) => (
                    <TableRow key={role.id} className="border-border/30 hover:bg-muted/30">
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Shield className="h-4 w-4 text-primary" />
                          </div>
                          <span className="text-sm font-medium text-foreground">{role.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{role.description}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          {role.users}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {role.isSystem ? "System" : "Custom"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <ERPStatusBadge status={role.status} />
                      </TableCell>
                      <TableCell>
                        <ERPActionMenu
                          items={[
                            { label: "View Permissions", icon: Eye },
                            { label: "Edit Role", icon: Edit },
                            { label: "Delete", icon: Trash2, variant: "destructive", separator: true },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ERPSectionCard>
          </TabsContent>

          <TabsContent value="matrix" className="space-y-4">
            <ERPSectionCard
              title="Permission Matrix"
              description={`Viewing permissions for: ${selectedRole}`}
              actions={
                <div className="flex gap-2">
                  {roles.filter((r) => !r.isSystem || r.name === "Super Admin").slice(0, 4).map((r) => (
                    <Button
                      key={r.id}
                      variant={selectedRole === r.name ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setSelectedRole(r.name)}
                    >
                      {r.name}
                    </Button>
                  ))}
                </div>
              }
              noPadding
            >
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border/40">
                      <TableHead className="text-xs font-semibold uppercase tracking-wider pl-5 sticky left-0 bg-card">Module</TableHead>
                      {permissions.map((perm) => (
                        <TableHead key={perm} className="text-xs font-semibold uppercase tracking-wider text-center">{perm}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modules.map((mod) => (
                      <TableRow key={mod} className="border-border/30 hover:bg-muted/30">
                        <TableCell className="pl-5 text-sm font-medium sticky left-0 bg-card">{mod}</TableCell>
                        {permissions.map((perm) => {
                          const key = `${mod}-${perm}`;
                          const hasPermission = selectedRole === "Super Admin" ? true : permissionMatrix[selectedRole]?.[key] || false;
                          return (
                            <TableCell key={perm} className="text-center">
                              <Checkbox checked={hasPermission} disabled className="mx-auto" />
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ERPSectionCard>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}