
import { hashFinalPdfBytes } from "@/lib/output/idempotency";
import type { PayslipSnapshot } from "./payslip-pdf";

type IssuanceInput = { operation: string; batch: string; employee: number };
type Prepared = {
  id: number;
  finalized: boolean;
  can_deliver: boolean;
  snapshot: PayslipSnapshot | null;
  path: string | null;
  renderer: string;
  proof: { checksum: string; size: number; object_id: string; version: string } | null;
};
export type PayslipObjectIdentity = { id: string; version: string; lastModified: string };
export type PayslipIssuancePorts = {
  begin(input: IssuanceInput): Promise<Prepared>;
  render(snapshot: PayslipSnapshot, renderer: string): Buffer;
  put(path: string, bytes: Buffer): Promise<void>;
  get(path: string): Promise<{ bytes: Buffer; identity: PayslipObjectIdentity }>;
  attest(id: number, checksum: string, size: number, identity: PayslipObjectIdentity, renderer: string): Promise<void>;
  finalize(id: number): Promise<{can_deliver: boolean}>;
  routeInitial(id: number, operation: string): Promise<void>;
};

export class PayslipRoutingRetry extends Error {
  readonly issued = true;

  constructor() {
    super("The payslip was issued. Retry to confirm its delivery or printing task.");
  }
}

const pdfHeader = Buffer.from("%PDF-");

export async function issueRetainedPayslip(input: IssuanceInput, ports: PayslipIssuancePorts) {
  const original = await ports.begin(input);
  let canDeliver = original.can_deliver;
  if (!original.finalized) {
    if (!original.snapshot || !original.path) throw new Error("The scoped payslip preparation is incomplete.");
    if (original.proof) {
      const { bytes, identity } = await ports.get(original.path);
      if (bytes.length !== original.proof.size || hashFinalPdfBytes(bytes) !== original.proof.checksum ||
          identity.id !== original.proof.object_id || identity.version !== original.proof.version)
        throw new Error("The retained original failed its integrity check.");
    } else {
      const bytes = ports.render(original.snapshot, original.renderer);
      if (!bytes.subarray(0, pdfHeader.length).equals(pdfHeader) || bytes.length < 100 || bytes.length > 2_800_000)
        throw new Error("The payslip PDF could not be verified.");
      const checksum = hashFinalPdfBytes(bytes);

      // Upload is insert-only. When the operation timed out or another matching
      // request got there first, exact read-back determines whether to continue.
      await ports.put(original.path, bytes).catch(() => undefined);
      const { bytes: retained, identity } = await ports.get(original.path);
      if (retained.length !== bytes.length || hashFinalPdfBytes(retained) !== checksum)
        throw new Error("The retained original failed its integrity check.");
      await ports.attest(original.id, checksum, retained.length, identity, original.renderer);
    }
    canDeliver = (await ports.finalize(original.id)).can_deliver;
  }
  if (canDeliver) {
    try {
      await ports.routeInitial(original.id, input.operation);
    } catch {
      throw new PayslipRoutingRetry();
    }
  }
  return { id: original.id, routed: canDeliver };
}
