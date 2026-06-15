/**
 * DEV-ONLY: 3B.6F Performance QA Harness
 *
 * Route: /dev/performance-qa
 *
 * Purpose: Runtime proof for the 3B.6 performance package.
 * Verifies: TanStack Query caching, ERPCombobox dirty tracking,
 *           lazyMount section behavior, Safe Close regression.
 *
 * Remove or guard before production promotion.
 */

import { notFound } from "next/navigation";
import { PerformanceQAClient } from "./performance-qa-client";

export default function PerformanceQAPage() {
  // Guard: never render in production. notFound() during SSR returns 404
  // without breaking the build (unlike a module-level throw).
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <PerformanceQAClient />;
}
