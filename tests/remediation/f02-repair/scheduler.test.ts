import { afterEach, describe, expect, it, vi } from 'vitest';
import { schedulerGate } from '../../../supabase/functions/dms-expiry-scheduler/auth';
const key = 'f02-test-only-'.padEnd(64, 'a');
const request = (token: string | undefined = key, mode = 'health', method = 'POST') => new Request(`https://synthetic.invalid/?mode=${mode}`, {
  method, headers: token ? {'x-dms-scheduler-secret': token} : {},
});
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('mandatory scheduler authentication', () => {
  it.each([undefined, '', 'short', ' '.repeat(64)])('missing/unsafe config fails closed (%s)', async secret => {
    expect((await schedulerGate(request(), secret))?.status).toBe(503);
  });
  it.each([undefined, '', 'wrong'.padEnd(64, 'b'), key+'x', 'a'.repeat(300)])('incorrect header denied (%s)', async token => {
    expect((await schedulerGate(new Request('https://synthetic.invalid/', {method:'POST',headers:token?{'x-dms-scheduler-secret':token}:{}}),key))?.status).toBe(401);
  });
  it('legacy bearer alone is not accepted', async () => {
    expect((await schedulerGate(new Request('https://synthetic.invalid/', {method:'POST',headers:{Authorization:`Bearer ${key}`}}),key))?.status).toBe(401);
  });
  it('GET never enters business processing', async () => expect((await schedulerGate(request(key,'health','GET'),key))?.status).toBe(405));
  it('new secret accepted, old secret rejected after rotation', async () => {
    expect(await schedulerGate(request(), key)).toBeNull();
    expect((await schedulerGate(request(), 'rotated-'.padEnd(64,'z')))?.status).toBe(401);
  });
});
async function handler(overrides: Record<string,string | undefined> = {}) {
  let captured: (req: Request) => Promise<Response> = async () => { throw Error('not registered'); };
  const env: Record<string,string | undefined> = {DMS_SCHEDULER_SECRET:key,SUPABASE_URL:'https://synthetic.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic',INTERNAL_API_SECRET:'synthetic',...overrides};
  vi.stubGlobal('Deno', {env:{get:(name:string)=>env[name]},serve:(fn:typeof captured)=>{captured=fn;}});
  await import('../../../supabase/functions/dms-expiry-scheduler/index');
  return captured;
}
it('actual handler health returns zero work without DB/provider access', async () => {
  const response = await (await handler())(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ok:true,mode:'health',processed:0,sent:0});
});
it('actual handler rejects wrong secret before touching DB', async () => expect((await (await handler())(request('wrong'.padEnd(64,'z')))).status).toBe(401));
it('actual handler rejects missing internal worker config', async () => expect((await (await handler({INTERNAL_API_SECRET:undefined}))(request())).status).toBe(503));
it('actual handler rejects unknown mode before touching DB', async () => expect((await (await handler())(request(key,'typo'))).status).toBe(400));
