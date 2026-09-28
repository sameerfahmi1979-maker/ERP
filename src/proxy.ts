import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { releaseResponse, skipsSessionRefresh } from "@/lib/release/maintenance";

export async function proxy(request: NextRequest) {
  const release = releaseResponse(request);
  if (release) return release;
  if (skipsSessionRefresh(request.nextUrl.pathname)) return NextResponse.next();
  return updateSession(request);
}

export const config = {
  matcher: [
    "/:path*",
  ],
};
