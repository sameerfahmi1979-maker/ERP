import { NextResponse, type NextRequest } from "next/server";

// F08 replaced the standalone bearer/admin-loader renderer with governed,
// source-checked durable output. Keep the old address closed even for tokens
// signed before retirement; never load private records through this path.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  _context: { params: Promise<{ templateKey: string; recordType: string; recordId: string }> },
) {
  void _request;
  void _context;
  return new NextResponse(
    "This legacy print link is no longer available. Open Reports or Employee Letters & Forms.",
    { status: 410, headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    } },
  );
}
