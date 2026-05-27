import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPDataToolbar } from "@/components/erp/data-toolbar";
import { ERPSectionCard } from "@/components/erp/section-card";
import { ERPFilterBar } from "@/components/erp/filter-bar";
import { ERPStatusBadge } from "@/components/erp/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Download, Clock, Shield, AlertTriangle, Info, CheckCircle } from "lucide-react";

// Demo data
const auditLogs = [
  { id: "1", timestamp: "2026-05-27 14:32:18", user: "Sameer Fahmi", action: "User Created", module: "Administration", target: "Ahmed Al Rashid", severity: "info", ip: "192.168.1.45" },
  { id: "2", timestamp: "2026-05-27 14:28:05", user: "Ahmed Al Rashid", action: "Vehicle Updated", module: "Fleet", target: "TRK-0421", severity: "info", ip: "192.168.1.102" },
  { id: "3", timestamp: "2026-05-27 13:55:42", user: "Fatima Hassan", action: "Payroll Approved", module: "HR", target: "May 2026 Batch", severity: "success", ip: "192.168.1.78" },
  { id: "4", timestamp: "2026-05-27 13:12:30", user: "Mohammed Ali", action: "Permission Changed", module: "Security", target: "Workshop Lead Role", severity: "warning", ip: "192.168.1.55" },
  { id: "5", timestamp: "2026-05-27 12:45:18", user: "System", action: "Login Failed (3 attempts)", module: "Authentication", target: "unknown@email.com", severity: "error", ip: "203.45.67.89" },
  { id: "6", timestamp: "2026-05-27 12:30:00", user: "Omar Youssef", action: "Incident Reported", module: "HSE", target: "INC-2026-0142", severity: "warning", ip: "192.168.1.90" },
  { id: "7", timestamp: "2026-05-27 11:55:22", user: "Sarah Khan", action: "Invoice Generated", module: "Finance", target: "INV-2026-4521", severity: "info", ip: "192.168.1.67" },
  { id: "8", timestamp: "2026-05-27 11:20:15", user: "Sameer Fahmi", action: "Role Deleted", module: "Security", target: "Temp Contractor", severity: "warning", ip: "192.168.1.45" },
  { id: "9", timestamp: "2026-05-27 10:45:08", user: "Layla Ibrahim", action: "PO Submitted", module: "Procurement", target: "PO-2026-0892", severity: "info", ip: "192.168.1.112" },
  { id: "10", timestamp: "2026-05-27 09:30:00", user: "System", action: "Backup Completed", module: "System", target: "Daily Backup", severity: "success", ip: "10.0.0.1" },
];

const severityConfig: Record<string, { icon: typeof Info; color: string }> = {
  info: { icon: Info, color: "text-blue-500" },
  success: { icon: CheckCircle, color: "text-emerald-500" },
  warning: { icon: AlertTriangle, color: "text-amber-500" },
  error: { icon: Shield, color: "text-red-500" },
};

export default function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");

  const filteredLogs = auditLogs.filter((log) => {
    const matchesSearch =
      log.user.toLowerCase().includes(search.toLowerCase()) ||
      log.action.toLowerCase().includes(search.toLowerCase()) ||
      log.target.toLowerCase().includes(search.toLowerCase());
    const matchesModule = !moduleFilter || moduleFilter === "all" || log.module === moduleFilter;
    const matchesSeverity = !severityFilter || severityFilter === "all" || log.severity === severityFilter;
    return matchesSearch && matchesModule && matchesSeverity;
  });

  const activeFilters = [moduleFilter, severityFilter].filter((f) => f && f !== "all").length;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-[1400px]">
        <ERPPageHeader
          title="Audit Logs"
          description="Track all system activities and security events"
          breadcrumbs={[
            { label: "Home", href: "/" },
            { label: "Administration", href: "/admin/users" },
            { label: "Audit Logs" },
          ]}
          actions={
            <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Export Logs
            </Button>
          }
        />

        {/* Summary badges */}
        <div className="flex gap-3 flex-wrap">
          <Badge variant="outline" className="text-xs gap-1.5 py-1 px-3">
            <Info className="h-3.5 w-3.5 text-blue-500" />
            {auditLogs.filter((l) => l.severity === "info").length} Info
          </Badge>
          <Badge variant="outline" className="text-xs gap-1.5 py-1 px-3">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
            {auditLogs.filter((l) => l.severity === "success").length} Success
          </Badge>
          <Badge variant="outline" className="text-xs gap-1.5 py-1 px-3">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            {auditLogs.filter((l) => l.severity === "warning").length} Warning
          </Badge>
          <Badge variant="outline" className="text-xs gap-1.5 py-1 px-3">
            <Shield className="h-3.5 w-3.5 text-red-500" />
            {auditLogs.filter((l) => l.severity === "error").length} Error
          </Badge>
        </div>

        <ERPSectionCard noPadding>
          <div className="px-5 pt-4 space-y-3">
            <ERPDataToolbar
              searchPlaceholder="Search by user, action, or target..."
              searchValue={search}
              onSearchChange={setSearch}
              showExport
            />
            <ERPFilterBar
              filters={[
                {
                  id: "module",
                  label: "Module",
                  value: moduleFilter,
                  onChange: setModuleFilter,
                  options: [
                    { label: "All Modules", value: "all" },
                    { label: "Administration", value: "Administration" },
                    { label: "Fleet", value: "Fleet" },
                    { label: "HR", value: "HR" },
                    { label: "Security", value: "Security" },
                    { label: "Authentication", value: "Authentication" },
                    { label: "HSE", value: "HSE" },
                    { label: "Finance", value: "Finance" },
                    { label: "Procurement", value: "Procurement" },
                    { label: "System", value: "System" },
                  ],
                },
                {
                  id: "severity",
                  label: "Severity",
                  value: severityFilter,
                  onChange: setSeverityFilter,
                  options: [
                    { label: "All Severities", value: "all" },
                    { label: "Info", value: "info" },
                    { label: "Success", value: "success" },
                    { label: "Warning", value: "warning" },
                    { label: "Error", value: "error" },
                  ],
                },
              ]}
              activeCount={activeFilters}
              onClearAll={() => { setModuleFilter(""); setSeverityFilter(""); }}
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/40">
                <TableHead className="text-xs font-semibold uppercase tracking-wider pl-5 w-10"></TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Timestamp</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">User</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Action</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Module</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Target</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">IP Address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => {
                const SeverityIcon = severityConfig[log.severity]?.icon || Info;
                const severityColor = severityConfig[log.severity]?.color || "text-muted-foreground";
                return (
                  <TableRow key={log.id} className="border-border/30 hover:bg-muted/30">
                    <TableCell className="pl-5">
                      <SeverityIcon className={`h-4 w-4 ${severityColor}`} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                        <Clock className="h-3 w-3" />
                        {log.timestamp}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-[9px] font-semibold bg-muted">
                            {log.user === "System" ? "SY" : log.user.split(" ").map((n) => n[0]).join("")}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-foreground">{log.user}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-medium text-foreground">{log.action}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] font-medium">{log.module}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">{log.target}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">{log.ip}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="px-5 py-3 border-t border-border/30 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {filteredLogs.length} of {auditLogs.length} entries
            </p>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled>Previous</Button>
              <Button variant="outline" size="sm" className="h-7 text-xs">Next</Button>
            </div>
          </div>
        </ERPSectionCard>
      </div>
    </AppLayout>
  );
}