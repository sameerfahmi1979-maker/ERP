import {z} from 'zod';
import {zNullableDateString} from './date-validators';
const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const intakeReviewContextSchema=z.object({sessionId:id,typeId:id.optional(),expiryDate:zNullableDateString,documentId:id.optional()})
 .strict().refine(x=>!!x.typeId!==!!x.documentId,'Choose an intake type or an existing document, not both.');
export const intakeReviewPlanSchema=z.object({actorId:id,sessionId:id,typeId:id,expiryDate:z.string().nullable(),documentId:id.optional(),fingerprint:z.string().regex(/^[a-f0-9]{64}$/),
 requiresOverride:z.boolean(),reason:z.string().nullable(),canOverride:z.boolean()}).strict();
export const intakeReviewConfirmationSchema=intakeReviewPlanSchema.extend({confirmed:z.literal(true),override:z.boolean(),reasonText:z.string().max(1000).nullable()});
export type IntakeReviewPlan=z.infer<typeof intakeReviewPlanSchema>;
export type IntakeReviewConfirmation=z.infer<typeof intakeReviewConfirmationSchema>;
