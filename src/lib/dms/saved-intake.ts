import {z} from 'zod';
import {preparationHash,preparationId,preparationReviewOpenSchema,preparationSnapshotSchema} from './preparation/contracts';
export const savedIntakeSchemaState=z.strictObject({schemaHash:preparationHash,fields:preparationSnapshotSchema.shape.fields});
export const savedIntakeValuesSchema=z.strictObject({
 title:z.string().trim().min(1).max(500),standardFileName:z.string().trim().min(1).max(240).regex(/^[^\\/:*?"<>|\u0000-\u001f]+$/),
 documentTypeId:preparationId,categoryId:preparationId.nullable(),description:z.string().max(16000),
 issueDate:z.union([z.iso.date(),z.literal('')]),expiryDate:z.union([z.iso.date(),z.literal('')]),
 confidentialityLevel:z.enum(['internal','company','hr','finance','legal','executive']),owningCompanyId:preparationId.nullable(),owningBranchId:preparationId.nullable(),
 metadataValues:z.record(z.string().regex(/^[1-9][0-9]*$/),z.strictObject({fieldType:z.string(),rawValue:z.string().max(16000)})),tagIds:z.array(preparationId).max(30),
}).refine(v=>!v.issueDate||!v.expiryDate||v.expiryDate>=v.issueDate,'Expiry must be on or after issue date');
export const savedIntakeLinksSchema=z.array(z.strictObject({entityType:z.string().min(1).max(80),entityId:preparationId,entityName:z.string().max(500)})).max(50);
export const savedIntakePayloadSchema=z.strictObject({documentId:preparationId,fileId:preparationId,jobId:preparationId,requestId:z.uuid(),snapshot:preparationHash,schemaHash:preparationHash,expectedRevision:z.number().int().nonnegative(),confirmed:z.literal(true),values:savedIntakeValuesSchema,links:savedIntakeLinksSchema});
export type SavedIntakePayload=z.infer<typeof savedIntakePayloadSchema>;
export const savedIntakeOpenSchema=z.strictObject({review:preparationReviewOpenSchema,values:savedIntakeValuesSchema,links:savedIntakeLinksSchema,schemaHash:preparationHash,draft:z.strictObject({revision:z.number().int().positive(),current:z.boolean(),payload:savedIntakePayloadSchema}).nullable()});
export type SavedIntakeOpen=z.infer<typeof savedIntakeOpenSchema>;

/** Required metadata is checked before confirmation; never invent missing AI values. */
export function missingSavedIntakeFields(values: Pick<z.infer<typeof savedIntakeValuesSchema>, 'metadataValues'>, fields: z.infer<typeof savedIntakeSchemaState>['fields']) {
 return fields.filter(field=>field.required&&!values.metadataValues[field.id]?.rawValue.trim());
}

export function savedIntakeFilenameError(name:string,original:string):string|null {
 const extension=(value:string)=>value.match(/\.[^.]+$/)?.[0].toLowerCase()??null;
 const expected=extension(original);
 return extension(name.trim())===expected?null:expected?`Keep the original ${expected} file extension.`:'Keep the original file format; do not add an extension.';
}

/** Parsing a receipt changes property order, not the user's edits. */
export function savedIntakeEditFingerprint(values:unknown,links:unknown):string {
 return JSON.stringify({values,links},(_key,value:unknown)=>value&&typeof value==='object'&&!Array.isArray(value)
  ?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
}
