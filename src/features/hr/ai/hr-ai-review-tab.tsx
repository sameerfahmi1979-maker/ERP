"use client";

/**
 * HR.12 — HR AI Review Tab
 *
 * Main AI Review tab inside the Employee Profile workspace.
 * Renders all HR AI sub-panels based on permissions and feature flags.
 *
 * Safety rules (enforced):
 * - No AI output saves automatically.
 * - All suggestions are ephemeral / review-and-copy.
 * - Sensitive panels gated by specific permissions.
 * - Feature flags checked server-side before any AI call.
 */

import { useState } from "react";
import { Brain, FileText, AlertCircle, Shield, Zap, Copy, Activity, FileEdit } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { HrAiFillPanel } from "./hr-ai-fill-panel";
import { HrAiCorrectionsPanel } from "./hr-ai-corrections-panel";
import { HrAiCompliancePanel } from "./hr-ai-compliance-panel";
import { HrAiReadinessPanel } from "./hr-ai-readiness-panel";
import { HrAiDuplicatesPanel } from "./hr-ai-duplicates-panel";
import { HrAiLetterPanel } from "./hr-ai-letter-panel";
import { HrAiActivityPanel } from "./hr-ai-activity-panel";

// ── Permission helper ─────────────────────────────────────────────────────────

function checkPermission(ctx: AuthContext, code: string): boolean {
  return (
    ctx.permissionCodes.includes(code) ||
    ctx.roleCodes.includes("system_admin") ||
    ctx.roleCodes.includes("group_admin")
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface HrAiReviewTabProps {
  employeeId: number;
  authContext: AuthContext;
}

// ── Section config ────────────────────────────────────────────────────────────

type SectionId =
  | "fill"
  | "corrections"
  | "compliance"
  | "readiness"
  | "duplicates"
  | "letter"
  | "activity";

const SECTIONS: {
  id: SectionId;
  label: string;
  icon: React.ElementType;
  description: string;
}[] = [
  { id: "fill",        label: "Fill from Documents", icon: FileText,   description: "AI field suggestions from linked DMS documents" },
  { id: "corrections", label: "Profile Corrections",  icon: AlertCircle, description: "AI data quality review and missing field detection" },
  { id: "compliance",  label: "Compliance",           icon: Shield,     description: "AI compliance status explanation" },
  { id: "readiness",   label: "Readiness",            icon: Zap,        description: "AI operations readiness explanation" },
  { id: "duplicates",  label: "Duplicate Check",      icon: Copy,       description: "Detect possible duplicate employee records" },
  { id: "letter",      label: "Letter / Email Draft", icon: FileEdit,   description: "AI-drafted HR correspondence for review" },
  { id: "activity",    label: "AI Activity",          icon: Activity,   description: "Recent HR AI activity log for this employee" },
];

// ── Main component ────────────────────────────────────────────────────────────

export function HrAiReviewTab({ employeeId, authContext }: HrAiReviewTabProps) {
  const [activeSection, setActiveSection] = useState<SectionId>("fill");

  const canAiView = checkPermission(authContext, "hr.ai.view");
  const canAiUse  = checkPermission(authContext, "hr.ai.use");
  const canPayroll = checkPermission(authContext, "hr.payroll.view");
  const canActions = checkPermission(authContext, "hr.actions.view");

  if (!canAiView && !canAiUse) {
    return (
      <div className="p-6">
        <div className="rounded-lg border bg-muted/30 p-8 text-center">
          <Brain className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">AI Review Unavailable</p>
          <p className="text-xs text-muted-foreground mt-1">
            Your account does not have HR AI access (<code>hr.ai.view</code> or <code>hr.ai.use</code>).
          </p>
        </div>
      </div>
    );
  }

  const activeConfig = SECTIONS.find((s) => s.id === activeSection)!;

  return (
    <div className="flex min-h-0 flex-col gap-0">
      {/* Header */}
      <div className="p-4 border-b bg-muted/20">
        <div className="flex items-center gap-2 mb-1">
          <Brain className="h-4 w-4 text-violet-500" />
          <h3 className="text-sm font-semibold">HR AI Review</h3>
          <span className="ml-auto text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-medium">
            Review Mode — No Auto-Save
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          AI suggestions are for human review only. Nothing is saved or applied automatically.
        </p>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left nav */}
        <div className="w-44 shrink-0 border-r bg-muted/10 p-2 space-y-0.5">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors",
                activeSection === id
                  ? "bg-violet-100 text-violet-700 font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          <div className="mb-3">
            <p className="text-xs font-medium">{activeConfig.label}</p>
            <p className="text-[10px] text-muted-foreground">{activeConfig.description}</p>
          </div>
          <Separator className="mb-3" />

          {activeSection === "fill" && (
            <HrAiFillPanel employeeId={employeeId} canUse={canAiUse} />
          )}
          {activeSection === "corrections" && (
            <HrAiCorrectionsPanel employeeId={employeeId} canUse={canAiUse} />
          )}
          {activeSection === "compliance" && (
            <HrAiCompliancePanel employeeId={employeeId} canUse={canAiUse} />
          )}
          {activeSection === "readiness" && (
            <HrAiReadinessPanel employeeId={employeeId} canUse={canAiUse} />
          )}
          {activeSection === "duplicates" && (
            <HrAiDuplicatesPanel employeeId={employeeId} canUse={canAiUse} />
          )}
          {activeSection === "letter" && (
            <HrAiLetterPanel
              employeeId={employeeId}
              canUse={canAiUse}
              canViewPayroll={canPayroll}
              canViewActions={canActions}
            />
          )}
          {activeSection === "activity" && (
            <HrAiActivityPanel employeeId={employeeId} canView={canAiView || canAiUse} />
          )}
        </div>
      </div>
    </div>
  );
}
