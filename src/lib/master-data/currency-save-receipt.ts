import {z} from 'zod';

/** Validate the authoritative acknowledgement before resolving an uncertain mutation. */
export const currencySaveReceiptSchema=z.object({
  id:z.number().int().positive(),
  revision:z.string().regex(/^[1-9]\d*$/),
  changed:z.boolean(),
  replayed:z.boolean(),
});
