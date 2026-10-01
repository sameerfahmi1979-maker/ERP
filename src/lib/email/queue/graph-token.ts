import 'server-only';
import { retryAfterDate } from './delivery-contract';

export type GraphTokenResult = { ready: true; token: string } | { ready: false; kind: 'retry' | 'permanent'; retryAfter?: string };

/** Run ONLY within preflight's deadline; secret resolution is the adapter's job.
 * Tenant UUID pins the OAuth origin/path. No arbitrary authority URL or redirects.
 * No provider response text or actual secret enters errors/logs. */
export async function acquireGraphToken(config: { tenantId: string; clientId: string; secret: string }, signal: AbortSignal): Promise<GraphTokenResult> {
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(config.tenantId) || !config.clientId || !config.secret)
    return { ready: false, kind: 'permanent' };
  try {
    const response=await fetch(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,{
      method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:config.clientId,client_secret:config.secret,scope:'https://graph.microsoft.com/.default',grant_type:'client_credentials'}).toString(),
    });
    if (!response.ok) {
      void response.body?.cancel().catch(()=>{});
      return {ready:false,kind:response.status===429||response.status===408||response.status>=500?'retry':'permanent',retryAfter:retryAfterDate(response.headers.get('retry-after'))};
    }
    const result=await response.json() as {access_token?:unknown};
    return typeof result.access_token==='string' && result.access_token.length>0
      ? {ready:true,token:result.access_token} : {ready:false,kind:'permanent'};
  } catch { return {ready:false,kind:'retry'}; }
}
