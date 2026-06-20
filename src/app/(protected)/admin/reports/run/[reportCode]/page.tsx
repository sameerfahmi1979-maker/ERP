import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { redirect, notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReportRunPage } from "@/features/report-center/report-run-page";
import type { ReportRegistryEntry } from "@/lib/report-center/types";

type Props = {
  params: Promise<{ reportCode: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function ReportRunRoutePage({ params, searchParams }: Props) {
  const { reportCode } = await params;
  const sp = await searchParams;

  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "reports.view") && !hasPermission(ctx, "reports.run")) {
    redirect("/admin/reports");
  }

  // Load registry entry
  const db = createAdminClient();
  const { data: entry } = await db
    .from("erp_report_registry")
    .select("*")
    .eq("report_code", reportCode.toUpperCase())
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();

  if (!entry) notFound();

  const registryEntry = entry as ReportRegistryEntry;

  // Check that the user has at least one required permission
  const hasReportPermission = registryEntry.required_permissions.length === 0
    || registryEntry.required_permissions.some((p) => ctx.permissionCodes.includes(p));

  if (!hasReportPermission) {
    redirect("/admin/reports");
  }

  // Extract initial filters from search params (e.g. ?employee_id=123)
  const initialFilters: Record<string, string> = {};
  for (const [key, value] of Object.entries(sp)) {
    if (value && value !== "") {
      initialFilters[key] = value;
    }
  }

  return (
    <div className="flex flex-col h-full p-6 gap-0">
      <ReportRunPage
        registryEntry={registryEntry}
        initialFilters={initialFilters}
      />
    </div>
  );
}
