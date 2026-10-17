"use client";

import type {AuthContext} from "@/lib/rbac/check";
import type {DmsEntityTypeValue} from "@/lib/dms/dms-entity-types";
import {useDmsEntityDocuments} from "@/hooks/use-dms-entity-documents";
import {Button} from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, AlertTriangle, Clock, ShieldAlert, ShieldX, FileX, Scale } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  authContext:AuthContext;
  entityType: string;
  entityId: number;
  className?: string;
  enabled?:boolean;
  onDenied?:()=>void;
};

function ComplianceCard({
  icon,
  label,
  value,
  variant,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  variant?: "default" | "warn" | "danger";
}) {
  return (
    <Card
      className={cn(
        "border",
        variant === "danger" && "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
        variant === "warn" && "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
      )}
    >
      <CardContent className="p-3 flex items-center gap-3">
        <div
          className={cn(
            "rounded-md p-2 shrink-0",
            variant === "danger" && "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
            variant === "warn" && "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
            !variant && "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
          )}
        >
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function DmsEntityDocumentComplianceCards({authContext,entityType,entityId,className,enabled=true,onDenied}:Props) {
  const read=useDmsEntityDocuments(authContext,{operation:"summary",entityType:entityType as DmsEntityTypeValue,entityId},{enabled,onDenied});
  const summary=read.data?.availability==="available"?read.data.summary:undefined;
  if(!enabled||read.denied||read.data?.availability==="unavailable")return <p role="status">Document compliance information is unavailable.</p>;
  if(read.isError)return <div role="alert">Compliance information could not be loaded. <Button type="button" onClick={read.retry}>Retry document compliance</Button></div>;
  if(read.data?.availability==="too_large")return <p role="alert">Compliance information exceeds the safe read budget. No partial totals are shown.</p>;
  if (read.isPending||read.isFetching) {
    return (
      <div className={cn("grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2", className)}>
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-md" />
        ))}
      </div>
    );
  }

  if (!summary) return null;

  return (
    <section aria-label="Linked document compliance">
    <p className="text-xs text-muted-foreground mb-2">Counts cover documents visible to you. Restricted means a complete authorized calculation is not available.</p>
    <div className={cn("grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2", className)}>
      <ComplianceCard
        icon={<FileText className="h-4 w-4" />}
        label="Total Documents"
        value={summary.totalDocuments}
      />
      <ComplianceCard
        icon={<AlertTriangle className="h-4 w-4" />}
        label="Expired"
        value={summary.expiredDocuments}
        variant={summary.expiredDocuments > 0 ? "danger" : undefined}
      />
      <ComplianceCard
        icon={<Clock className="h-4 w-4" />}
        label="Expiring Soon"
        value={summary.expiringSoonDocuments}
        variant={summary.expiringSoonDocuments > 0 ? "warn" : undefined}
      />
      <ComplianceCard
        icon={<FileX className="h-4 w-4" />}
        label="Missing Required"
        value={summary.missingRequiredDocuments??"Restricted"}
        variant={(summary.missingRequiredDocuments??0) > 0 ? "danger" : undefined}
      />
      <ComplianceCard
        icon={<Scale className="h-4 w-4" />}
        label="Open Findings"
        value={summary.openComplianceFindings??"Restricted"}
        variant={(summary.openComplianceFindings??0) > 0 ? "warn" : undefined}
      />
      <ComplianceCard
        icon={<ShieldAlert className="h-4 w-4" />}
        label="High Risk"
        value={summary.highRiskDocuments}
        variant={summary.highRiskDocuments > 0 ? "warn" : undefined}
      />
      <ComplianceCard
        icon={<ShieldX className="h-4 w-4" />}
        label="Critical Risk"
        value={summary.criticalRiskDocuments}
        variant={summary.criticalRiskDocuments > 0 ? "danger" : undefined}
      />
    </div>
    </section>
  );
}
