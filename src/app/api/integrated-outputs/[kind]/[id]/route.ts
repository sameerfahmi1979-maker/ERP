import { fleetId } from "@/lib/fleet/asset-contract";
import { operationalOutput, operationalOutputKind } from "@/lib/official-documents/operational-output";
import { renderOperationalOutputHtml, renderOperationalOutputPdf } from "@/lib/official-documents/operational-output-renderer";
import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const headers = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": "sandbox allow-same-origin; default-src 'none'; style-src 'unsafe-inline'; font-src data:; frame-ancestors 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};
const message = (status: number, content: string) =>
  new Response(content, { status, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const route = await params;
  const kind = operationalOutputKind.safeParse(route.kind);
  const id = fleetId.safeParse(/^\d+$/.test(route.id) ? Number(route.id) : NaN);
  const format = new URL(request.url).searchParams.get("format") ?? "html";
  if (!kind.success || !id.success || !["html", "pdf"].includes(format)) return message(404, "Output unavailable.");
  try {
    if (!canUseApplication(await getAuthContext())) return message(404, "Output unavailable in this scope.");
    const db = await createClient();
    const { data, error } = await db.rpc("t19_operational_output", { p_kind: kind.data, p_id: id.data });
    if (error?.code === "42501" || (!error && data === null)) return message(404, "Output unavailable in this scope.");
    const result = operationalOutput.safeParse(data);
    if (error || !result.success || result.data.source !== id.data || result.data.kind !== kind.data)
      return message(503, "The output source could not be verified. Try again.");

    if (format === "pdf") {
      const bytes = renderOperationalOutputPdf(result.data);
      return new Response(new Uint8Array(bytes), {
        headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${kind.data}-${id.data}.pdf"` },
      });
    }
    return new Response(renderOperationalOutputHtml(result.data), {
      headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
    });
  } catch {
    return message(503, "The output could not be prepared. Try again.");
  }
}
