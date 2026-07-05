/**
 * Reports Editor — Index Page
 * Phase: REPORT DESIGNER.3 — ERP Block Library Foundation
 *
 * Select a template to open in the visual editor.
 * Access: reports.manage or reports.view
 */

import { redirect } from "next/navigation";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { PenLine } from "lucide-react";

interface TemplateRow {
  id: number;
  template_name: string;
  template_code: string;
  template_type: string;
  governance_status: string;
  version_no: number;
}

export default async function ReportsEditorIndexPage() {
  const ctx = await getAuthContext();
  const canManage = hasPermission(ctx, "reports.manage");
  const canView = hasPermission(ctx, "reports.view");

  if (!canManage && !canView) {
    redirect("/admin/reports/templates");
  }

  const supabase = createAdminClient();
  const { data: templates } = await supabase
    .from("erp_report_templates")
    .select("id,template_name,template_code,template_type,governance_status,version_no")
    .is("deleted_at", null)
    .order("template_name", { ascending: true })
    .limit(50);

  const rows = (templates ?? []) as TemplateRow[];

  const governanceColors: Record<string, string> = {
    draft: "#854d0e",
    in_review: "#1e40af",
    approved: "#166534",
    published: "#15803d",
    rejected: "#991b1b",
    archived: "#374151",
  };

  const governanceBg: Record<string, string> = {
    draft: "#fef9c3",
    in_review: "#dbeafe",
    approved: "#dcfce7",
    published: "#f0fdf4",
    rejected: "#fee2e2",
    archived: "#f3f4f6",
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <PenLine className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold text-foreground">Reports Visual Editor</h1>
          <p className="text-sm text-muted-foreground">
            Select a template to open in the visual designer.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-12 text-center">
          <p className="text-sm text-muted-foreground mb-2">No report templates found.</p>
          <Link
            href="/admin/reports/templates"
            className="text-sm text-primary underline hover:no-underline"
          >
            Create a template in Templates &amp; Branding
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  background: "#f8fafc",
                  borderBottom: "1px solid #e2e8f0",
                  fontSize: "0.75rem",
                  color: "#6b7280",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600 }}>Name</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600 }}>Code</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600 }}>Type</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600 }}>Version</th>
                <th style={{ padding: "10px 16px", textAlign: "left", fontWeight: 600 }}>Status</th>
                <th style={{ padding: "10px 16px", textAlign: "right", fontWeight: 600 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t, i) => (
                <tr
                  key={t.id}
                  style={{
                    borderBottom: i < rows.length - 1 ? "1px solid #f1f5f9" : "none",
                    transition: "background 0.1s",
                  }}
                >
                  <td style={{ padding: "12px 16px", fontSize: "0.875rem", fontWeight: 500, color: "#111827" }}>
                    {t.template_name}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "0.8rem", color: "#6b7280", fontFamily: "monospace" }}>
                    {t.template_code}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "0.8rem", color: "#6b7280", textTransform: "capitalize" }}>
                    {t.template_type.replace(/_/g, " ")}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: "0.8rem", color: "#6b7280" }}>
                    v{t.version_no}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span
                      style={{
                        background: governanceBg[t.governance_status] ?? "#f3f4f6",
                        color: governanceColors[t.governance_status] ?? "#374151",
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: "9999px",
                        textTransform: "uppercase",
                      }}
                    >
                      {t.governance_status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <Link
                      href={`/admin/reports/editor/${t.id}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "5px 12px",
                        borderRadius: 6,
                        border: "1px solid #2563eb",
                        background: canManage && ["draft", "rejected"].includes(t.governance_status)
                          ? "#2563eb"
                          : "#eff6ff",
                        color: canManage && ["draft", "rejected"].includes(t.governance_status)
                          ? "#fff"
                          : "#2563eb",
                        fontSize: "0.8rem",
                        fontWeight: 500,
                        textDecoration: "none",
                        transition: "all 0.15s",
                      }}
                    >
                      <PenLine style={{ width: 13, height: 13 }} />
                      {canManage && ["draft", "rejected"].includes(t.governance_status)
                        ? "Edit"
                        : "View"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-4">
        Only <strong>draft</strong> and <strong>rejected</strong> templates can be edited.
        To create a new version, use the governance actions in{" "}
        <Link href="/admin/reports/templates" className="underline text-primary hover:no-underline">
          Templates &amp; Branding
        </Link>
        .
      </p>
    </div>
  );
}
