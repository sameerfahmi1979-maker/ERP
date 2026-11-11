import { z } from "zod";
import { modelPreparationSchema } from "./contracts";

// Derive the provider contract from the validator, avoiding a second drifting field list.
// A provider must emit documentTypeCode (null when unknown), rather than use a Zod default.
const responseSchema = modelPreparationSchema.extend({
  documentTypeCode: z.string().trim().max(100).nullable(),
});
function providerSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(providerSchema);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, providerSchema(item)]));
  delete result.$schema;
  // Structured Outputs supports date patterns, but not JSON Schema's "date" format.
  if (result.format === "date") delete result.format;
  if (result.type === "integer" && typeof result.exclusiveMinimum === "number") {
    result.minimum = Math.floor(result.exclusiveMinimum) + 1;
    delete result.exclusiveMinimum;
  }
  return result;
}
export const preparationResponseSchema = {
  name: "dms_preparation_v1",
  schema: providerSchema(z.toJSONSchema(responseSchema, { target: "draft-7" })) as Record<string, unknown>,
};
