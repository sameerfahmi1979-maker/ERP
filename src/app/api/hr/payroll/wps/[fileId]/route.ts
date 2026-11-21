import { createHash } from "node:crypto";
import { payrollWpsDownload, settlementFileId } from "@/lib/hr/payroll/settlement-contract";
import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": "sandbox; default-src 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const unavailable = () => new Response("WPS file unavailable.", { status: 404, headers: privateHeaders });
const integrityFailure = () => new Response("The archived WPS file failed its integrity check.", { status: 409, headers: privateHeaders });

export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const id = settlementFileId.safeParse((await params).fileId);
  if (!id.success) return unavailable();

  try {
    if (!canUseApplication(await getAuthContext())) {
      return new Response("Sign in required.", { status: 401, headers: privateHeaders });
    }
    // One scoped database operation authorizes the retained file and records the
    // access against its exact archive. Do not recreate the file at download time.
    const { data, error } = await (await createClient()).rpc("t16_wps_download", { p_file: id.data });
    if (error) {
      if (error.code === "42501" || error.code === "PT404" || error.code === "PT409") return unavailable();
      return new Response("The WPS file could not be loaded.", { status: 503, headers: privateHeaders });
    }
    if (data === null) return unavailable();
    const file = payrollWpsDownload.safeParse(data);
    if (!file.success) return integrityFailure();
    const encoded = file.data.base64.replace(/[\r\n]/g, "");
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length === 0 || bytes.toString("base64") !== encoded ||
        createHash("sha256").update(bytes).digest("hex") !== file.data.sha256) return integrityFailure();

    return new Response(new Uint8Array(bytes), { headers: {
      ...privateHeaders,
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="' + file.data.filename + '"',
    } });
  } catch {
    return new Response("The WPS file could not be loaded.", { status: 503, headers: privateHeaders });
  }
}

