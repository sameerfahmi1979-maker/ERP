import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPDataToolbar } from "@/components/erp/data-toolbar";
import { ERPStatusBadge } from "@/components/erp/status-badge";
import { ERPActionMenu } from "@/components/erp/action-menu";
import { ERPSectionCard } from "@/components/erp/section-card";
import { ERPStatCard } from "@/components/erp/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Plus, Edit, Trash2, Eye, GitBranch, Users, MapPin } from "lucide-react";

// Demo data
const demoOrgs = [
  { id: "1", name: "Alliance Gulf Transport LLC", code: "AGT-001", country: "UAE", city: "Dubai", branches: 5, employees: 890, status: "active" as const },
  { id: "2", name: "Alliance Gulf Logistics", code: "AGL-002", country: "UAE", city: "Abu Dhabi", branches: 3, employees: 245, status: "active" as const },
  { id: "3", name: "Gulf Star Shipping", code: "GSS-003", country: "Oman", city: "Muscat", branches: 2, employees: 112, status: "active" as const },
  { id: "4", name: "Alliance KSA Operations", code: "AKO-004", country: "Saudi Arabia", city: "Riyadh", branches: 1, employees: 0, status: "pending" as const },
];

export default function OrganizationsPage() {
  const [search, setSearch] = useState("");

  const filteredOrgs = demoOrgs.filter(
    (o) =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="space-y-6 max-w-[1400px]">
        <ERPPageHeader
          title="Organizations"
          description="Manage company entities and organizational structure"
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Administration", href: "/admin/users" },
            { label: "Organizations" },
          ]}
          actions={
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" className="h-9 text-xs gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  Add Organization
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Organization</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Organization Name</Label>
                    <Input placeholder="Enter organization name" className="h-9 text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Code</Label>
                      <Input placeholder="e.g. AGT-005" className="h-9 text-sm" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Country</Label>
                      <Input placeholder="Country" className="h-9 text-sm" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">City</Label>
                    <Input placeholder="City" className="h-9 text-sm" />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" size="sm">Cancel</Button>
                    <Button size="sm">Create Organization</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          }
        />

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ERPStatCard title="Total Organizations" value={demoOrgs.length} icon={Building2} iconColor="text-blue-600" description="Across 3 countries" />
          <ERPStatCard title="Total Branches" value={11} icon={GitBranch} iconColor="text-teal-600" description="All organizations combined" />
          <ERPStatCard title="Total Employees" value="1,247" icon={Users} iconColor="text-purple-600" description="Active headcount" />
        </div>

        {/* Organizations Table */}
        <ERPSectionCard title="All Organizations" noPadding>
          <div className="px-5 pt-2">
            <ERPDataToolbar
              searchPlaceholder="Search organizations..."
              searchValue={search}
              onSearchChange={setSearch}
              showExport
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/40">
                <TableHead className="text-xs font-semibold uppercase tracking-wider pl-5">Organization</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Code</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Location</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Branches</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Employees</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrgs.map((org) => (
                <TableRow key={org.id} className="border-border/30 hover:bg-muted/30">
                  <TableCell className="pl-5">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium text-foreground">{org.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground font-mono">{org.code}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {org.city}, {org.country}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{org.branches}</TableCell>
                  <TableCell className="text-sm font-medium">{org.employees}</TableCell>
                  <TableCell>
                    <ERPStatusBadge status={org.status} />
                  </TableCell>
                  <TableCell>
                    <ERPActionMenu
                      items={[
                        { label: "View Details", icon: Eye },
                        { label: "Edit Organization", icon: Edit },
                        { label: "Manage Branches", icon: GitBranch },
                        { label: "Delete", icon: Trash2, variant: "destructive", separator: true },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ERPSectionCard>
      </div>
    </AppLayout>
  );
}