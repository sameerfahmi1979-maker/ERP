import { describe, expect, it, vi } from 'vitest';
import { CloudflarePtt, providerConfig, signalArgs } from '../ptt-provider';
vi.mock('server-only', () => ({}));
const endpointId = '00000000-0000-4000-8000-000000000001';
const leaseId = '00000000-0000-4000-8000-000000000002';
const plan = { endpointId, token: leaseId, sessionId: 'own', trackName: 'ptt-turn', publisherSessionId: 'authorized-talker' };
const base = { epoch: endpointId, channelId: leaseId };
const audio = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
const data = (value: unknown) => Promise.resolve(Response.json(value));
function setup(...values: unknown[]) {
  const transport = vi.fn<typeof fetch>();
  for (const value of values) transport.mockImplementationOnce(() => data(value));
  return { provider: new CloudflarePtt({ appId: 'test-app', secret: 'fixture-only' }, transport), transport };
}
describe('server-owned SFU audio signaling', () => {
  it('holds missing credentials and rejects client provider IDs', () => {
    expect(providerConfig({})).toBeNull();
    expect(signalArgs.safeParse({ ...base, action: 'subscribe', endpointId, leaseId, publisherSessionId: 'wrong' }).success).toBe(false);
  });
  it('creates empty provider sessions and only accepts a real returned id', async () => {
    const { provider, transport } = setup({ sessionId: 'fresh' }, {});
    expect(await provider.signal({ ...base, action: 'open' }, plan)).toEqual({ sessionId: 'fresh' });
    expect(transport.mock.calls[0][0]).toBe('https://rtc.live.cloudflare.com/v1/apps/test-app/sessions/new');
    expect(transport.mock.calls[0][1]?.body).toBeUndefined();
    await expect(provider.signal({ ...base, action: 'open' }, plan)).rejects.toThrow();
  });
  it('subscribes to the ledger publication and submits the gathered answer', async () => {
    const { provider, transport } = setup({ tracks: [{ mid: '1' }], sessionDescription: { type: 'offer', sdp: audio }, requiresImmediateRenegotiation: true }, {});
    const offer = await provider.signal({ ...base, action: 'subscribe', endpointId, leaseId }, plan);
    expect(offer.sessionDescription?.type).toBe('offer');
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual({ tracks: [{ location: 'remote', sessionId: 'authorized-talker', trackName: 'ptt-turn' }] });
    await provider.signal({ ...base, action: 'answer', endpointId, leaseId, sessionDescription: { type: 'answer', sdp: audio } }, plan);
    expect(transport.mock.calls[1][0]).toContain('/sessions/own/renegotiate');
  });
  it('requires exactly one real audio track and per-track success', async () => {
    const { provider, transport } = setup({ tracks: [{ mid: '0', errorCode: 'invalid' }], sessionDescription: { type: 'answer', sdp: audio } },
      { tracks: [{ mid: '0' }], sessionDescription: { type: 'answer', sdp: audio } });
    const args = { ...base, action: 'publish' as const, endpointId, leaseId, mid: '0', sessionDescription: { type: 'offer' as const, sdp: audio } };
    await expect(provider.signal({ ...args, sessionDescription: { type: 'offer', sdp: audio + 'm=video 9 X 99\r\n' } }, plan)).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
    await expect(provider.signal(args, plan)).rejects.toThrow();
    expect((await provider.signal(args, plan)).tracks).toEqual([{ mid: '0', trackName: 'ptt-turn' }]);
  });
  it('aborts provider inspection at the shared paid cleanup deadline',async()=>{
    const deadline=new AbortController();
    const transport=vi.fn<typeof fetch>().mockImplementation(async (_url,options)=>{
      const signal=options?.signal;
      if (!signal) throw Error('Missing provider deadline');
      deadline.abort();
      signal.throwIfAborted();
      throw Error('Unreachable');
    });
    const provider=new CloudflarePtt({appId:'test-app',secret:'fixture-only'},transport,deadline.signal);
    await expect(provider.close('own','0')).rejects.toMatchObject({name:'AbortError'});
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('requires independent confirmation that the forced close retired the correct track', async () => {
    const close = { tracks: [{ mid: '0' }] };
    const { provider, transport } = setup({ tracks: [{ mid: '0', status: 'active' }] }, close, { tracks: [{ mid: '0', status: 'active' }] }, { tracks: [{ mid: '0', status: 'active' }] }, close, { tracks: [{ mid: '0', status: 'inactive' }] });
    await expect(provider.close('own', '0')).rejects.toThrow();
    expect(JSON.parse(String(transport.mock.calls[1][1]?.body))).toEqual({ force: true, tracks: [{ mid: '0' }] });
    await expect(provider.close('own', '0')).resolves.toBeUndefined();
  });
});
