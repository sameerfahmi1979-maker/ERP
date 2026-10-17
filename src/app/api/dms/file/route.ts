export const runtime = "nodejs";

import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { checkDocumentConfidentialityAccess } from "@/lib/dms/document-access";
import {createHash} from "node:crypto";

const noStore = {"Cache-Control":"private, no-store", "Referrer-Policy":"no-referrer"};
const unavailable = (error:string,status:number) => NextResponse.json({error},{status,headers:noStore});

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
      return unavailable("Invalid fileId",400);
    }

    const fileId = Number(fileIdRaw);
    const forceAttachment = dispositionParam === "attachment";

    // Auth
    const ctx = await getAuthContext();
    if (!ctx.profile) {
      return unavailable("Not authenticated",401);
    }

    const requiredPermission = forceAttachment ? "dms.documents.download" : "dms.documents.preview";
    const hasAccess =
      hasPermission(ctx, requiredPermission) || hasPermission(ctx, "dms.admin");

    if (!hasAccess) {
      return NextResponse.json(
        { error: `Permission denied: requires ${requiredPermission}` },
        { status: 403, headers:noStore }
      );
    }

    // File record
    const supabase = await createClient();
    const { data: file, error: fileError } = await supabase
      .from("dms_document_files")
      .select("id,document_id,version_id,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash")
      .eq("id", fileId)
      .is("deleted_at", null)
      .single();

    if (fileError || !file) {
      return unavailable("File not found",404);
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
        { status: 403, headers:noStore }
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
        { status: 502, headers:noStore }
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
      return unavailable("File access changed. Please retry.",403);
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
    // Verify claims rather than trusting a browser-supplied actor. The restricted
    // receipt operation rechecks the live original session, document capability
    // and exact file/version/bytes atomically. No reusable storage URL escapes.
    const claims = await supabase.auth.getClaims();
    if (claims.error || !claims.data?.claims?.sub || claims.data.claims.sub !== ctx.profile.auth_user_id) return unavailable("File access changed. Please sign in again.",403);
    const bytes = Buffer.from(await blob.arrayBuffer());
    const event = await adminClient.rpc("f07_record_file_response", {
      p_file:fileId, p_binding:file, p_action:forceAttachment?"download":"preview", p_bytes:bytes.length,
      p_sha:createHash("sha256").update(bytes).digest("hex"),
      p_claims:{sub:claims.data.claims.sub,session_id:claims.data.claims.session_id},
    });
    if (event.error || !event.data || event.data.fileId !== fileId || event.data.documentId !== file.document_id || !Number.isSafeInteger(event.data.eventId))
      return unavailable("The current file response could not be verified. Please retry.",event.error?.code === "42501" ? 403 : event.error?.code === "PT409" ? 409 : 503);
    return new NextResponse(blob, { status: 200, headers });
  } catch {
    return unavailable("Unable to deliver the file.",500);
  }
}
