import { type NextRequest, NextResponse } from "next/server";
import { confirmAuthLink } from "@/lib/auth/confirm-link";
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  let destination = "/auth/link-error?reason=invalid_invite_link";
  if (params.has("token_hash") && ["invite", "recovery"].includes(params.get("type") ?? "")) {
    destination = "/auth/verify?" + new URLSearchParams({ token_hash: params.get("token_hash")!, type: params.get("type")! });
  } else if (code && code.length <= 1024) {
    destination = await confirmAuthLink({ code, next: params.get("next") });
  }
  // Explicit empty fragment prevents a provider's error/session fragment being inherited.
  // Use the configured app origin, never a proxy/request Host (or Next's loopback normalization).
  const response = NextResponse.redirect(new URL(destination, process.env.NEXT_PUBLIC_SITE_URL ?? "https://erp.algt.net").href + "#");
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
