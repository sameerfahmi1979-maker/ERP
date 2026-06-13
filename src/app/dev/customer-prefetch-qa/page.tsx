/**
 * DEV-ONLY runtime QA harness for Phase 002F.3E.3B.6G.2
 * Customer Basic Tab Lookup Prefetch Wiring.
 *
 * Returns 404 in production builds. Delete before production deployment
 * (same policy as /dev/performance-qa).
 */

import { notFound } from "next/navigation";
import { CustomerPrefetchQAClient } from "./customer-prefetch-qa-client";

export default function CustomerPrefetchQAPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <CustomerPrefetchQAClient />;
}
