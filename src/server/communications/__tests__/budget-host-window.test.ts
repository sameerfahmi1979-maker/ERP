import { expect, it } from 'vitest';
import { reserveCommunicationBudget } from '../budget';

it('binds host reservations to the server deployment and strips a caller-supplied deployment', async () => {
  let sent: Record<string, unknown> = {};
  const store={async transact(_command:string,payload:Record<string,unknown>){sent=payload;return {ok:false,reason:'host_window_unavailable'};}};
  const request={feature:'chat' as const,scope:'communications',operationId:'test',actorId:'2',upperBoundMicros:BigInt(0),liabilityEndsAt:null,
    hostDeploymentId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
  await reserveCommunicationBudget(request,{store,env:{ERP_COMM_CHAT_ENABLED:'true',RAILWAY_DEPLOYMENT_ID:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}});
  expect(sent.hostDeploymentId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  await reserveCommunicationBudget(request,{store,env:{ERP_COMM_CHAT_ENABLED:'true'}});
  expect(sent).not.toHaveProperty('hostDeploymentId');
});
