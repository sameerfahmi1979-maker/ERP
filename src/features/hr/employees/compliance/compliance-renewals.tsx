"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { DmsLoadError } from "@/features/dms/dms-load-error";
import { useReadLifetime } from "@/hooks/use-read-lifetime";
import { hrReadIdentity } from "@/lib/reads/hr-read-identity";
import type { AuthContext } from "@/lib/rbac/check";
import type { ComplianceDmsRenewal } from "@/lib/hr/compliance/renewal-review";
import { readComplianceDmsRenewals } from "@/server/actions/hr/compliance-renewals";

const RenewalContext = createContext<ComplianceDmsRenewal[] | undefined>(undefined);

type EvidenceKey = {
  kind: ComplianceDmsRenewal["kind"];
  sourceId: number;
  category?: ComplianceDmsRenewal["category"];
};

const dependentLabels: Partial<Record<ComplianceDmsRenewal["category"], string>> = {
  "dependent-passport": "Passport",
  "dependent-eid": "Emirates ID",
  "dependent-visa": "Residence visa",
  "dependent-insurance": "Medical insurance",
};

function useDmsRenewal({ kind, sourceId, category }: EvidenceKey) {
  return useContext(RenewalContext)?.find(renewal =>
    renewal.kind === kind && renewal.sourceId === sourceId && (!category || renewal.category === category));
}

export function ComplianceRenewalEvidence({ children, ...key }: EvidenceKey & { children?: ReactNode }) {
  const renewal = useDmsRenewal(key);
  if (!renewal) return children;
  const label = dependentLabels[renewal.category];
  return (
    <div className="mt-1 space-y-0.5 text-xs">
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{label ? `${label} · Renewed in DMS` : "Renewed in DMS"}</span>
        {renewal.replacementExpiry && ` · DMS expiry ${format(parseISO(renewal.replacementExpiry), "dd MMM yyyy")}`}
      </p>
      <a href={`/dms/documents/record/${renewal.replacementId}?mode=view`} target="_blank" rel="noreferrer" className="break-words text-primary underline">
        {renewal.replacementNo} · {renewal.replacementTitle}
      </a>
    </div>
  );
}

export function OriginalEvidenceAction({ children, ...key }: EvidenceKey & { children: ReactNode }) {
  return useDmsRenewal(key) ? null : children;
}

type Props = { employeeId: number; authContext: AuthContext; children: ReactNode };

export function ComplianceRenewals({ employeeId, authContext, children }: Props) {
  const identity = hrReadIdentity(authContext);
  const lifetime = useReadLifetime(`hr-compliance-renewals:${identity}:${employeeId}`);
  const reviews = useQuery({
    queryKey: ["hr", "compliance", "document-renewals", identity, employeeId],
    enabled: lifetime.enabled,
    staleTime: 0,
    queryFn: async () => {
      const response = await readComplianceDmsRenewals(employeeId);
      if (!lifetime.active || !response.data) throw new Error("DMS renewal read unavailable");
      return response.data;
    },
  });

  return (
    <RenewalContext.Provider value={reviews.isError || !lifetime.enabled ? undefined : reviews.data}>
      {reviews.isError && <DmsLoadError subject="DMS renewals" retry={reviews.refetch} pending={reviews.isFetching} />}
      {children}
    </RenewalContext.Provider>
  );
}
