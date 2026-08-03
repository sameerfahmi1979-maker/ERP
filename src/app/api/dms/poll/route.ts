export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { type NextRequest, NextResponse } from "next/server";
import { getDmsOrchestrationStatus } from "@/server/actions/dms/orchestration";
import { getDmsDocumentTags } from "@/server/actions/dms/document-tags";
import { getDmsTagSuggestions } from "@/server/actions/dms/ai-tags";

/**
 * GET /api/dms/poll?kind=orchestration&sessionCode=...   → { data }
 * GET /api/dms/poll?kind=documentTags&documentId=...     → { data }
 * GET /api/dms/poll?kind=tagSuggestions&documentId=...   → { data }
 *
 * WORKSPACE.PERF.1 UAT fix — background/interval polling must NOT use server
 * actions. In Next.js, a `router.push` performed while a server action is in
 * flight is reverted when the action resolves, snapping the user back to the
 * route the action was dispatched from (the "tab returns to Upload Inbox"
 * bug family). Every TanStack Query with a `refetchInterval` therefore polls
 * through this plain GET route instead.
 *
 * The underlying functions are invoked directly (server-side call, not an
 * action POST), so auth, permission checks, and RLS behavior are identical.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const params = req.nextUrl.searchParams;
    const kind = params.get("kind");
    const noStore = { headers: { "Cache-Control": "no-store" } };

    if (kind === "orchestration") {
      const sessionCode = params.get("sessionCode");
      if (!sessionCode) {
        return NextResponse.json({ error: "sessionCode required" }, { status: 400 });
      }
      const result = await getDmsOrchestrationStatus({ sessionCode });
      return NextResponse.json(
        { data: result.success ? result.data ?? null : null },
        noStore
      );
    }

    if (kind === "documentTags" || kind === "tagSuggestions") {
      const documentIdRaw = params.get("documentId");
      const documentId = Number(documentIdRaw);
      if (!documentIdRaw || isNaN(documentId)) {
        return NextResponse.json({ error: "documentId required" }, { status: 400 });
      }
      const result =
        kind === "documentTags"
          ? await getDmsDocumentTags(documentId)
          : await getDmsTagSuggestions(documentId);
      return NextResponse.json(
        { data: result.success ? result.data ?? [] : [] },
        noStore
      );
    }

    return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 200) }, { status: 500 });
  }
}
