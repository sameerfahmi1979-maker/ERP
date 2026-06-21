"use client";

import { useQueryClient } from "@tanstack/react-query";
import { HrSettingsLookupPage } from "@/features/hr/settings/hr-settings-lookup-page";
import { invalidateHrLeaveTypes } from "@/lib/query/invalidation";
import type { HrSettingsRow, ActionResult } from "@/server/actions/hr/settings";

type Props = {
  initialData: HrSettingsRow[];
  canManage: boolean;
  onList: (params: { search?: string; is_active?: boolean }) => Promise<ActionResult<{ data: HrSettingsRow[]; total: number }>>;
  onCreate: (input: {
    code: string;
    name_en: string;
    name_ar?: string | null;
    description?: string | null;
    is_active: boolean;
    sort_order: number;
  }) => Promise<ActionResult<{ id: number }>>;
  onUpdate: (
    id: number,
    input: Partial<{
      code: string;
      name_en: string;
      name_ar?: string | null;
      description?: string | null;
      is_active: boolean;
      sort_order: number;
    }>
  ) => Promise<ActionResult>;
  onToggle: (id: number, is_active: boolean) => Promise<ActionResult>;
};

export function HrLeaveTypesSettingsPageClient({
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
