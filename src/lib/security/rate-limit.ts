import "server-only";

import { headers } from "next/headers";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Periodic opportunistic cleanup so the map doesn't grow unbounded on a
// long-running process. Cheap — only sweeps at most once per minute.
let lastSweep = Date.now();
function sweepExpired(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Simple in-memory fixed-window rate limiter for public/unauthenticated
 * server actions (e.g. forgot-password, contact forms).
 *
 * NOTE — scope of protection: state lives in this Node.js process only. On
 * a single-instance deployment (this app's current Railway setup) that is
 * an effective, zero-infrastructure guard against scripted abuse. If this
 * app is ever scaled to multiple instances, each instance gets its own
 * bucket and the effective limit becomes `max * instanceCount` — replace
 * with a DB- or Redis-backed limiter at that point.
 */
export function checkRateLimit(
  key: string,
  options: { windowMs: number; max: number }
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  sweepExpired(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.max - 1 };
  }

  if (existing.count >= options.max) {
    return { allowed: false, remaining: 0 };
  }

  existing.count += 1;
  return { allowed: true, remaining: options.max - existing.count };
}

/**
 * Best-effort client IP extraction from proxy headers.
 * Railway (and most PaaS reverse proxies) set `x-forwarded-for`.
 * Falls back to "unknown" — callers should still apply per-key limits
 * even when IP can't be determined, so shared "unknown" traffic is still
 * bounded rather than unlimited.
 */
export async function getRequestIp(): Promise<string> {
  try {
    const h = await headers();
    return (
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      "unknown"
    );
  } catch {
    return "unknown";
  }
}
