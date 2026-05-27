import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPDataToolbar } from "@/components/erp/data-toolbar";
import { ERPStatusBadge } from "@/components/erp/status-badge";
import { ERPActionMenu } from "@/components/erp/action-menu";
import { ERPSectionCard } from "@/components/erp/section-card";
import { ERPFilterBar } from "@/components/erp/filter-bar";
import { ERPEmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Edit, Trash2, Eye, MapPin, Building2, Users } from "lucide-react";

// Demo data
const demoBranches = [
  { id: "1", name: "Dubai Main Office", code: "DXB-HQ", organization: "Alliance Gulf Transport LLC", city: "Dubai", country: "UAE", employees: 420, status: "active" as const },
  { id: "2", name: "Jebel Ali Yard", code: "DXB-JA", organization: "Alliance Gulf Transport LLC", city: "Dubai", country: "UAE", employees: 180, status: "active" as const },
  { id: "3", name: "Abu Dhabi Branch", code: "AUH-01", organization: "Alliance Gulf Logistics", city: "Abu Dhabi", country: "UAE", employees: 145, status: "active" as const },
  { id: "4", name: "Sharjah Workshop", code: "SHJ-WS", organization: "Alliance Gulf Transport LLC", city: "Sharjah", country: "UAE", employees: 95, status: "active" as const },
  { id: "5", name: "Muscat Operations", code: "MCT-01", organization: "Gulf Star Shipping", city: "Muscat", country: "Oman", employees: 72, status: "active" as const },
  { id: "6", name: "Al Ain Depot", code: "AAN-01", organization: "Alliance Gulf Logistics", city: "Al Ain", country: "UAE", employees: 55, status: "inactive" as const },
  { id: "7", name: "Riyadh Office", code: "RUH-01", organization: "Alliance KSA Operations", city: "Riyadh", country: "Saudi Arabia", employees: 0, status: "pending" as const },
];

export default function BranchesPage() {
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filteredBranches = demoBranches.filter((b) => {
    const matchesSearch =
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.code.toLowerCase().includes(search.toLowerCase());
    const matchesOrg = !orgFilter || orgFilter === "all" || b.organization.includes(orgFilter);
    const matchesStatus = !statusFilter || statusFilter === "all" || b.status === statusFilter;
    return matchesSearch && matchesOrg && matchesStatus;
  });

  const activeFilters = [orgFilter, statusFilter].filter((f) => f && f !== "all").length;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-[1400px]">
        <ERPPageHeader
          title="Branches"
          description="Manage branch offices and operational locations"
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Administration", href: "/admin/users" },
            { label: "Branches" },
          ]}
          actions={
            <Button size="sm" className="h-9 text-xs gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add Branch
            </Button>
          }
        />

        <ERPSectionCard noPadding>
          <div className="px-5 pt-4 space-y-3">
            <ERPDataToolbar
              searchPlaceholder="Search branches by name or code..."
              searchValue={search}
              onSearchChange={setSearch}
              showExport
            />
            <ERPFilterBar
              filters={[
                {
                  id: "org",
                  label: "Organization",
                  value: orgFilter,
                  onChange: setOrgFilter,
                  options: [
                    { label: "All Organizations", value: "all" },
                    { label: "Alliance Gulf Transport", value: "Alliance Gulf Transport" },
                    { label: "Alliance Gulf Logistics", value: "Alliance Gulf Logistics" },
                    { label: "Gulf Star Shipping", value: "Gulf Star Shipping" },
                    { label: "Alliance KSA Operations", value: "Alliance KSA Operations" },
                  ],
                },
                {
                  id: "status",
                  label: "Status",
                  value: statusFilter,
                  onChange: setStatusFilter,
                  options: [
                    { label: "All Statuses", value: "all" },
                    { label: "Active", value: "active" },
                    { label: "Inactive", value: "inactive" },
                    { label: "Pending", value: "pending" },
                  ],
                },
              ]}
              activeCount={activeFilters}
              onClearAll={() => { setOrgFilter(""); setStatusFilter(""); }}
            />
          </div>

          {filteredBranches.length === 0 ? (
            <ERPEmptyState
              icon={Building2}
              title="No branches found"
              description="Try adjusting your search or filter criteria"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/40">
                  <TableHead className="text-xs font-semibold uppercase tracking-wider pl-5">Branch</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Code</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Organization</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Location</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Employees</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wider w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBranches.map((branch) => (
                  <TableRow key={branch.id} className="border-border/30 hover:bg-muted/30">
                    <TableCell className="pl-5">
                      <span className="text-sm font-medium text-foreground">{branch.name}</span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">{branch.code}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{branch.organization}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {branch.city}, {branch.country}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        {branch.employees}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ERPStatusBadge status={branch.status} />
                    </TableCell>
                    <TableCell>
                      <ERPActionMenu
                        items={[
                          { label: "View Details", icon: Eye },
                          { label: "Edit Branch", icon: Edit },
                          { label: "Delete", icon: Trash2, variant: "destructive", separator: true },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="px-5 py-3 border-t border-border/30 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {filteredBranches.length} of {demoBranches.length} branches
            </p>
          </div>
        </ERPSectionCard>
      </div>
    </AppLayout>
  );
}