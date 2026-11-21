
import { z } from "zod";
import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";
import { readPayslipOriginal } from "@/lib/official-documents/payslip-storage";
import { hashFinalPdfBytes } from "@/lib/output/idempotency";

export const runtime = "nodejs";

const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'self'",
  "Referrer-Policy": "no-referrer",
};
const fileSchema = z.object({
  path: z.string().regex(/^hr\/payslips\/\d+\/\d+\/[a-f0-9-]{36}\.pdf$/),
  filename: z.string().regex(/^Payslip-\d{4}-\d{2}-\d+\.pdf$/),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  size: z.number().int().min(100).max(2_800_000), object_id: z.uuid(),
});
const unavailable = () => new Response("Original payslip unavailable.", { status: 404, headers });

export async function GET(_request: Request, { params }: { params: Promise<{ slipId: string }> }) {
  try {
    const { slipId } = await params;
    const id = Number(slipId);
    if (!/^\d+$/.test(slipId) || !Number.isSafeInteger(id) || id <= 0) return unavailable();
    if (!canUseApplication(await getAuthContext()))
      return new Response("Sign in required.", { status: 401, headers });

    const db = await createClient();
    const original = await db.rpc("t17_file_manifest", { p_slip: id, p_record_access: false });
    const file = fileSchema.safeParse(original.data);
    if (original.error || !file.success) return unavailable();
    const { bytes, identity } = await readPayslipOriginal(file.data.path);
    if (identity.id !== file.data.object_id || bytes.length !== file.data.size || hashFinalPdfBytes(bytes) !== file.data.checksum)
      return new Response("The retained payslip failed verification.", { status: 409, headers });

    // Recheck scope after storage I/O and record the authorised retrieval.
    const audit = await db.rpc("t17_file_manifest", { p_slip: id, p_record_access: true });
    const current = fileSchema.safeParse(audit.data);
    if (audit.error || !current.success || current.data.checksum !== file.data.checksum ||
        current.data.object_id !== file.data.object_id || current.data.path !== file.data.path || current.data.filename !== file.data.filename || current.data.size !== file.data.size) {
      return unavailable();
    }
    return new Response(new Uint8Array(bytes), {
      headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=\"" + file.data.filename + "\"" },
    });
  } catch {
    return new Response("Original payslip retrieval could not be confirmed.", { status: 503, headers });
  }
}
