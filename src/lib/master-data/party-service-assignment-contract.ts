import {z} from 'zod';

export const serviceAssignmentId=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const revision=z.string().regex(/^[1-9]\d*$/).refine(value=>/^[1-9]\d{0,18}$/.test(value)&&BigInt(value)<=BigInt('9223372036854775807'),'Invalid revision.');
export const serviceAssignmentFields=z.object({service_category_id:serviceAssignmentId,is_primary:z.boolean().default(false),remarks:z.string().trim().max(4000).nullable().optional()}).strict();
export const addServiceAssignmentSchema=serviceAssignmentFields.extend({party_id:serviceAssignmentId}).strict();
export type AddServiceAssignmentInput=z.input<typeof addServiceAssignmentSchema>;
export const addServiceAssignmentContract=z.object({operationId:z.string().uuid(),revision:z.null()}).strict();
export const removeServiceAssignmentContract=z.object({operationId:z.string().uuid(),revision,partyId:serviceAssignmentId}).strict();
export type RemoveServiceAssignmentContract=z.infer<typeof removeServiceAssignmentContract>;
export const serviceAssignmentReceipt=z.object({id:serviceAssignmentId,party_id:serviceAssignmentId,service_category_id:serviceAssignmentId,revision,changed:z.boolean(),replayed:z.boolean(),is_active:z.boolean()}).strict();
export type ServiceAssignmentReceipt=z.infer<typeof serviceAssignmentReceipt>;
export const serviceAssignmentRequest=z.discriminatedUnion('action',[
 z.object({action:z.literal('add'),id:z.null(),partyId:serviceAssignmentId,revision:z.null(),fields:serviceAssignmentFields}).strict(),
 z.object({action:z.literal('remove'),id:serviceAssignmentId,partyId:serviceAssignmentId,revision,fields:z.object({}).strict()}).strict(),
]);
export type ServiceAssignmentRequest=z.infer<typeof serviceAssignmentRequest>;
