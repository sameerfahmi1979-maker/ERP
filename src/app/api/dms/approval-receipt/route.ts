import { z } from "zod";
import { recoverNumberedAiApproval } from "@/server/dms-ai-approval-recovery";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

/** Read an existing completed receipt under the original officer's current ERP session. */
export async function GET(request: Request): Promise<Response> {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "Request denied" }, { status: 403, headers });
  }
  const params = new URL(request.url).searchParams;
  const rawIntakeId = params.get("intakeId") ?? "";
  const intakeId = Number(rawIntakeId);
  const operationId = z.uuid().safeParse(params.get("operationId")?.toLowerCase());
  if (!/^[1-9]\d*$/.test(rawIntakeId) || !Number.isSafeInteger(intakeId) || !operationId.success) {
    return Response.json({ error: "Invalid approval receipt request" }, { status: 400, headers });
  }

  const recovered = await recoverNumberedAiApproval(intakeId, operationId.data);
  const receipt = recovered.success ? recovered.data?.receipt : null;
  if (!receipt || receipt.upload_session_id !== intakeId || receipt.operation_id !== operationId.data) {
    return Response.json({ error: "Approval receipt unavailable" }, { status: 404, headers });
  }
  return Response.json({ recovery: "verified_completed", receipt }, { headers });
}
