export const runtime = "nodejs";

import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { checkDocumentConfidentialityAccess } from "@/lib/dms/document-access";

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

    if (!fileIdRaw || !/^\d+$/.test(fileIdRaw) || !Number.isSafeInteger(Number(fileIdRaw)) || Number(fileIdRaw) <= 0 || !["inline", "attachment"].includes(dispositionParam)) {
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
      ctx,
      requiredPermission
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
        { error: "The file could not be retrieved. Please retry." },
        { status: 502 }
      );
    }

    // Storage I/O is outside the authorization transaction. Recheck current
    // access and the exact binding before returning bytes; a revoked session or
    // concurrent metadata transfer must not use the earlier successful check.
    const current = await supabase.from("dms_document_files")
      .select("id,document_id,storage_bucket,storage_path,mime_type,file_name")
      .eq("id", fileId).is("deleted_at", null).maybeSingle();
    if (current.error || !current.data ||
      current.data.document_id !== file.document_id || current.data.storage_bucket !== file.storage_bucket ||
      current.data.storage_path !== file.storage_path || current.data.mime_type !== file.mime_type || current.data.file_name !== file.file_name ||
      !(await checkDocumentConfidentialityAccess(supabase, file.document_id as number, ctx, requiredPermission)).allowed) {
      return NextResponse.json({ error: "File access changed. Please retry." }, { status: 403 });
    }

    // Build response with correct headers
    const storedMime =
      (file.mime_type as string | null)?.split(";")[0].trim() || "application/octet-stream";
    const safeInline = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif", "text/plain"].includes(storedMime);
    const mimeType = safeInline ? storedMime : "application/octet-stream";
    const disposition = forceAttachment || !safeInline ? "attachment" : "inline";
    const fileName = ((file.file_name as string) || "document").replace(/[\r\n\u0000-\u001f\u007f]/g, "_");
    const asciiName = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
    // RFC 5987 encoding handles Unicode/Arabic filenames correctly
    const encodedName = encodeURIComponent(fileName).replace(/'/g, "%27");

    const headers = new Headers({
      "Content-Type": mimeType,
      "Content-Disposition": `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'self'",
      "Referrer-Policy": "no-referrer",
    });
    // Logged after storage succeeds and before bytes are returned. This proves server
    // delivery, not that the user saved/read the file or can later erase their copy.
    const event = await adminClient.from("dms_document_events").insert({
      document_id: file.document_id, event_type: forceAttachment ? "file_downloaded" : "file_previewed",
      description: "File bytes served through authenticated endpoint",
      performed_by: ctx.profile.id, metadata_json: { file_id: fileId, bytes: blob.size, delivery: "server_response" },
    });
    if (event.error) return NextResponse.json({ error: "Download audit could not be recorded. Please retry." }, { status: 503 });
    return new NextResponse(blob, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: "Unable to deliver the file." }, { status: 500 });
  }
}
