"use client";

import { useQueryClient } from "@tanstack/react-query";
import { HrSettingsLookupPage,type HrSettingsLookupProps } from "@/features/hr/settings/hr-settings-lookup-page";
import { invalidateHrLeaveTypes } from "@/lib/query/invalidation";
type Props = Omit<HrSettingsLookupProps,'title'|'description'|'breadcrumbs'>;

export function HrLeaveTypesSettingsPageClient({
  entity,principalId,
  initialData,
  canManage,
  onList,
  onCreate,
  onUpdate,
  onToggle,
}: Props) {
  const qc = useQueryClient();

  return (
    <HrSettingsLookupPage
      entity={entity} principalId={principalId}
      title="Leave Types"
      description="Types of employee leave: annual, sick, emergency, maternity, paternity, business trip, etc."
      breadcrumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "HR Settings", href: "/admin/hr/settings" },
        { label: "Leave Types" },
      ]}
      initialData={initialData}
      canManage={canManage}
      onList={onList}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onToggle={onToggle}
      onAfterMutate={() => invalidateHrLeaveTypes(qc)}
    />
  );
}
