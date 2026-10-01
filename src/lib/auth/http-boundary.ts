import "server-only";

/** Never derive the trusted origin from an attacker-controlled Host/forwarded header. */
export function isSameOriginAuthRequest(request: Request): boolean {
  try {
    const expected = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://erp.algt.net").origin;
    return request.headers.get("origin") === expected &&
      [null, "same-origin"].includes(request.headers.get("sec-fetch-site"));
  } catch { return false; }
}

export function authResponse(success: boolean, status = 200) {
  return Response.json({ success }, { status, headers: {
    "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
  } });
}
