/**
 * OUTPUT.2 — Official issuance engine (orchestration core).
 *
 * Pure orchestration over injected ports so every lifecycle rule is
 * unit-testable without live services. The server action wires real
 * implementations (Supabase, Gotenberg, storage, QR links).
 *
 * Canonical sequence (v6.1, QR activation LAST):
 *   1. request-key idempotency lookup (safe replay)
 *   2. content-fingerprint check (warning; authorized reissue allowed)
 *   3. insert issuance row  → pending
 *   4. if QR requested + policy allows: create the public link in
 *      'pending_activation' (token exists so the QR image can be embedded in
 *      the PDF, but the public verify page treats it as NOT FOUND)
 *   5. pending → rendering  → render PDF (classified failures)
 *   6. rendering → uploaded → upload to immutable storage
 *   7. verify exact stored bytes (download + SHA-256 compare)
 *      mismatch → reconciliation_required
 *   8. uploaded → issued (final hash + serial finalization)
 *   9. QR ACTIVATION LAST — flip pending_activation → valid, only from
 *      `issued`; post-issuance activation failure leaves the document issued
 *      and the link retryable at link level (never a lifecycle regression).
 */

import { assertTransition, canActivatePublicToken, type LifecycleState } from "./lifecycle";
import { hashFinalPdfBytes } from "./idempotency";
import { computeQrExpiry, qrAllowed, type EffectiveOutputPolicy } from "./class-policy";
import type { QrOutcome } from "./types";

// ── Ports ─────────────────────────────────────────────────────────────────────

export interface ExistingIssuance {
  id: number;
  lifecycle_state: LifecycleState;
  storage_path: string | null;
  file_name: string | null;
  checksum: string | null;
  file_size_bytes: number | null;
}

export interface IssuancePorts {
  findByRequestKey(requestKey: string): Promise<ExistingIssuance | null>;
  findIssuedWithFingerprint(contentFingerprint: string): Promise<{ id: number } | null>;
  insertIssuance(row: {
    requestKey: string;
    contentFingerprint: string;
    outputCode: string;
    documentClass: string;
    storagePath: string;
    fileName: string;
    supersedesIssuanceId: number | null;
  }): Promise<{ id: number }>;
  transition(
    issuanceId: number,
    from: LifecycleState,
    to: LifecycleState,
    extra?: Record<string, unknown>
  ): Promise<void>;
  /**
   * OUTPUT.4 — Reserve an official serial for the issuance (policy.requiresSerial).
   * The serial is written to the row as `reserved`; failure paths VOID it
   * (never recycle), success finalizes it as `issued` (see lifecycle lib).
   */
  reserveSerial?(input: { issuanceId: number }): Promise<{ serialNo: string }>;
  /**
   * Create the public link in `pending_activation` BEFORE rendering, so the
   * QR image can be embedded in the PDF. The token must not verify publicly.
   */
  createPendingPublicLink(input: {
    issuanceId: number;
    expiresAt: Date | null;
  }): Promise<{ linkId: number; publicUrl: string; qrDataUrl: string | null }>;
  /** Render the PDF; receives the QR context when a link was pre-created. */
  render(ctx: {
    qr: { publicUrl: string; qrDataUrl: string | null } | null;
  }): Promise<{ buffer: Buffer; rendererVersion: string }>;
  upload(storagePath: string, buffer: Buffer): Promise<void>;
  /** Download the stored object back for exact-byte verification. */
  downloadStored(storagePath: string): Promise<Buffer>;
  /** Flip the pre-created link to `valid`. Only ever called from `issued`. */
  activatePublicLink(input: { linkId: number }): Promise<void>;
  audit(event: string, payload: Record<string, unknown>): Promise<void>;
}

export interface RunIssuanceInput {
  requestKey: string;
  contentFingerprint: string;
  outputCode: string;
  policy: EffectiveOutputPolicy;
  storagePath: string;
  fileName: string;
  issueQr: boolean;
  authorizeReissue: boolean;
  supersedesIssuanceId?: number;
}

