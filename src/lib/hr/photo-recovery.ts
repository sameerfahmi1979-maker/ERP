import {z} from 'zod';
import {photoUploadStateSchema} from './photo-upload-workflow';
import {employeeCreateSchema,employeeUpdateSchema} from './employee-contract';
import {dependentMutationSchema,dependentSaveContract} from './dependent-contract';

const id=z.number().int().positive().safe();
const contract=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/).nullable()}).strict();
export const photoSaveRequestSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('employee-create'),input:employeeCreateSchema,contract}).strict(),
 z.object({kind:z.literal('employee-update'),id,input:employeeUpdateSchema,contract}).strict(),
 z.object({kind:z.literal('dependent'),input:dependentMutationSchema,contract:dependentSaveContract}).strict(),
]);
export type PhotoSaveRequest=z.infer<typeof photoSaveRequestSchema>;
export const photoRecoveryScope=z.string().regex(/^(?:employee:(?:new|[1-9]\d*)|dependent:[1-9]\d*:(?:new|[1-9]\d*))$/);
export const photoRecoveryPayload=z.object({state:photoUploadStateSchema,save:photoSaveRequestSchema.nullable()}).strict();
export const photoRecoveryRecord=z.object({
 operation:z.string().uuid(),scope:photoRecoveryScope,revision:z.number().int().positive(),
 employee:id.nullable(),dependent:id.nullable(),personRevision:z.string().regex(/^[1-9]\d*$/).nullable(),
 state:photoUploadStateSchema,savePending:z.boolean(),complete:z.boolean(),
}).strict();
export type PhotoRecoveryRecord=z.infer<typeof photoRecoveryRecord>;
