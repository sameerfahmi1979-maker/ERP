import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALLOWED_APP_BRANDING_MIME_TYPES, BRANDING_STORAGE_BUCKET, DEFAULT_APP_BRANDING_SETTINGS_CODE, MAX_BRANDING_FILE_SIZE_BYTES } from "@/lib/branding/constants";
import { isPublicAppAssetType } from "@/lib/branding/runtime-types";
import { hasCanonicalBrandingStorageIdentity } from "@/lib/branding/storage-paths";
import type { BrandingAsset } from "@/lib/branding/types";

export const dynamic = "force-dynamic";

const unavailable = (status: number) => NextResponse.json(
  { error: status === 404 ? "Not found" : status === 400 ? "Invalid asset version" : "Branding is temporarily unavailable" },
  { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
);

/** Anonymous public app images only. Never proxy report assets or arbitrary storage paths. */
export async function GET(request: Request, context: { params: Promise<{ assetType: string }> }) {
  const { assetType } = await context.params;
  if (!isPublicAppAssetType(assetType)) return unavailable(404);
  const versions = new URL(request.url).searchParams.getAll("v");
  const version = versions.length ? Number(versions[0]) : null;
  if (versions.length > 1 || (versions.length === 1 &&
      (!/^[1-9][0-9]*$/.test(versions[0]) || !Number.isSafeInteger(version)))) return unavailable(400);
  try {
    const admin = createAdminClient();
    const settings = await admin.from("erp_app_branding_settings").select("id")
      .eq("settings_code", DEFAULT_APP_BRANDING_SETTINGS_CODE).eq("is_active", true).is("deleted_at", null).maybeSingle();
    if (settings.error) return unavailable(503);
    if (!settings.data) return unavailable(404);
    let query = admin.from("erp_branding_assets").select("*")
      .eq("asset_scope", "app").eq("app_settings_id", settings.data.id)
      .eq("asset_type", assetType).is("deleted_at", null);
    // Old public logos in existing invitation emails keep their exact version.
    // Explicitly revoked assets do not become public merely because their ID is known.
    query = version === null ? query.eq("is_active", true)
      : query.eq("version_no", version).or("is_active.eq.true,replaced_by_asset_id.not.is.null");
    const selected = await query.maybeSingle();
    if (selected.error) return unavailable(503);
    const asset = selected.data as BrandingAsset | null;
    if (!asset || asset.asset_scope !== "app" || asset.app_settings_id !== settings.data.id ||
        asset.asset_type !== assetType || asset.deleted_at !== null ||
        (!asset.is_active && (version === null || !asset.replaced_by_asset_id)) ||
        (version !== null && asset.version_no !== version) ||
        !(ALLOWED_APP_BRANDING_MIME_TYPES as readonly string[]).includes(asset.mime_type) ||
        !hasCanonicalBrandingStorageIdentity(asset)) return unavailable(404);
    const downloaded = await admin.storage.from(BRANDING_STORAGE_BUCKET).download(asset.storage_path);
    if (downloaded.error || !downloaded.data) {
      return unavailable(String(downloaded.error?.statusCode) === "404" ? 404 : 503);
    }
    if (!downloaded.data.size || downloaded.data.size > MAX_BRANDING_FILE_SIZE_BYTES) return unavailable(404);
    const buffer = Buffer.from(await downloaded.data.arrayBuffer());
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": asset.mime_type,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": version === null ? "no-store" : "public, max-age=0, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Branding-Asset-Version": String(asset.version_no),
      },
    });
  } catch {
    return unavailable(503);
  }
}
