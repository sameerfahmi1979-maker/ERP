"use client";

import { useRef, useTransition, useState } from "react";

import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import Image from "next/image";

import { toast } from "sonner";

import { Upload, Trash2, ImageOff } from "lucide-react";

import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";

import {

  uploadBrandingAsset,

  deactivateBrandingAsset,

} from "@/server/actions/branding/assets";

import type {

  BrandingAssetScope,

  BrandingAssetType,

} from "@/lib/branding";

import { MAX_BRANDING_FILE_SIZE_BYTES } from "@/lib/branding/constants";

export type BrandingAssetUploadView = {
  id: number;

  originalFilename?: string | null;

  mimeType?: string;

  fileSizeBytes?: number | null;

  versionNo: number;

  updatedAt: string;

  previewUrl?: string | null;

};

type BrandingAssetUploadCardProps = {

  label: string;

  description: string;

  assetType: BrandingAssetType;

  scope?: BrandingAssetScope;

  appSettingsId?: number;

  brandingProfileId?: number;

  ownerCompanyId?: number | null;

  asset: BrandingAssetUploadView | null;

  canUpload: boolean;

  required?: boolean;

  accept?: string;

  onChanged?: () => void;

};

function formatBytes(bytes: number | null | undefined): string {

  if (!bytes) return "—";

  if (bytes < 1024) return `${bytes} B`;

  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

}

function uploadPermissionHint(scope: BrandingAssetScope): string {

  if (scope === "app") {

    return "Upload requires branding.assets.upload and branding.app.manage.";

  }

  return "Upload requires branding.assets.upload and reports.manage.";

}

export function BrandingAssetUploadCard({

  label,

  description,

  assetType,

  scope = "app",

  appSettingsId,

  brandingProfileId,

  ownerCompanyId,

  asset,

  canUpload,

  required = false,

  accept = "image/png,image/jpeg,image/jpg,image/webp,image/x-icon,image/vnd.microsoft.icon",

  onChanged,

}: BrandingAssetUploadCardProps) {

  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const flight = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [isPending, startTransition] = useTransition();

  const handleUpload = (file: File) => {
    if (!canUpload || flight.current) return;
    setError(null);

    if (scope === "app" && !appSettingsId) {

      setError("App settings ID is missing");

      return;

    }

    if (scope === "report" && !brandingProfileId) {

      setError("Save the branding profile before uploading assets");

      return;

    }

    if (file.size > MAX_BRANDING_FILE_SIZE_BYTES) {

      setError("File exceeds maximum size of 10 MB");

      return;

    }

    flight.current = true;
    startTransition(async () => {
      try {

      const formData = new FormData();

      formData.append("file", file);

      formData.append(

        "metadata",

        JSON.stringify({

          assetScope: scope,

          assetType,

          ...(scope === "app"

            ? { appSettingsId }

            : { brandingProfileId, ownerCompanyId: ownerCompanyId ?? null }),

        })

      );

      const result = await uploadBrandingAsset(formData);

      if (!result.success) {

        setError(result.error ?? "Upload failed");

        return;

      }

      toast.success(`${label} uploaded`);

      onChanged?.();
      } catch { setError("This change could not be confirmed. Check the asset before trying again."); }
      finally { flight.current = false; }
    });

  };

  const handleDeactivate = () => {

    if (!asset || !canUpload || flight.current) return;
    setError(null);

    flight.current = true;
    startTransition(async () => {
      try {

      const result = await deactivateBrandingAsset(asset.id);

      if (!result.success) {

        setError(result.error ?? "Could not deactivate asset");

        return;

      }

      setConfirmRemove(false);
      toast.success(`${label} deactivated`);

      onChanged?.();
      } catch { setError("This change could not be confirmed. Check the asset before trying again."); }
      finally { flight.current = false; }
    });

  };

  const previewUrl = asset?.previewUrl ?? null;

  const showImagePreview =

    previewUrl &&

    asset?.mimeType !== "image/x-icon" &&

    asset?.mimeType !== "image/vnd.microsoft.icon";

  return (

    <div aria-busy={isPending} className="rounded-sm border border-border bg-card p-4 flex flex-col gap-3">

      <div className="flex items-start justify-between gap-3">

        <div>

          <p className="text-sm font-medium text-foreground">

            {label}

            {required ? <span className="text-destructive ml-1">*</span> : null}

          </p>

          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>

        </div>

        {required && !asset ? (

          <span className="text-[10px] uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 shrink-0">

            Missing

          </span>

        ) : null}

      </div>

      <div

        className={cn(

          "relative flex items-center justify-center rounded-md border border-dashed border-border/80 bg-muted/20 overflow-hidden",

          showImagePreview ? "h-28" : "h-20"

        )}

      >

        {showImagePreview ? (

          <Image

            src={previewUrl}

            alt={label}

            fill

            unoptimized

            className="object-contain p-2"

          />

        ) : previewUrl && asset?.mimeType?.includes("icon") ? (

          <div className="flex items-center gap-2 text-xs text-muted-foreground">

            { }

            <Image src={previewUrl} alt={label} width={32} height={32} unoptimized className="h-8 w-8" />

            <span>Icon uploaded</span>

          </div>

        ) : (

          <div className="flex flex-col items-center gap-1 text-muted-foreground">

            <ImageOff className="h-5 w-5 opacity-60" />

            <span className="text-xs">No asset uploaded</span>

          </div>

        )}

      </div>

      {asset ? (

        <div className="text-[11px] text-muted-foreground space-y-0.5">

          <p className="truncate">{asset.originalFilename ?? "Uploaded file"}</p>

          <p>

            {formatBytes(asset.fileSizeBytes)} · v{asset.versionNo} ·{" "}

            {new Date(asset.updatedAt).toLocaleDateString()}

          </p>

        </div>

      ) : (

        <p className="text-[11px] text-muted-foreground">PNG, JPG, or WebP recommended.</p>

      )}

      <div className="flex gap-2 mt-auto">

        <input

          ref={inputRef}

          type="file" aria-label={`Choose ${label} file`}

          accept={accept}

          className="hidden"

          onChange={(e) => {

            const file = e.target.files?.[0];

            if (file) handleUpload(file);

            e.target.value = "";

          }}

        />

        <Button

          type="button"

          size="sm"

          variant="outline"

          className="gap-1.5 flex-1"

          disabled={!canUpload || isPending}

          aria-label={`${asset ? "Replace" : "Upload"} ${label}`} onClick={() => inputRef.current?.click()}

        >

          <Upload className="h-3.5 w-3.5" />

          {asset ? "Replace" : "Upload"}

        </Button>

        {asset && canUpload ? (

          <Button

            type="button"

            size="sm"

            variant="ghost"

            className="text-muted-foreground hover:text-destructive"

            disabled={isPending}

            aria-label={`Deactivate ${label}`} onClick={() => setConfirmRemove(true)}

          >

            <Trash2 className="h-3.5 w-3.5" />

          </Button>

        ) : null}

      </div>

      {isPending && <p role="status" className="text-sm">Saving asset…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <AlertDialog open={confirmRemove} onOpenChange={value => { if (!isPending) setConfirmRemove(value); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Deactivate {label}?</AlertDialogTitle><AlertDialogDescription>The current asset will stop being used. Its history is retained.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={isPending}>Keep asset</AlertDialogCancel><AlertDialogAction disabled={isPending} onClick={event => {event.preventDefault();handleDeactivate();}}>Deactivate</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {!canUpload ? (

        <p className="text-[11px] text-muted-foreground">{uploadPermissionHint(scope)}</p>

      ) : null}

    </div>

  );

}