export type RunIssuanceOutcome =
  | {
      kind: "issued";
      issuanceId: number;
      finalSha256: string;
      fileSizeBytes: number;
      qr: QrOutcome;
      idempotentReplay: boolean;
      reissued: boolean;
      serialNo: string | null;
    }
  | { kind: "duplicate_content_warning"; existingIssuanceId: number }
  | { kind: "failed_retryable"; issuanceId: number; error: string }
  | { kind: "failed_terminal"; issuanceId: number; error: string }
  | { kind: "reconciliation_required"; issuanceId: number; error: string };

// ── Engine ────────────────────────────────────────────────────────────────────

export async function runIssuance(
  input: RunIssuanceInput,
  ports: IssuancePorts
): Promise<RunIssuanceOutcome> {
  // 1. Request idempotency — the same logical request never issues twice.
  const existing = await ports.findByRequestKey(input.requestKey);
  if (existing) {
    if (existing.lifecycle_state === "issued") {
      return {
        kind: "issued",
        issuanceId: existing.id,
        finalSha256: existing.checksum ?? "",
        fileSizeBytes: existing.file_size_bytes ?? 0,
        qr: { status: "not_requested" },
        idempotentReplay: true,
        reissued: false,
        serialNo: null,
      };
    }
    // Same request, prior attempt failed → report its state, never duplicate.
    if (existing.lifecycle_state === "failed_retryable") {
      return { kind: "failed_retryable", issuanceId: existing.id, error: "Previous attempt failed and can be retried." };
    }
    if (existing.lifecycle_state === "reconciliation_required") {
      return { kind: "reconciliation_required", issuanceId: existing.id, error: "Previous attempt requires reconciliation." };
    }
    return { kind: "failed_terminal", issuanceId: existing.id, error: `Request already processed (state: ${existing.lifecycle_state}).` };
  }

  // 2. Content fingerprint — warn on equal content unless reissue authorized.
  let reissued = false;
  const equal = await ports.findIssuedWithFingerprint(input.contentFingerprint);
  if (equal) {
    if (!input.authorizeReissue) {
      return { kind: "duplicate_content_warning", existingIssuanceId: equal.id };
    }
    reissued = true;
    await ports.audit("output_reissue_authorized", {
      output_code: input.outputCode,
      prior_issuance_id: equal.id,
    });
  }

  // 3. Insert row in `pending`.
  const { id: issuanceId } = await ports.insertIssuance({
    requestKey: input.requestKey,
    contentFingerprint: input.contentFingerprint,
    outputCode: input.outputCode,
    documentClass: input.policy.documentClass,
    storagePath: input.storagePath,
    fileName: input.fileName,
    supersedesIssuanceId: reissued ? input.supersedesIssuanceId ?? equal?.id ?? null : input.supersedesIssuanceId ?? null,
  });

  // 3b. Reserve the official serial when class policy requires one.
  //     Failure is retryable and the row moves to failed_retryable BEFORE any
  //     rendering happens; a reserved serial is never released for reuse.
  let serialNo: string | null = null;
  if (input.policy.requiresSerial && ports.reserveSerial) {
    try {
      serialNo = (await ports.reserveSerial({ issuanceId })).serialNo;
    } catch (err) {
      await ports.transition(issuanceId, "pending", "failed_retryable", {
        failure_reason: `Serial reservation failed: ${errMessage(err)}`,
      });
      return { kind: "failed_retryable", issuanceId, error: errMessage(err) };
    }
  }

  // 4. Pre-create the QR link (pending_activation) so it can be embedded.
  let pendingLink: { linkId: number; publicUrl: string; qrDataUrl: string | null } | null = null;
  const qrWanted = input.issueQr && qrAllowed(input.policy);
  if (qrWanted) {
    try {
      const expiresAt = computeQrExpiry(input.policy, new Date());
      pendingLink = await ports.createPendingPublicLink({ issuanceId, expiresAt });
    } catch (err) {
      // QR finalization failure BEFORE issuance → safe retryable failure.
      await ports.transition(issuanceId, "pending", "failed_retryable", {
        failure_reason: `QR link preparation failed: ${errMessage(err)}`,
      });
      return { kind: "failed_retryable", issuanceId, error: errMessage(err) };
    }
  }

  // 5. Render.
  assertTransition("pending", "rendering");
  await ports.transition(issuanceId, "pending", "rendering");
  let buffer: Buffer;
  let rendererVersion: string;
  try {
    const rendered = await ports.render({
      qr: pendingLink ? { publicUrl: pendingLink.publicUrl, qrDataUrl: pendingLink.qrDataUrl } : null,
    });
    buffer = rendered.buffer;
    rendererVersion = rendered.rendererVersion;
  } catch (err) {
    const retryable = isRetryableError(err);
    const to: LifecycleState = retryable ? "failed_retryable" : "failed_terminal";
    await ports.transition(issuanceId, "rendering", to, { failure_reason: errMessage(err) });
    return retryable
      ? { kind: "failed_retryable", issuanceId, error: errMessage(err) }
      : { kind: "failed_terminal", issuanceId, error: errMessage(err) };
  }

  // 6. Upload. A failed upload leaves the token inactive by construction —
  //    the link stays pending_activation and never verifies publicly.
  try {
    await ports.upload(input.storagePath, buffer);
  } catch (err) {
    await ports.transition(issuanceId, "rendering", "failed_retryable", {
      failure_reason: `Upload failed: ${errMessage(err)}`,
    });
    return { kind: "failed_retryable", issuanceId, error: errMessage(err) };
  }
  assertTransition("rendering", "uploaded");
  await ports.transition(issuanceId, "rendering", "uploaded", {
    renderer_version: rendererVersion,
    file_size_bytes: buffer.byteLength,
  });

  // 7. Exact-byte verification of what storage actually holds.
  const localHash = hashFinalPdfBytes(buffer);
  let storedHash: string;
  try {
    storedHash = hashFinalPdfBytes(await ports.downloadStored(input.storagePath));
  } catch (err) {
    await ports.transition(issuanceId, "uploaded", "reconciliation_required", {
      failure_reason: `Stored-byte verification failed: ${errMessage(err)}`,
    });
    return { kind: "reconciliation_required", issuanceId, error: errMessage(err) };
  }
  if (storedHash !== localHash) {
    await ports.transition(issuanceId, "uploaded", "reconciliation_required", {
      failure_reason: "Stored bytes do not match rendered bytes.",
    });
    return {
      kind: "reconciliation_required",
      issuanceId,
      error: "Stored bytes do not match rendered bytes.",
    };
  }

  // 8. Issue — final hash recorded from verified stored bytes.
  assertTransition("uploaded", "issued");
  await ports.transition(issuanceId, "uploaded", "issued", { checksum: storedHash });
  await ports.audit("output_issued", {
    output_code: input.outputCode,
    issuance_id: issuanceId,
    sha256: storedHash,
    reissued,
  });

  // 9. QR activation — strictly last, only from `issued`.
  let qr: QrOutcome = { status: "not_requested" };
  if (input.issueQr && !qrAllowed(input.policy)) {
    qr = { status: "policy_forbids" };
  } else if (pendingLink) {
    if (!canActivatePublicToken("issued")) {
      qr = { status: "activation_failed_retryable", error: "Lifecycle forbids activation." };
    } else {
      try {
        await ports.activatePublicLink({ linkId: pendingLink.linkId });
        qr = { status: "activated", publicUrl: pendingLink.publicUrl, linkId: pendingLink.linkId };
      } catch (err) {
        // Document remains validly issued; activation is retryable at link level.
        await ports.audit("output_qr_activation_failed", {
          issuance_id: issuanceId,
          link_id: pendingLink.linkId,
          error: errMessage(err),
        });
        qr = { status: "activation_failed_retryable", error: errMessage(err) };
      }
    }
  }

  return {
    kind: "issued",
    issuanceId,
    finalSha256: storedHash,
    fileSizeBytes: buffer.byteLength,
    qr,
    idempotentReplay: false,
    reissued,
    serialNo,
  };
}

function isRetryableError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "retryable" in err
    ? Boolean((err as { retryable: unknown }).retryable)
    : true;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
