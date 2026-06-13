/**
 * DEV-ONLY runtime QA harness for Phase 002F.3E.3B.6G.3
 * Customer Child Tables TanStack Query Migration.
 *
 * Returns 404 in production builds. Delete before production deployment
 * (same policy as /dev/performance-qa and /dev/customer-prefetch-qa).
 */

import { notFound } from "next/navigation";
import { CustomerChildQAClient } from "./customer-child-qa-client";

export default function CustomerChildQAPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <CustomerChildQAClient />;
}
