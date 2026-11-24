import { describe, expect, it, vi } from 'vitest';
import { communicationFeatures } from '../providers/config';
import { reconcileCommunicationBudget, reserveCommunicationBudget, type ReservationRequest } from '../budget';

const request: ReservationRequest = {
  feature: 'ptt_live', scope: 'communications', operationId: 'op-1', actorId: '17',
  upperBoundMicros: BigInt('9007199254740993'), liabilityEndsAt: null,
};

describe('communications budget boundary', () => {
  it.each(communicationFeatures)('holds %s when its independent gate is absent', async feature => {
    const store = { transact: vi.fn() };
    expect(await reserveCommunicationBudget({ ...request, feature }, { env: {}, store }))
      .toEqual({ ok: false, status: 503, reason: 'feature_disabled' });
    expect(store.transact).not.toHaveBeenCalled();
  });
  it('requires an exact affirmative gate and preserves separate feature settings', async () => {
    const store = { transact: vi.fn() };
    expect((await reserveCommunicationBudget(request, { env: { ERP_COMM_PTT_LIVE_ENABLED: 'TRUE' }, store })).ok).toBe(false);
    expect((await reserveCommunicationBudget(request, { env: { ERP_COMM_PUSH_ENABLED: 'true' }, store })).ok).toBe(false);
    expect(store.transact).not.toHaveBeenCalled();
  });
  it('transmits integer money as a decimal string and returns the persistent permit', async () => {
    const expiresAt = new Date(Date.now() + 60000);
    const store = { transact: vi.fn().mockResolvedValue({ ok: true, permitId: 'confirmed', newReservation: true, expiresAt: expiresAt.toISOString() }) };
    expect(await reserveCommunicationBudget(request, { store, env: { ERP_COMM_PTT_LIVE_ENABLED: 'true' } }))
      .toEqual({ ok: true, permitId: 'confirmed', newReservation: true, expiresAt });
    expect(store.transact).toHaveBeenCalledWith('reserve', { ...request, upperBoundMicros: '9007199254740993' });
  });
  it('surfaces protected admission denial and handles an ambiguous transaction', async () => {
    const store = { transact: vi.fn().mockResolvedValueOnce({ ok: false, reason: 'meter_stale_or_incomplete' }).mockRejectedValueOnce(Error('secret')) };
    const deps = { store, env: { ERP_COMM_PTT_LIVE_ENABLED: 'true' } };
    expect(await reserveCommunicationBudget(request, deps)).toEqual({ ok: false, status: 503, reason: 'meter_stale_or_incomplete' });
    expect(await reserveCommunicationBudget(request, deps)).toEqual({ ok: false, status: 503, reason: 'budget_transaction_unavailable' });
  });
  it('rejects invalid input, old receipts, and an undocumented reply', async () => {
    const store = { transact: vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({
      ok: true, permitId: 'old', newReservation: false, expiresAt: new Date(0).toISOString(),
    }) };
    const deps = { store, env: { ERP_COMM_PTT_LIVE_ENABLED: 'true' } };
    expect((await reserveCommunicationBudget({ ...request, upperBoundMicros: BigInt(-1) }, deps)).ok).toBe(false);
    expect(store.transact).not.toHaveBeenCalled();
    expect(await reserveCommunicationBudget(request, deps)).toMatchObject({ reason: 'invalid_budget_response' });
    expect(await reserveCommunicationBudget(request, deps)).toMatchObject({ reason: 'permit_expired' });
  });
  it('requires exact protected spool limits for every accepted export', async () => {
    const receipt = { ok: true, permitId: 'p', expiresAt: new Date(Date.now()+60000).toISOString(), newReservation: true };
    const spool = { bytesPerSlot: '9007199254740993', slotsPerVolume: 2, maxVolumes: 1, cleanupTailSeconds: 60 };
    const store = { transact: vi.fn().mockResolvedValueOnce(receipt).mockResolvedValueOnce({ ...receipt, spool }) };
    const deps = { store, env: { ERP_COMM_EXPORT_ENABLED: 'true' } };
    expect(await reserveCommunicationBudget({ ...request, feature: 'export' }, deps)).toMatchObject({ reason: 'export_spool_lifetime_unproven' });
    expect(await reserveCommunicationBudget({ ...request, feature: 'export' }, deps)).toMatchObject({ ok: true, spool });
  });
  it('continues reconciliation after the feature has been paused', async () => {
    const store = { transact: vi.fn().mockResolvedValue({ ok: false, reason: 'settlement_unconfirmed' }) };
    expect(await reconcileCommunicationBudget({ ...request, permitId: 'p', actualMicros: BigInt(0), evidenceId: 'receipt' }, { env: {}, store }))
      .toMatchObject({ ok: false, status: 503, reason: 'settlement_unconfirmed' });
    expect(store.transact).toHaveBeenCalledTimes(1);
  });
});

describe('spending control commands', () => {
  const actor = {
    profileId: '42', authUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    authSessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', isGlobalSystemAdmin: true,
  };
  it('sends the authenticated profile/session and never turns global admin into spending authority', async () => {
    const { dispatchBudget } = await import('../budget');
    const http = await import('../http');
    const rpc = vi.spyOn(http, 'userRpc').mockResolvedValueOnce({ canApprove: false, canMonitor: false });
    try {
      expect(await dispatchBudget({ op: 'budget.status', args: { scope: 'communications' } }, actor))
        .toEqual({ canApprove: false, canMonitor: false });
      expect(rpc).toHaveBeenCalledWith('erp_comm_budget_operator', {
        p_profile: '42', p_session: actor.authSessionId, p_op: 'budget.status', p_args: { scope: 'communications' },
      });
    } finally { rpc.mockRestore(); }
  });
  it('rejects invented scope, missing expiry and browser-supplied owner claims before the RPC', async () => {
    const { dispatchBudget } = await import('../budget');
    const http = await import('../http');
    const rpc = vi.spyOn(http, 'userRpc');
    try {
      for (const command of [
        { op: 'budget.status', args: { scope: 'unknown' } },
        { op: 'budget.approve', args: { scope: 'communications', maxMicros: '5', currency: 'USD' } },
        { op: 'budget.status', args: { scope: 'communications', isOwner: true } },
        { op: 'budget.monitor', args: { scope: 'communications', recipientProfileIds: [actor.authUserId] } },
      ]) {
        await expect(dispatchBudget(command, actor)).rejects.toMatchObject({ code: 'invalid_request' });
      }
      expect(rpc).not.toHaveBeenCalled();
    } finally { rpc.mockRestore(); }
  });
});
