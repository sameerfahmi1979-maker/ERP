"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { BrandingAssetUploadCard } from "./branding-asset-upload-card";
import {
  getReportBrandingProfileAssets,
  type ReportBrandingAssetView,
} from "@/server/actions/branding/assets";
import type { ReportBrandingAssetType } from "@/lib/branding";

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
};

export function ReportBrandingAssetsSection({
  brandingProfileId,
  ownerCompanyId,
  canUpload,
}: ReportBrandingAssetsSectionProps) {
  const [assetsByType, setAssetsByType] = useState<
    Partial<Record<ReportBrandingAssetType, ReportBrandingAssetView>>
  >({});
  const [isLoading, startLoadTransition] = useTransition();

  const loadAssets = useCallback(() => {
    startLoadTransition(async () => {
      const result = await getReportBrandingProfileAssets(brandingProfileId);
      if (!result.success || !result.data) {
        setAssetsByType({});
        return;
      }
      const map: Partial<Record<ReportBrandingAssetType, ReportBrandingAssetView>> =
        {};
      for (const asset of result.data) {
        map[asset.assetType] = asset;
      }
      setAssetsByType(map);
    });
  }, [brandingProfileId]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  return (
    <div className="space-y-3">
      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading uploaded assets…</p>
      ) : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {REPORT_ASSET_DEFS.map((def) => {
          const view = assetsByType[def.type] ?? null;
          return (
            <BrandingAssetUploadCard
              key={def.type}
              scope="report"
              label={def.label}
              description={def.description}
              assetType={def.type}
              brandingProfileId={brandingProfileId}
              ownerCompanyId={ownerCompanyId}
              asset={
                view
                  ? {
                      id: view.id,
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
              onChanged={loadAssets}
            />
          );
        })}
      </div>
    </div>
  );
}
