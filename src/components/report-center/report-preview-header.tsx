"use client";

/**
 * ReportPreviewHeader
 * Phase REPORT.3 — Template / Branding / Output Adapter Engine
 *
 * Renders a branded on-screen preview of the resolved template/branding context.
 * Used in report pages to show users what the output header will look like.
 * Generic — no hardcoded company names or logos.
 */

import { Badge } from "@/components/ui/badge";
import { Building2, FileText, Palette, Globe, Phone, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { ExportBrandingContext } from "@/lib/export";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportPreviewHeaderProps {
  /** Resolved branding context — all fields optional */
  branding?: ExportBrandingContext | null;
  /** Report title to display */
  reportTitle?: string;
  /** Report code from the registry */
  reportCode?: string;
  /** Generated date/time (defaults to now) */
  generatedAt?: Date;
  /** Show "Multi-company" badge when data spans multiple companies */
  isMultiCompany?: boolean;
  /** Show "Template selected" badge when a template was manually chosen */
  templateSelectedManually?: boolean;
  /** Additional CSS class for the wrapper */
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ReportPreviewHeader({
  branding,
  reportTitle,
  reportCode,
  generatedAt,
  isMultiCompany,
  templateSelectedManually,
  className,
}: ReportPreviewHeaderProps) {
  const primaryColor = branding?.themePrimaryColor ?? "#1e293b";
  const headerBg = branding?.themeHeaderBgColor ?? branding?.themePrimaryColor ?? "#1e293b";
  const headerTextColor = branding?.themeHeaderTextColor ?? "#ffffff";

  const companyName = branding?.companyNameEn;
  const logoUrl = branding?.showLogo ? branding.logoUrl : null;
  const footerText = branding?.footerTextEn ?? "ERP Report";

  const isNeutral = !branding || branding.isNeutralProfile || !companyName;

  return (
    <div
      className={cn("rounded-lg border overflow-hidden shadow-sm bg-white", className)}
      aria-label="Report preview header"
    >
      {/* ── Company header bar ─────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ backgroundColor: headerBg, color: headerTextColor }}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Logo"
            className="h-10 max-w-[120px] object-contain"
            onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
          />
        ) : (
          <div className="h-10 w-10 rounded flex items-center justify-center bg-white/10">
            <Building2 className="h-5 w-5" style={{ color: headerTextColor }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm truncate" style={{ color: headerTextColor }}>
            {companyName ?? "ERP Report System"}
          </p>
          {branding?.addressBlockEn && branding.showAddress && (
            <p className="text-[10px] opacity-80 truncate" style={{ color: headerTextColor }}>
              {branding.addressBlockEn}
            </p>
          )}
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {isNeutral && (
            <Badge variant="outline" className="text-[10px] bg-white/10 border-white/30 text-white">
              Neutral
            </Badge>
          )}
          {branding?.isGroupProfile && (
            <Badge variant="outline" className="text-[10px] bg-white/10 border-white/30 text-white">
              Group
            </Badge>
          )}
          {isMultiCompany && (
            <Badge variant="outline" className="text-[10px] bg-amber-500/20 border-amber-400/40 text-amber-100">
              Multi-company
            </Badge>
          )}
          {templateSelectedManually && (
            <Badge variant="outline" className="text-[10px] bg-emerald-500/20 border-emerald-400/40 text-emerald-100">
              Template selected
            </Badge>
          )}
        </div>
      </div>

      {/* ── Report title block ─────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b" style={{ borderColor: primaryColor + "30" }}>
        <div className="flex items-start gap-2">
          <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">
              {reportTitle ?? "Report Preview"}
            </p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {reportCode && (
                <span className="text-xs text-muted-foreground font-mono">{reportCode}</span>
              )}
              {branding?.templateName && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Palette className="h-3 w-3" />
                  {branding.templateName}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                Generated: {format(generatedAt ?? new Date(), "yyyy-MM-dd HH:mm")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Legal / TRN / contact block ────────────────────────────────────── */}
      {(branding?.trn || branding?.tradeLicenseNo || branding?.phone || branding?.email) && (
        <div className="px-4 py-2 bg-muted/30 flex flex-wrap gap-x-4 gap-y-1">
          {branding.trn && branding.showTrn && (
            <span className="text-[10px] text-muted-foreground">TRN: {branding.trn}</span>
          )}
          {branding.tradeLicenseNo && branding.showLicense && (
            <span className="text-[10px] text-muted-foreground">License: {branding.tradeLicenseNo}</span>
          )}
          {branding.phone && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Phone className="h-2.5 w-2.5" />
              {branding.phone}
            </span>
          )}
          {branding.email && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Mail className="h-2.5 w-2.5" />
              {branding.email}
            </span>
          )}
        </div>
      )}

      {/* ── Footer strip ───────────────────────────────────────────────────── */}
      <div
        className="px-4 py-1.5 text-center"
        style={{ borderTop: `1px solid ${primaryColor}20` }}
      >
        <p className="text-[10px] text-muted-foreground">{footerText}</p>
      </div>
    </div>
  );
}
