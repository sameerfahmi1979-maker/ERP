
import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { readBoundedOriginal } from "@/lib/output/bounded-original";
import type { PayslipObjectIdentity } from "./payslip-issuance";

const storageIdentity = z.object({ id: z.uuid(), version: z.string().min(1), lastModified: z.iso.datetime({ offset: true }) });

export async function readPayslipOriginal(path: string): Promise<{ bytes: Buffer; identity: PayslipObjectIdentity }> {
  const storage = createAdminClient().storage.from("erp-generated-pdfs");
  const before = await storage.info(path);
  const first = storageIdentity.safeParse(before.data);
  if (before.error || !first.success) throw new Error("The retained payslip storage identity is unavailable.");
  const bytes = await readBoundedOriginal(storage, path);
  if (bytes.length > 2_800_000) throw new Error("The retained payslip is too large.");
  const after = await storage.info(path);
  const last = storageIdentity.safeParse(after.data);
  if (after.error || !last.success || first.data.id !== last.data.id ||
      first.data.version !== last.data.version || first.data.lastModified !== last.data.lastModified) {
    throw new Error("The retained payslip changed during storage verification.");
  }
  return { bytes, identity: { ...last.data, lastModified: new Date(last.data.lastModified).toISOString() } };
}
