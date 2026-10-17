import {z} from "zod";
import type {WorkspaceSaveContract, WorkspaceSaveReceipt} from "./save-contract";

const revision = z.string().regex(/^[1-9]\d*$/).nullable();
const markerSchema = z.object({
  version: z.literal(1), scope: z.string().min(1).max(160),
  id: z.number().int().positive().refine(Number.isSafeInteger).nullable(), revision,
  operationId: z.uuid(),
}).strict();
export type SaveRetirementMarker = z.infer<typeof markerSchema>;

// Deliberately outside draft:tab:. Closing a tab must not forget an operation
// whose private payload has been removed but whose outcome is still unknown.
export const saveRetirementKey = (scope: string) => `save-retirement:v1:${scope}`;
export function createSaveRetirement(scope: string, id: number | null, contract: WorkspaceSaveContract): SaveRetirementMarker {
  return markerSchema.parse({version: 1, scope, id, revision: contract.revision, operationId: contract.operationId});
}
export function parseSaveRetirements(raw: string, scope: string): SaveRetirementMarker[] | null {
  try {
    const parsed = z.array(markerSchema).min(1).safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.every(marker => marker.scope === scope) && new Set(parsed.data.map(marker => marker.operationId)).size === parsed.data.length ? parsed.data : null;
  } catch {return null;}
}
export function validRetiredReceipt(marker: SaveRetirementMarker, receipt: WorkspaceSaveReceipt): boolean {
  return Number.isSafeInteger(receipt.id) && receipt.id > 0 && (marker.id === null || marker.id === receipt.id) &&
    /^[1-9]\d*$/.test(receipt.revision) && typeof receipt.replayed === "boolean";
}
