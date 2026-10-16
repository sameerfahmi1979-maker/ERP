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
import { useRef, useState } from "react";
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
  uploaded: boolean | null;
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
        {label}{uploaded === null ? " — restricted" : ""}
      </span>
    </div>
  );
}

export function OrganizationBrandingSection(props: OrganizationBrandingSectionProps) {
  return <OrganizationBrandingSession key={props.companyId} {...props}/>;
}
function OrganizationBrandingSession({
  companyId,
  canManage,
}: OrganizationBrandingSectionProps) {
  const { openTab } = useWorkspace();
  const [profile, setProfile] = useState<OrgBrandingProfileSummary | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [isEnsuring, startEnsureTransition] = useTransition();
  const ensureFlight = useRef(false);
  const ensureOperation = useRef<string | null>(null);

  const loadProfile = useCallback(() => {
    setLoadError(false);
    setIsLoading(true);
    setRefresh(value => value + 1);
  }, []);

  useEffect(() => {
    if (companyId <= 0) return;
    let cancelled = false;
    // A pending read from another company must not keep this company in a
    // shared React transition or publish its stale response after navigation.
    void (async () => {
      try {
        const result = await getOrganizationBrandingProfile(companyId);
        if (cancelled) return;
        if (!result.success) { setLoadError(true); return; }
        setProfile(result.data ?? null);
      } catch { if (!cancelled) setLoadError(true); }
      finally { if (!cancelled) setIsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [companyId, refresh]);

  const handleEnsure = () => {
    if (!canManage || ensureFlight.current) return;
    ensureFlight.current = true;
    ensureOperation.current ??= crypto.randomUUID();
    startEnsureTransition(async () => {
      try {
      const result = await ensureOrgBrandingProfile(companyId,ensureOperation.current!);
      if (!result.success) {
        toast.error(result.error ?? "Failed to create branding profile");
        return;
      }
      toast.success(
        result.data?.wasNew
          ? "Default report branding profile created"
          : "Default report branding profile already exists"
      );
      if (result.warning) toast.warning(result.warning);
      ensureOperation.current = null;
      loadProfile();
      } catch { toast.error("Branding setup is unconfirmed. Retry to recover the same operation."); }
      finally { ensureFlight.current = false; }
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

  if (loadError && !isLoading) return <div role="alert" className="rounded border p-4"><p>Branding information could not be loaded. This does not mean a profile is missing.</p><Button type="button" variant="outline" onClick={loadProfile}>Try again</Button></div>;

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
                identity and permitted template selection must be reviewed before issuing documents.
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
              {(Object.entries(profile.assetStatus) as [AssetKey, boolean | null][]).map(
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
