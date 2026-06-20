"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, FileText, Award, Shield, CreditCard, ClipboardList, CheckSquare, HardHat } from "lucide-react";

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
  canViewPayroll: boolean;
}

export function HrLetterGenerator({ employeeId, canViewPayroll }: HrLetterGeneratorProps) {
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
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {letters.map((letter) => (
          <div
            key={letter.reportCode}
            className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
              letter.hasPermission
                ? "bg-card hover:bg-muted/40 cursor-pointer"
                : "bg-muted/20 opacity-60 cursor-not-allowed"
            }`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="text-muted-foreground mt-0.5 shrink-0">{letter.icon}</div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{letter.label}</div>
                <div className="text-xs text-muted-foreground truncate">{letter.description}</div>
                {letter.requiresPermission && !letter.hasPermission && (
                  <Badge variant="outline" className="text-[10px] mt-1">Requires {letter.requiresPermission}</Badge>
                )}
              </div>
            </div>
            {letter.hasPermission && (
              <Link
                href={`/admin/reports/run/${letter.reportCode}?employee_id=${employeeId}`}
                className="ml-2 shrink-0"
              >
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                  <ExternalLink className="h-3 w-3" />
                  Generate
                </Button>
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
