
import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import type { EmailMessageInput } from "@/lib/email/providers/types";
import { DeliveryPolicyError } from "@/lib/email/queue/policy";
import { boundedQuery } from "@/lib/email/queue/runtime-limits";
import type { EmailClaim } from "@/lib/email/queue/worker";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PayslipDeliveryClaim extends EmailClaim {
  source_module: string;
  source_entity_type: string | null;
}

interface PayslipMailPorts {
  load(claim: PayslipDeliveryClaim): Promise<unknown>;
  download(path: string): Promise<Buffer>;
}

const mailSource = z.object({
  recipient: z.email().max(254),
  storage_path: z.string().regex(/^hr\/[A-Za-z0-9_/.-]+\.pdf$/).refine(path => !path.split("/").includes("..")),
  file_name: z.string().regex(/^[A-Za-z0-9_-]{1,150}\.pdf$/),
  size_bytes: z.number().int().positive().max(3_000_000),
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
});

function productionPorts(): PayslipMailPorts {
  const db = createAdminClient();
  return {
    async load(q) {
      const { data, error } = await boundedQuery(db.rpc("t17_email_delivery_source", {
        p_queue: q.id, p_owner: q.lease_owner, p_token: q.lease_token,
      }));
      if (error) throw new Error("Payslip delivery source unavailable");
      return data;
    },
    async download(path) {
      const { data, error } = await db.storage.from("erp-generated-pdfs").download(path);
      if (error || !data) throw new Error("Retained payslip storage unavailable");
      return Buffer.from(await data.arrayBuffer());
    },
  };
}

/** Mail contains only the single retained payslip. Queue metadata never supplies recipients or attachments. */
export async function preparePayslipEmail(
  claim: PayslipDeliveryClaim, signal: AbortSignal, ports?: PayslipMailPorts,
): Promise<EmailMessageInput> {
  signal.throwIfAborted();
  if (claim.source_module !== "HR_PAYSLIP" || claim.source_entity_type !== "t17_payslip_deliveries")
    throw new DeliveryPolicyError();
  const io = ports ?? productionPorts();
  const source = mailSource.safeParse(await io.load(claim));
  if (!source.success) throw new DeliveryPolicyError();
  signal.throwIfAborted();

  const { recipient, storage_path, file_name, checksum, size_bytes } = source.data;
  const original = await io.download(storage_path);
  if (original.byteLength !== size_bytes || original.subarray(0, 5).toString("ascii") !== "%PDF-" ||
    createHash("sha256").update(original).digest("hex") !== checksum) {
    throw new DeliveryPolicyError();
  }
  signal.throwIfAborted();

  return {
    to: [recipient],
    subject: "Your ERP payslip",
    textBody: "Your payslip is attached.",
    attachments: [{
      filename: file_name, contentType: "application/pdf",
      base64Content: original.toString("base64"), sizeBytes: size_bytes,
    }],
  };
}
