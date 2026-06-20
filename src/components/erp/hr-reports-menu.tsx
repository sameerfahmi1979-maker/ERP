"use client";

import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BarChart3, ChevronDown } from "lucide-react";

export interface HrReportLink {
  reportCode: string;
  label: string;
}

interface HrReportsMenuProps {
  reports: HrReportLink[];
  label?: string;
  employeeId?: number;
}

export function HrReportsMenu({ reports, label = "Reports", employeeId }: HrReportsMenuProps) {
  const router = useRouter();

  if (reports.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 h-8 text-xs font-medium shadow-xs hover:bg-accent hover:text-accent-foreground transition-colors">
        <BarChart3 className="h-3.5 w-3.5" />
        {label}
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">HR Reports</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {reports.map((r) => {
            const params = new URLSearchParams();
            if (employeeId) params.set("employee_id", String(employeeId));
            const href = `/admin/reports/run/${r.reportCode}${params.size ? `?${params}` : ""}`;
            return (
              <DropdownMenuItem key={r.reportCode} onClick={() => router.push(href)}>
                {r.label}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push("/admin/reports?module=HR")} className="text-xs text-muted-foreground">
            View all HR reports →
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
