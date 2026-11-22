import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, canUseApplication } from "@/lib/rbac/check";
import { canAccessIssuedFile } from "@/lib/output/issued-file-access";
import { createHash } from "node:crypto";
import { OriginalSizeMismatchError, readBoundedOriginal, validOriginalSize } from "@/lib/output/bounded-original";


const noStore = { "Cache-Control": "private, no-store" };
const cancelled = () => NextResponse.json({ error: "Download cancelled." }, { status: 400, headers: noStore });
const unavailable = () => NextResponse.json({ error: "Document unavailable or access denied." }, { status: 404, headers: noStore });

export type IssuedBinding = {employeeId:number;checksum:string;mode:"preview"|"download"};
export async function deliverIssuedFile(id:number,binding?:IssuedBinding,checkOnly=false, signal?:AbortSignal): Promise<NextResponse> {
  try {
    signal?.throwIfAborted();
    const ctx = await getAuthContext();
    signal?.throwIfAborted();
    if (!canUseApplication(ctx)) return NextResponse.json({ error: "Sign in required." }, { status: 401, headers: noStore });
    if (!(await canAccessIssuedFile(id, "download"))) return unavailable();
    const { data: doc, error } = await (await createClient()).from("erp_generated_pdf_documents")
      .select("id,storage_path,file_name,checksum,file_size_bytes,owner_company_id,lifecycle_state,revoked_at,expires_at,archived_at,superseded_by_id,source_record_type,source_record_id")
      .eq("id", id).maybeSingle();
    if (binding && error)return NextResponse.json({error:"Output access unavailable."},{status:503,headers:noStore});
    if (error || !doc || doc.lifecycle_state !== "issued" || doc.revoked_at || doc.archived_at ||
      (doc.expires_at && Date.parse(doc.expires_at) <= Date.now())) return unavailable();
    if(binding && (doc.source_record_type!=="employee" || doc.source_record_id!==binding.employeeId || doc.superseded_by_id))return unavailable();
    if(binding && binding.checksum!==doc.checksum)return NextResponse.json({error:"The original changed."},{status:409,headers:noStore});
    // The source and employee binding can change during storage or permission checks.
    const verifyCurrent=async()=>{
      if (!(await canAccessIssuedFile(id, "download"))) return unavailable();
      const current = await (await createClient()).from("erp_generated_pdf_documents").select("lifecycle_state,revoked_at,expires_at,archived_at,superseded_by_id,source_record_type,source_record_id,storage_path,checksum,file_size_bytes").eq("id", id).maybeSingle();
      if(binding && current.error)return NextResponse.json({error:"Output verification unavailable."},{status:503,headers:noStore});
      if(binding && current.data && (current.data.checksum!==doc.checksum || current.data.file_size_bytes!==doc.file_size_bytes || current.data.storage_path!==doc.storage_path))
        return NextResponse.json({error:"The retained original changed."},{status:409,headers:noStore});
      if (current.error || !current.data || current.data.lifecycle_state !== "issued" || current.data.revoked_at || current.data.archived_at ||
        (current.data.expires_at && Date.parse(current.data.expires_at) <= Date.now()) ||
        current.data.storage_path !== doc.storage_path || current.data.checksum !== doc.checksum || current.data.file_size_bytes !== doc.file_size_bytes) return unavailable();
      if(binding && (current.data.source_record_type!=="employee" || current.data.source_record_id!==binding.employeeId || current.data.superseded_by_id))return unavailable();
      return null;
    };
    if(checkOnly && binding){
      const changed=await verifyCurrent();
      signal?.throwIfAborted();
      if(changed)return changed;
      if(!validOriginalSize(doc.file_size_bytes))return unavailable();
      return new NextResponse(null,{headers:{...noStore,"X-HR-Employee-Id":String(binding.employeeId),
        "X-HR-Issuance-Id":String(id),"X-HR-Issued-Checksum":binding.checksum,"X-HR-Issued-Bytes":String(doc.file_size_bytes)}});
    }
    const integrityFailure = () => NextResponse.json({
      error: "The retained original failed its integrity check. Reconciliation is required.",
    }, { status: 409, headers: noStore });
    if (!validOriginalSize(doc.file_size_bytes) || !/^[a-f0-9]{64}$/i.test(doc.checksum ?? "")) return integrityFailure();

    const admin = createAdminClient();
    let bytes: Buffer;
    try {
      bytes = await readBoundedOriginal(admin.storage.from("erp-generated-pdfs"), doc.storage_path, doc.file_size_bytes, signal);
      signal?.throwIfAborted();
    } catch (readError) {
      if (signal?.aborted) return cancelled();
      if (readError instanceof OriginalSizeMismatchError) return integrityFailure();
      return NextResponse.json({error: "File storage is unavailable."}, {status: binding ? 503 : 502, headers: noStore});
    }
    if (createHash("sha256").update(bytes).digest("hex") !== doc.checksum) return integrityFailure();
    const changed=await verifyCurrent();
    signal?.throwIfAborted();
    if(changed)return changed;
    const audit = await admin.from("audit_logs").insert({
      actor_user_profile_id: ctx.profile!.id, owner_company_id: doc.owner_company_id,
      module_code: "reports", entity_name: "erp_generated_pdf_documents", entity_id: id,
      entity_reference: String(id), action: "view", new_values: { event: "output_bytes_served", bytes: bytes.length },
    });
    if (audit.error) return NextResponse.json({ error: "Download audit is unavailable." }, { status: 503, headers: noStore });
    const name = doc.file_name.replace(/[\r\n\u0000-\u001f\u007f]/g, "_");
    const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
    return new NextResponse(new Uint8Array(bytes), { headers: {
      ...noStore, ...(binding?{"X-HR-Employee-Id":String(binding.employeeId)}:{}), "Content-Type": "application/pdf", "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${binding?.mode==="preview"?"inline":"attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).replace(/'/g, "%27")}`,
      "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'self'", "Referrer-Policy": "no-referrer",
    } });
  } catch {
    if (signal?.aborted) return cancelled();
    return NextResponse.json({ error: "Unable to deliver the document." }, { status: binding ? 503 : 500, headers: noStore });
  }
}
