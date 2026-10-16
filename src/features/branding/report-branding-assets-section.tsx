"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BrandingAssetUploadCard } from "./branding-asset-upload-card";
import {
  getReportBrandingProfileAssets,
  type ReportBrandingAssetView,
} from "@/server/actions/branding/assets";
import type { ReportBrandingAssetType } from "@/lib/branding";
import type { BrandingAssetMutationResult } from "@/lib/branding/asset-save-contract";

const REPORT_ASSET_DEFS: {
  type: ReportBrandingAssetType;
  label: string;
  description: string;
}[] = [
  {
    type: "report_logo",
    label: "Report Logo",
    description: "Primary logo on report headers and PDF output.",
  },
  {
    type: "report_logo_small",
    label: "Small Logo",
    description: "Compact logo for footers or secondary placements.",
  },
  {
    type: "stamp",
    label: "Company Stamp",
    description: "Official stamp image (requires reports.sign to preview).",
  },
  {
    type: "signature",
    label: "Signatory Signature",
    description: "Signature image (requires reports.sign to preview).",
  },
  {
    type: "watermark",
    label: "Watermark Image",
    description: "Background watermark image for PDF and print output.",
  },
  {
    type: "letterhead_background",
    label: "Letterhead Background",
    description: "Full-page background image for letterhead-style output.",
  },
];

type ReportBrandingAssetsSectionProps = {
  brandingProfileId: number;
  ownerCompanyId?: number | null;
  canUpload: boolean;
  disabled?: boolean;
  disabledReason?: string;
  canSign?: boolean;
  parentRevision?: string;
  onChanged?: (receipt: NonNullable<BrandingAssetMutationResult["data"]>) => void;
  onPendingChange?: (pending: boolean) => void;
};

export function ReportBrandingAssetsSection(props: ReportBrandingAssetsSectionProps) {
  return <ReportBrandingAssetsSession key={`${props.brandingProfileId}:${props.ownerCompanyId ?? "shared"}`} {...props} />;
}

function ReportBrandingAssetsSession({
  brandingProfileId,
  ownerCompanyId,
  canUpload,
  disabled = false,
  disabledReason,
  canSign = false,
  parentRevision,
  onChanged,
  onPendingChange,
}: ReportBrandingAssetsSectionProps) {
  const [pendingType, setPendingType] = useState<ReportBrandingAssetType | null>(null);
  const pendingTypeRef = useRef<ReportBrandingAssetType | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<{
    profileId: number;
    status: "loading" | "ready" | "error";
    assets: Partial<Record<ReportBrandingAssetType, ReportBrandingAssetView>>;
  }>({profileId: brandingProfileId, status: "loading", assets: {}});

  const loadAssets = () => {
    setState({profileId: brandingProfileId, status: "loading", assets: {}});
    setRefresh(value => value + 1);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await getReportBrandingProfileAssets(brandingProfileId);
        if (cancelled) return;
        if (!result.success || !result.data) throw new Error("Unavailable");
        const assets: Partial<Record<ReportBrandingAssetType, ReportBrandingAssetView>> = {};
        for (const asset of result.data) {
          if (assets[asset.assetType]) throw new Error("Ambiguous active versions");
          assets[asset.assetType] = asset;
        }
        setState({profileId: brandingProfileId, status: "ready", assets});
      } catch {
        if (!cancelled) setState({profileId: brandingProfileId, status: "error", assets: {}});
      }
    })();
    return () => { cancelled = true; };
  }, [brandingProfileId, refresh]);

  if (state.profileId !== brandingProfileId || state.status === "loading") {
    return <p role="status" className="text-sm text-muted-foreground">Loading uploaded assets…</p>;
  }
  if (state.status === "error") {
    return <div role="alert" className="space-y-2 text-sm">
      <p>Branding assets are unavailable. Retry before uploading or replacing a file.</p>
      <Button type="button" variant="outline" onClick={loadAssets}>Retry branding assets</Button>
    </div>;
  }

  return (
    <div className="space-y-3">
      {!canSign && <p className="text-sm text-muted-foreground">Stamp and signature access is restricted. Separate signing permission for this company is required.</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {REPORT_ASSET_DEFS.map((def) => {
          if (!canSign && (def.type === "stamp" || def.type === "signature")) return null;
          const view = state.assets[def.type] ?? null;
          return (
            <BrandingAssetUploadCard
              key={def.type}
              scope="report"
              label={def.label}
              description={def.description}
              assetType={def.type}
              brandingProfileId={brandingProfileId}
              ownerCompanyId={ownerCompanyId}
              parentRevision={parentRevision}
              asset={
                view
                  ? {
                      id: view.id,
                      workspaceRevision: view.workspaceRevision,
                      originalFilename: view.originalFilename,
                      mimeType: view.mimeType,
                      fileSizeBytes: view.fileSizeBytes,
                      versionNo: view.versionNo,
                      updatedAt: view.updatedAt,
                      previewUrl: view.signedUrl,
                    }
                  : null
              }
              canUpload={canUpload}
              disabled={disabled || (pendingType !== null && pendingType !== def.type)}
              disabledReason={disabled ? disabledReason : undefined}
              onPendingChange={pending => {
                if (pending && pendingTypeRef.current !== null && pendingTypeRef.current !== def.type) return false;
                pendingTypeRef.current = pending ? def.type : null;
                setPendingType(pendingTypeRef.current); onPendingChange?.(pending);
                return true;
              }}
              onChanged={receipt => {loadAssets();onChanged?.(receipt);}}
            />
          );
        })}
      </div>
    </div>
  );
}
