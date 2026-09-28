import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, canUseApplication } from "@/lib/rbac/check";
import { canAccessIssuedFile } from "@/lib/output/issued-file-access";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };
const unavailable = () => NextResponse.json({ error: "Document unavailable or access denied." }, { status: 404, headers: noStore });

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const raw = req.nextUrl.searchParams.get("issuanceId");
    if (!raw || !/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) <= 0) {
      return NextResponse.json({ error: "Invalid issuance." }, { status: 400, headers: noStore });
    }
    const ctx = await getAuthContext();
    if (!canUseApplication(ctx)) return NextResponse.json({ error: "Sign in required." }, { status: 401, headers: noStore });
    const id = Number(raw);
    if (!(await canAccessIssuedFile(id, "download"))) return unavailable();
    const { data: doc, error } = await (await createClient()).from("erp_generated_pdf_documents")
      .select("id,storage_path,file_name,owner_company_id,lifecycle_state,revoked_at,expires_at,archived_at")
      .eq("id", id).maybeSingle();
    if (error || !doc || doc.lifecycle_state !== "issued" || doc.revoked_at || doc.archived_at ||
      (doc.expires_at && Date.parse(doc.expires_at) <= Date.now())) return unavailable();
    const admin = createAdminClient();
    const file = await admin.storage.from("erp-generated-pdfs").download(doc.storage_path);
    if (file.error || !file.data) return NextResponse.json({ error: "File storage is unavailable." }, { status: 502, headers: noStore });
    // Recheck after storage latency: do not serve bytes if permissions changed during the request.
    if (!(await canAccessIssuedFile(id, "download"))) return unavailable();
    const current = await (await createClient()).from("erp_generated_pdf_documents").select("lifecycle_state,revoked_at,expires_at,archived_at").eq("id", id).maybeSingle();
    if (current.error || !current.data || current.data.lifecycle_state !== "issued" || current.data.revoked_at || current.data.archived_at ||
      (current.data.expires_at && Date.parse(current.data.expires_at) <= Date.now())) return unavailable();
    const audit = await admin.from("audit_logs").insert({
      actor_user_profile_id: ctx.profile!.id, owner_company_id: doc.owner_company_id,
      module_code: "reports", entity_name: "erp_generated_pdf_documents", entity_id: id,
      entity_reference: String(id), action: "view", new_values: { event: "output_bytes_served", bytes: file.data.size },
    });
    if (audit.error) return NextResponse.json({ error: "Download audit is unavailable." }, { status: 503, headers: noStore });
    const name = doc.file_name.replace(/[\r\n\u0000-\u001f\u007f]/g, "_");
    const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
    return new NextResponse(file.data, { headers: {
      ...noStore, "Content-Type": "application/pdf", "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).replace(/'/g, "%27")}`,
      "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'self'", "Referrer-Policy": "no-referrer",
    } });
  } catch {
    return NextResponse.json({ error: "Unable to deliver the document." }, { status: 500, headers: noStore });
  }
}
