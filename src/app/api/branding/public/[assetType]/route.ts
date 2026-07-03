import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BRANDING_STORAGE_BUCKET, DEFAULT_APP_BRANDING_SETTINGS_CODE } from "@/lib/branding/constants";
import { isPublicAppAssetType } from "@/lib/branding/runtime-types";

export const dynamic = "force-dynamic";

/**
 * Public read proxy for app-scoped branding assets (login logo, favicon, etc.).
 * No authentication required. Only serves active app assets — never report/stamp/signature.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ assetType: string }> }
) {
  const { assetType } = await context.params;

  if (!isPublicAppAssetType(assetType)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const admin = createAdminClient();

    const { data: settings } = await admin
      .from("erp_app_branding_settings")
      .select("id")
      .eq("settings_code", DEFAULT_APP_BRANDING_SETTINGS_CODE)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (!settings) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: asset } = await admin
      .from("erp_branding_assets")
      .select("storage_bucket, storage_path, mime_type, version_no")
      .eq("asset_scope", "app")
      .eq("app_settings_id", settings.id)
      .eq("asset_type", assetType)
      .eq("is_active", true)
      .is("deleted_at", null)
      .maybeSingle();

    if (!asset?.storage_path) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const bucket = (asset.storage_bucket as string) || BRANDING_STORAGE_BUCKET;
    const { data: fileData, error: downloadError } = await admin.storage
      .from(bucket)
      .download(asset.storage_path as string);

    if (downloadError || !fileData) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const mimeType = (asset.mime_type as string) || "application/octet-stream";
    const versionNo = asset.version_no as number;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "X-Branding-Asset-Version": String(versionNo),
      },
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
