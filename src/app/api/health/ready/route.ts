import { checkStartupReadiness } from "@/lib/release/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function respond(head: boolean) {
  const { ready } = await checkStartupReadiness();
  return new Response(head ? null : JSON.stringify({ service: "algt-erp", check: "startup-dependencies", status: ready ? "ready" : "unavailable" }), {
    status: ready ? 200 : 503,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}

export const GET = () => respond(false);
export const HEAD = () => respond(true);
