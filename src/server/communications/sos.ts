import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CommunicationActor } from './access';
import { reserveCommunicationBudget } from './budget';
import { decimal, historyMode, id, type CommunicationCommand } from './contracts';
import { CommunicationHttpError, userRpc } from './http';

const target = { epoch: id, channelId: id, incidentId: id };
const location = z.strictObject({
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative(), capturedAt: z.iso.datetime({offset:true}),
});
const operations = {
  'sos.send': z.strictObject({...target, location:location.optional()}),
  'sos.status': z.strictObject(target),
  'sos.cancel': z.strictObject(target),
  'sos.history': z.strictObject({channelId:id, mode:historyMode, cursor:decimal.optional(), eventId:id.optional()})
    .refine(a => !(a.eventId && a.cursor)),
};

export async function dispatchSos(command: CommunicationCommand, actor: CommunicationActor) {
  if (!Object.hasOwn(operations,command.op)) throw new CommunicationHttpError('invalid_request');
  const parsed = operations[command.op as keyof typeof operations].safeParse(command.args);
  if (!parsed.success) throw new CommunicationHttpError('invalid_request');
  const request = {op:command.op,args:parsed.data};
  if (command.op === 'sos.cancel' || command.op === 'sos.status')
    return userRpc('erp_sos_v1',{p_request:request});
  const retained = command.op === 'sos.send';
  const permit = await reserveCommunicationBudget({
    feature:'sos',scope:'communications',actorId:actor.profileId,upperBoundMicros:BigInt(0),
    operationId:retained ? 'sos:'+actor.profileId+':'+command.args.incidentId : randomUUID(),
    liabilityEndsAt:retained ? null : new Date(Date.now()+120000),
    binding:{actorSessionId:actor.authSessionId,command:request},
  });
  if (!permit.ok) {
    if (retained) {
      // A completed duplicate may have already consumed the permit. This mode cannot create an event.
      const existing = await userRpc('erp_sos_v1',{p_request:{...request,_lookupOnly:true}});
      const receipt = z.object({incidentId:id,state:z.enum(['recorded','cancelled','unknown'])}).parse(existing);
      if (receipt.incidentId === command.args.incidentId
          && receipt.state !== 'unknown') return receipt;
      throw new CommunicationHttpError('unavailable','SOS is currently unavailable.');
    }
    throw new CommunicationHttpError('temporarily_unavailable');
  }
  return userRpc('erp_sos_v1',{p_request:{...request,_budgetPermitId:permit.permitId}});
}
