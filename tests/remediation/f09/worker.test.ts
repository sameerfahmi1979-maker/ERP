import { afterEach, describe, expect, it, vi } from 'vitest';
import { processOneEmail, type EmailClaim } from '@/lib/email/queue/worker';
import { classifySendResponse, retryAfterDate, withDeadline } from '@/lib/email/queue/delivery-contract';
import { prepareGraphDelivery } from '@/lib/email/queue/graph-transport';
import { createEmailQueueStore } from '@/lib/email/queue/rpc-store';
const claim: EmailClaim = { id: 1, lease_owner: 'owner', lease_token: 'token', attempt_count: 1, max_attempts: 3 };
const store = () => ({ claim: vi.fn().mockResolvedValue(claim), beginDispatch: vi.fn().mockResolvedValue(true), finish: vi.fn().mockResolvedValue(true) });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('F09 worker safety', () => {
  it('does no work for an ineligible/competing claim', async () => {
    const db=store(), prepare=vi.fn(); db.claim.mockResolvedValue(null);
    expect(await processOneEmail(db,prepare)).toBe('skipped'); expect(prepare).not.toHaveBeenCalled();
  });
  it('does not dispatch when preflight revokes permission', async () => {
    const db=store(); expect(await processOneEmail(db,async()=>({ready:false,outcome:{kind:'cancelled'}}))).toBe('cancelled');
    expect(db.beginDispatch).not.toHaveBeenCalled();
  });
  it('does not dispatch after losing lease', async () => {
    const db=store(), send=vi.fn(); db.beginDispatch.mockResolvedValue(false);
    expect(await processOneEmail(db,async()=>({ready:true,send}))).toBe('lease_lost'); expect(send).not.toHaveBeenCalled();
  });
  it('transitions missing provider/preparation errors, never leaves processing unhandled', async () => {
    const db=store(); expect(await processOneEmail(db,async()=>{throw Error('missing provider');})).toBe('retry');
    expect(db.finish).toHaveBeenCalledWith(claim,{kind:'retry'});
  });
  it('holds thrown sends as unknown without retrying', async () => {
    const db=store(),send=vi.fn().mockRejectedValue(Error('response lost'));
    expect(await processOneEmail(db,async()=>({ready:true,send}))).toBe('unknown'); expect(send).toHaveBeenCalledTimes(1);
  });
  it('does not resend if accepted-state persistence fails', async () => {
    const db=store(),send=vi.fn().mockResolvedValue({kind:'accepted'}); db.finish.mockRejectedValue(Error('db unavailable'));
    await expect(processOneEmail(db,async()=>({ready:true,send}))).rejects.toThrow('db unavailable'); expect(send).toHaveBeenCalledTimes(1);
  });
  it('reports exhausted attempts as permanent, not retry scheduled', async () => {
    const db=store();db.claim.mockResolvedValue({...claim,attempt_count:3});
    expect(await processOneEmail(db,async()=>({ready:false,outcome:{kind:'retry'}}))).toBe('permanent');
  });
  it('bounds an adapter that ignores abort and marks dispatch unknown', async () => {
    vi.useFakeTimers(); const db=store();
    const result=processOneEmail(db,async()=>({ready:true,send:()=>new Promise(()=>{})}));
    await vi.advanceTimersByTimeAsync(20_001); expect(await result).toBe('unknown');
  });
  it('bounds preparation before dispatch as retry', async () => {
    vi.useFakeTimers(); const db=store(); const result=processOneEmail(db,()=>new Promise(()=>{}));
    await vi.advanceTimersByTimeAsync(15_001); expect(await result).toBe('retry'); expect(db.beginDispatch).not.toHaveBeenCalled();
  });
  it('aborts the actual signal', async () => {
    vi.useFakeTimers(); let signal:AbortSignal|undefined;
    const result=withDeadline(100,s=>{signal=s;return new Promise(()=>{});});
    const assertion=expect(result).rejects.toThrow('deadline'); await vi.advanceTimersByTimeAsync(101); await assertion;
    expect(signal?.aborted).toBe(true);
  });
  it('rejects a DB error, and treats no-row completion as lease loss', async () => {
    const rpc=vi.fn().mockResolvedValue({data:null,error:{message:'private data'}});
    const db=createEmailQueueStore({rpc},'owner'); await expect(db.claim()).rejects.toThrow('transition failed');
    rpc.mockResolvedValue({data:false,error:null}); expect(await db.finish(claim,{kind:'accepted'})).toBe(false);
  });
});
describe('F09 delivery semantics', () => {
  it.each([[202,'accepted'],[200,'unknown'],[429,'retry'],[408,'unknown'],[500,'unknown'],[503,'unknown'],[401,'permanent'],[400,'permanent']] as const)('classifies %s', (status,kind)=>{
    expect(classifySendResponse(status,null).kind).toBe(kind);
  });
  it('honours Retry-After seconds and dates without accepting invalid or past values', ()=>{
    const now=Date.parse('2026-09-30T00:00:00Z');
    expect(retryAfterDate('300',now)).toBe('2026-09-30T00:05:00.000Z');
    expect(retryAfterDate('Wed, 30 Sep 2026 00:20:00 GMT',now)).toBe('2026-09-30T00:20:00.000Z');
    expect(retryAfterDate('bad',now)).toBeUndefined(); expect(retryAfterDate('0',now)).toBeUndefined();
  });
  it('supports body-only messages; 202 is accepted, not delivery confirmed', async()=>{
    const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(null,{status:202}));
    const send=prepareGraphDelivery({to:['test@example.invalid'],subject:'Synthetic',textBody:'Test'},'sender@example.invalid','not-a-real-token');
    expect(await send(new AbortController().signal,'correlation')).toEqual({kind:'accepted'});
    expect(fetch.mock.calls[0][1]?.redirect).toBe('error'); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not log/leak provider response bodies', async()=>{
    vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('private@example.invalid SECRET',{status:500}));
    const send=prepareGraphDelivery({to:['test@example.invalid'],subject:'Synthetic',textBody:'Test'},'sender@example.invalid','dummy');
    expect(await send(new AbortController().signal,'id')).toEqual({kind:'unknown'});
  });
  it('rejects mismatched attachment bytes, bad names and empty bodies',()=>{
    const base={to:['test@example.invalid'],subject:'Synthetic',textBody:'Test'};
    expect(()=>prepareGraphDelivery({...base,textBody:''},'sender@example.invalid','dummy')).toThrow();
    expect(()=>prepareGraphDelivery({...base,attachments:[{filename:'x.pdf',contentType:'application/pdf',base64Content:'aGk=',sizeBytes:9}]},'sender@example.invalid','dummy')).toThrow();
    expect(()=>prepareGraphDelivery({...base,attachments:[{filename:'../x',contentType:'text/plain',base64Content:'aGk=',sizeBytes:2}]},'sender@example.invalid','dummy')).toThrow();
  });
});
