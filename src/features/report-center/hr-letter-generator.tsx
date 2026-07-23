"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Award,
  Shield,
  CreditCard,
  ClipboardList,
  CheckSquare,
  HardHat,
  Wand2,
  Download,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { LetterPreviewDialog } from "./letter-preview-dialog";
import { generateHrEmploymentLetterPdf } from "@/server/actions/pdf/generate-hr-letter";
import { toast } from "sonner";

export interface HrLetterType {
  reportCode: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  requiresPermission?: string;
  hasPermission: boolean;
}

interface HrLetterGeneratorProps {
  employeeId: number;
  employeeName?: string;
  canViewPayroll: boolean;
}

export function HrLetterGenerator({
  employeeId,
  employeeName,
  canViewPayroll,
}: HrLetterGeneratorProps) {
  const [selected, setSelected] = useState<{
    reportCode: string;
    label: string;
  } | null>(null);
  const [isPdfPending, startPdfTransition] = useTransition();
  const [pdfError, setPdfError] = useState<string | null>(null);

  const handleDownloadOfficialPdf = () => {
    setPdfError(null);
    startPdfTransition(async () => {
      const result = await generateHrEmploymentLetterPdf({ employeeId });
      if (!result.success) {
        setPdfError(result.error);
        if (result.gotenbergOffline) {
          toast.error("PDF generation requires Gotenberg service", {
            description: "Start it with: docker run --rm -p 3100:3000 gotenberg/gotenberg:8",
            duration: 8000,
          });
        } else {
          toast.error("PDF generation failed", { description: result.error });
        }
        return;
      }
      toast.success(`Employment Letter PDF ready (${result.pageCount} page${result.pageCount !== 1 ? "s" : ""})`, {
        description: "Opening download…",
      });
      window.open(result.downloadUrl, "_blank");
    });
  };

  const letters: HrLetterType[] = [
    {
      reportCode: "HR_EXPERIENCE_LETTER",
      label: "Experience Letter",
      description: "Official letter confirming employment and tenure",
      icon: <FileText className="h-4 w-4" />,
      hasPermission: true,
    },
    {
      reportCode: "HR_SALARY_CERT_GENERAL",
      label: "Salary Certificate (General)",
      description: "Employment certificate without salary amounts",
      icon: <Award className="h-4 w-4" />,
      hasPermission: true,
    },
    {
      reportCode: "HR_SALARY_CERT_WITH_AMOUNT",
      label: "Salary Certificate (with Amount)",
      description: "Certificate including basic and gross salary",
      icon: <Award className="h-4 w-4" />,
      requiresPermission: "hr.payroll.view",
      hasPermission: canViewPayroll,
    },
    {
      reportCode: "HR_NOC",
      label: "No Objection Certificate",
      description: "Standard NOC with masked passport details",
      icon: <Shield className="h-4 w-4" />,
      hasPermission: true,
    },
    {
      reportCode: "HR_EMPLOYEE_ID_CARD",
      label: "Employee ID Card",
      description: "Employee identity badge for printing",
      icon: <CreditCard className="h-4 w-4" />,
      hasPermission: true,
    },
    {
      reportCode: "HR_PPE_ISSUE_FORM",
      label: "PPE Issue Form",
      description: "Official PPE issuance form with signature",
      icon: <HardHat className="h-4 w-4" />,
      hasPermission: true,
    },
    {
      reportCode: "HR_JOINING_CHECKLIST",
      label: "Joining Checklist",
      description: "Standard onboarding checklist for new employees",
      icon: <ClipboardList className="h-4 w-4" />,
      hasPermission: true,
    },
    {
      reportCode: "HR_CLEARANCE_FORM",
      label: "Clearance Form",
      description: "Employee clearance form with department sign-offs",
      icon: <CheckSquare className="h-4 w-4" />,
      hasPermission: true,
    },
  ];

  return (
    <>
      <div className="space-y-3">
        {/* ─── Official PDF Generation (Gotenberg) ──────────────────────── */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-primary">
                  <FileText className="h-4 w-4" />
                </div>
                <span className="text-sm font-semibold text-foreground">
                  Employment Letter (Official PDF)
                </span>
                <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                  Gotenberg
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Server-rendered PDF via Gotenberg — stored + versioned in document history.
                Requires Gotenberg service running.
              </p>
              {pdfError && (
                <div className="flex items-start gap-1.5 mt-1.5 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{pdfError}</span>
                </div>
              )}
            </div>
            <Button
              variant="default"
              size="sm"
              className="ml-2 shrink-0 h-7 text-xs gap-1 bg-primary"
              onClick={handleDownloadOfficialPdf}
              disabled={isPdfPending}
            >
              {isPdfPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Download className="h-3 w-3" />
              )}
              {isPdfPending ? "Generating…" : "Download PDF"}
            </Button>
          </div>
        </div>

        {/* ─── Report Center Letters ─────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {letters.map((letter) => (
            <div
              key={letter.reportCode}
              className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                letter.hasPermission
                  ? "bg-card hover:bg-muted/40"
                  : "bg-muted/20 opacity-60 cursor-not-allowed"
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="text-muted-foreground mt-0.5 shrink-0">
                  {letter.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {letter.label}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {letter.description}
                  </div>
                  {letter.requiresPermission && !letter.hasPermission && (
                    <Badge variant="outline" className="text-[10px] mt-1">
                      Requires {letter.requiresPermission}
                    </Badge>
                  )}
                </div>
              </div>
              {letter.hasPermission && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-2 shrink-0 h-7 text-xs gap-1"
                  onClick={() =>
                    setSelected({
                      reportCode: letter.reportCode,
                      label: letter.label,
                    })
                  }
                >
                  <Wand2 className="h-3 w-3" />
                  Generate
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      <LetterPreviewDialog
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        reportCode={selected?.reportCode ?? ""}
        reportLabel={selected?.label ?? ""}
        employeeId={employeeId}
        employeeName={employeeName}
      />
    </>
  );
}
