"use client";

/**
 * Organization Workspace — Report Branding Section
 * Phase: BRANDING.3 — Organization and Company Branding Linkage
 *
 * Shows the linked default report branding profile, asset status, and
 * a shortcut to Templates & Branding. Also allows ensuring/creating the
 * default profile if it doesn't exist yet.
 */

import { useCallback, useEffect, useTransition } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Palette, CheckCircle2, XCircle, ExternalLink, RefreshCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getOrganizationBrandingProfile,
  ensureOrgBrandingProfile,
  type OrgBrandingProfileSummary,
} from "@/server/actions/organizations";
import { useWorkspace } from "@/hooks/use-workspace";

type OrganizationBrandingSectionProps = {
  companyId: number;
  canManage: boolean;
};

type AssetKey = keyof OrgBrandingProfileSummary["assetStatus"];

const ASSET_LABELS: Record<AssetKey, string> = {
  report_logo: "Logo",
  report_logo_small: "Small Logo",
  stamp: "Stamp",
  signature: "Signature",
  watermark: "Watermark",
  letterhead_background: "Letterhead BG",
};

function AssetStatusDot({
  uploaded,
  label,
}: {
  uploaded: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {uploaded ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
      )}
      <span className={cn("text-xs", uploaded ? "text-foreground" : "text-muted-foreground")}>
        {label}
      </span>
    </div>
  );
}

export function OrganizationBrandingSection({
  companyId,
  canManage,
}: OrganizationBrandingSectionProps) {
  const { openTab } = useWorkspace();
  const [profile, setProfile] = useState<OrgBrandingProfileSummary | null | undefined>(undefined);
  const [isLoading, startLoadTransition] = useTransition();
  const [isEnsuring, startEnsureTransition] = useTransition();

  const loadProfile = useCallback(() => {
    startLoadTransition(async () => {
      const result = await getOrganizationBrandingProfile(companyId);
      setProfile(result.success ? result.data ?? null : null);
    });
  }, [companyId]);

  useEffect(() => {
    if (companyId > 0) loadProfile();
  }, [companyId, loadProfile]);

  const handleEnsure = () => {
    startEnsureTransition(async () => {
      const result = await ensureOrgBrandingProfile(companyId);
      if (!result.success) {
        toast.error(result.error ?? "Failed to create branding profile");
        return;
      }
      toast.success(
        result.data?.wasNew
          ? "Default report branding profile created"
          : "Default report branding profile already exists"
      );
      loadProfile();
    });
  };

  const handleOpenTemplates = () => {
    openTab({
      id: "admin.reports.templates",
      title: "Templates & Branding",
      route: "/admin/reports/templates",
    });
  };

  if (companyId <= 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Save the organization first to manage report branding.
      </p>
    );
  }

  if (profile === undefined || isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading branding profile…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {profile === null ? (
        // ── No profile yet ──────────────────────────────────────────────────
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                No default report branding profile
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                This company does not have a linked default report branding profile. Report
                headers, logos, and letterheads will use a neutral fallback until one is
                created.
              </p>
            </div>
          </div>
          {canManage ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={isEnsuring}
              onClick={handleEnsure}
            >
              <Palette className="h-3.5 w-3.5" />
              {isEnsuring ? "Creating…" : "Create Default Branding Profile"}
            </Button>
          ) : null}
        </div>
      ) : (
        // ── Profile summary ─────────────────────────────────────────────────
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Palette className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">{profile.profileName}</p>
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  {profile.profileCode}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {profile.isDefault ? (
                <Badge variant="secondary" className="text-[10px]">
                  Default for company
                </Badge>
              ) : null}
            </div>
          </div>

          {/* Asset status grid */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Uploaded Assets</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.entries(profile.assetStatus) as [AssetKey, boolean][]).map(
                ([key, uploaded]) => (
                  <AssetStatusDot key={key} uploaded={uploaded} label={ASSET_LABELS[key]} />
                )
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={handleOpenTemplates}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Manage in Templates &amp; Branding
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-muted-foreground"
              disabled={isLoading}
              onClick={loadProfile}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
