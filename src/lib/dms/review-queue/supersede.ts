import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// Internal only: exact source key, never a caller-controlled wildcard prefix.
export async function supersedeDmsReviewQueueItems(
  idempotencyKey: string
): Promise<void> {
  if (!/^(?:intake_classification:[1-9][0-9]*:classification|ai_analysis:[1-9][0-9]*:result|ai_job:[1-9][0-9]*|meta_suggestions:type:[1-9][0-9]*|p13:finding:[1-9][0-9]*)$/.test(idempotencyKey)) throw new Error("Invalid exact review key");
  try {
    const db  = createAdminClient();
    const now = new Date().toISOString();
    await db
      .from("dms_review_queue")
      .update({ status: "superseded", updated_at: now, resolved_at: now })
      .eq("idempotency_key", idempotencyKey)
      .in("status", ["open", "assigned", "in_review"])
      .is("deleted_at", null);
  } catch (err) {
    logger.warn("[review-queue] supersede failed (non-fatal)", {
      idempotencyKey,
      error: String(err).slice(0, 200),
    });
  }
}
