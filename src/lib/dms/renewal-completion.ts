import {z} from 'zod';
import {zOptionalDateString} from './date-validators';

export const dmsLifecycleId=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const completeRenewalSchema=z.object({
  new_expiry_date:zOptionalDateString,
  replacement_document_id:dmsLifecycleId,
  replacement_version_id:dmsLifecycleId.optional(),
  notes:z.string().max(4000).optional(),
}).strict();
export const renewalCompletionReceiptSchema=z.object({
  renewalId:dmsLifecycleId,documentId:dmsLifecycleId,replacementDocumentId:dmsLifecycleId,
  status:z.literal('renewed'),replayed:z.boolean(),
  reminderIntent:z.enum(['schedule_retained','schedule_created','not_required']),
}).strict();

/** A transport failure does not prove a transaction rolled back. */
export function renewalCompletionFailure(code?:string){
  const known=typeof code==='string'&&(/^(?:22|23|42|P0|PT)[A-Z0-9]{3}$/.test(code)||['40001','40P01'].includes(code));
  return {success:false,uncertain:!known,error:code==='PT409'
    ? 'The renewal or replacement changed. Refresh and check its current state before continuing.'
    :code==='42501'?'You do not have access to complete this renewal with that replacement.'
      :known?'The renewal was not completed. Check the selected document, version and dates.'
        :'Renewal completion could not be confirmed. Keep this selection and retry the same renewal; do not create another request.'};
}
