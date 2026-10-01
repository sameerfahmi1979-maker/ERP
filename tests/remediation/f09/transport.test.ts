import {afterEach,expect,it,vi} from 'vitest';
import {authorizeWorker} from '@/lib/email/queue/worker-auth';
import {acquireGraphToken} from '@/lib/email/queue/graph-token';
const config={tenantId:'00000000-0000-4000-8000-000000000000',clientId:'synthetic',secret:'synthetic-not-live'};
afterEach(()=>vi.restoreAllMocks());
it('rejects missing, short and incorrect machine credentials',()=>{
 const secret='x'.repeat(32);expect(authorizeWorker(null,secret)).toBe(false);expect(authorizeWorker('Bearer '+secret,undefined)).toBe(false);
 expect(authorizeWorker('Bearer short','short')).toBe(false);expect(authorizeWorker('Bearer '+'y'.repeat(32),secret)).toBe(false);
 expect(authorizeWorker('Bearer '+secret,secret)).toBe(true);expect(authorizeWorker('Bearer '+secret+' ',secret)).toBe(false);
});
it.each([[400,'permanent'],[401,'permanent'],[429,'retry'],[500,'retry'],[408,'retry']] as const)('token failure %s is safe before dispatch',(status,kind)=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('DO NOT LOG',{status}));
 return expect(acquireGraphToken(config,new AbortController().signal)).resolves.toMatchObject({ready:false,kind});
});
it('accepts a token but never sends email',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({access_token:'synthetic-token'})));
 expect(await acquireGraphToken(config,new AbortController().signal)).toEqual({ready:true,token:'synthetic-token'});
 expect(fetch).toHaveBeenCalledTimes(1);expect(fetch.mock.calls[0][1]?.redirect).toBe('error');
});
it('rejects invalid authority and malformed token without mail',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch');expect(await acquireGraphToken({...config,tenantId:'attacker/path'},new AbortController().signal)).toMatchObject({ready:false,kind:'permanent'});
 expect(fetch).not.toHaveBeenCalled();fetch.mockResolvedValue(new Response('{}'));
 expect(await acquireGraphToken(config,new AbortController().signal)).toMatchObject({ready:false,kind:'permanent'});
});
