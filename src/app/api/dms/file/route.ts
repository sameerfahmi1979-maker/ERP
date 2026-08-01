export const runtime = "nodejs";

import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { checkDocumentConfidentialityAccess } from "@/server/actions/dms/document-files";

/**
 * GET /api/dms/file?fileId={id}&disposition={inline|attachment}
 *
 * Proxies a DMS file through Next.js so that:
 *  - Content-Type  comes from the DB mime_type field (not the storage object key)
 *  - Content-Disposition carries the human-readable file_name from the DB
 *    (browser "Save As" uses the disposition filename, not the storage path basename)
 *  - disposition=inline  -> displayed in browser PDF viewer / image viewer
 *  - disposition=attachment -> forced download with correct filename and extension
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = req.nextUrl;
    const fileIdRaw = searchParams.get("fileId");
    const dispositionParam = searchParams.get("disposition") ?? "inline";

    if (!fileIdRaw || isNaN(Number(fileIdRaw))) {
      return NextResponse.json({ error: "Invalid fileId" }, { status: 400 });
    }

    const fileId = Number(fileIdRaw);
    const forceAttachment = dispositionParam === "attachment";

    // Auth
    const ctx = await getAuthContext();
    if (!ctx.profile) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const requiredPermission = forceAttachment ? "dms.documents.download" : "dms.documents.preview";
    const hasAccess =
      hasPermission(ctx, requiredPermission) || hasPermission(ctx, "dms.admin");

    if (!hasAccess) {
      return NextResponse.json(
        { error: `Permission denied: requires ${requiredPermission}` },
        { status: 403 }
      );
    }

    // File record
    const supabase = await createClient();
    const { data: file, error: fileError } = await supabase
      .from("dms_document_files")
      .select("id, document_id, storage_bucket, storage_path, file_name, mime_type")
      .eq("id", fileId)
      .is("deleted_at", null)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Confidentiality check
    const access = await checkDocumentConfidentialityAccess(
      supabase,
      file.document_id as number,
      ctx
    );
    if (!access.allowed) {
      return NextResponse.json(
        { error: access.error ?? "Document access is restricted." },
        { status: 403 }
      );
    }

    // Fetch from Supabase storage via admin client
    const adminClient = createAdminClient();
    const { data: blob, error: downloadError } = await adminClient.storage
      .from(file.storage_bucket as string)
      .download(file.storage_path as string);

    if (downloadError || !blob) {
      return NextResponse.json(
        { error: downloadError?.message ?? "Failed to fetch file from storage" },
        { status: 502 }
      );
    }

    // Build response with correct headers
    const mimeType =
      (file.mime_type as string | null)?.split(";")[0].trim() || "application/octet-stream";
    const disposition = forceAttachment ? "attachment" : "inline";
    const fileName = (file.file_name as string) || "document";
    // RFC 5987 encoding handles Unicode/Arabic filenames correctly
    const encodedName = encodeURIComponent(fileName).replace(/'/g, "%27");

    const headers = new Headers({
      "Content-Type": mimeType,
      "Content-Disposition": `${disposition}; filename="${fileName.replace(/"/g, '\\"')}"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });

    return new NextResponse(blob, { status: 200, headers });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
