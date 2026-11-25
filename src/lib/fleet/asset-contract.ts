import { z } from "zod";

export const fleetCategories = {
  truck: "Truck",
  trailer: "Trailer",
  equipment: "Equipment",
  light_vehicle: "Light vehicle",
} as const;

export const fleetId = z.number().int().positive().refine(Number.isSafeInteger);
export const fleetCategory = z.enum(["truck", "trailer", "equipment", "light_vehicle"]);
export const fleetStatus = z.enum(["draft", "active", "retired"]);
const date = z.iso.date();
const facts = z.record(z.string(), z.unknown());
const choice = z.object({ id: fleetId, label: z.string() });
export const fleetChoices = z.object({
  scopes: z.array(z.object({ company: fleetId, branch: fleetId, label: z.string() })),
  sites: z.array(choice),
  roles: z.array(choice),
});
export const fleetPartyChoices = z.array(choice);
export const fleetProof = z.object({
  document: fleetId, version: fleetId, file: fleetId, label: z.string(),
  date, expires: date, kind: z.enum(["registration", "insurance"]),
});
export const fleetRow = z.object({
  id: fleetId, asset_no: z.string(), name: z.string(), category: fleetCategory,
  status: fleetStatus, plate: z.string().nullable(),
});
export const fleetAsset = fleetRow.omit({ plate: true }).extend({
  vin: z.string().nullable(), serial: z.string().nullable(), company: fleetId, branch: fleetId,
  revision: fleetId, can_manage: z.boolean(), can_link: z.boolean(), can_see_documents: z.boolean(),
  history: z.array(z.object({
    id: fleetId, kind: z.string(), effective_on: date, reason: z.string(), facts,
    company_id: fleetId.nullable(), branch_id: fleetId.nullable(), site_id: fleetId.nullable(),
    role_id: fleetId.nullable(), party_id: fleetId.nullable(),
  })),
  plates: z.array(z.object({
    id: fleetId, jurisdiction: z.string(), plate_class: z.string(), plate_number: z.string(),
    valid_from: date, valid_until: date.nullable(),
  })),
  meters: z.array(z.object({
    id: fleetId, unit: z.enum(["km", "hours"]), observed_on: date, value: z.number(),
    kind: z.enum(["opening", "correction"]), replaces_id: fleetId.nullable(), source_reference: z.string(),
  })),
  evidence: z.array(z.object({
    id: fleetId, kind: z.enum(["registration", "insurance"]), document_id: fleetId,
    version_id: fleetId, file_id: fleetId, effective_on: date, expires_on: date, facts,
    replaces_id: fleetId.nullable(), source_current: z.boolean(),
  })),
  proof_choices: z.array(fleetProof),
});

export const fleetAssetSummary = fleetAsset.omit({ evidence: true, proof_choices: true }).extend({
  history: fleetAsset.shape.history.max(1),
  plates: fleetAsset.shape.plates.max(1),
  meters: fleetAsset.shape.meters.max(2),
});
export const fleetAssetPageSize = 25;
export const fleetAssetPageNumber = z.number().int().min(1).max(Math.floor(2147483647 / fleetAssetPageSize));
export const fleetAssetSection = z.enum(["history", "plates", "meters", "evidence", "proof"]);
const fleetAssetPageBase = z.object({ has_more: z.boolean() });
export const fleetAssetPage = z.discriminatedUnion("section", [
  fleetAssetPageBase.extend({ section: z.literal("history"), rows: fleetAsset.shape.history.max(fleetAssetPageSize) }),
  fleetAssetPageBase.extend({ section: z.literal("plates"), rows: fleetAsset.shape.plates.max(fleetAssetPageSize) }),
  fleetAssetPageBase.extend({ section: z.literal("meters"), rows: fleetAsset.shape.meters.max(fleetAssetPageSize) }),
  fleetAssetPageBase.extend({ section: z.literal("evidence"), rows: fleetAsset.shape.evidence.max(fleetAssetPageSize) }),
  fleetAssetPageBase.extend({ section: z.literal("proof"), rows: fleetAsset.shape.proof_choices.max(fleetAssetPageSize) }),
]);

export const fleetCommand = z.object({
  operation: z.uuid(), asset: fleetId.nullable(),
  action: z.enum(["create", "identity", "ownership", "operation", "location", "configuration", "plate", "meter", "verify-document", "lifecycle"]),
  data: facts,
}).strict();
export const fleetReceipt = z.object({
  id: fleetId, asset_no: z.string(), revision: fleetId, status: fleetStatus,
  event_id: fleetId.nullable(), replayed: z.boolean(),
}).strict();

export type FleetAsset = z.infer<typeof fleetAsset>;
export type FleetAssetSummary = z.infer<typeof fleetAssetSummary>;
export type FleetAssetSection = z.infer<typeof fleetAssetSection>;
export type FleetChoices = z.infer<typeof fleetChoices>;
export type FleetCommand = z.infer<typeof fleetCommand>;
export type FleetReceipt = z.infer<typeof fleetReceipt>;
