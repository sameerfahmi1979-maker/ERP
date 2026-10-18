import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const s=vi.hoisted(()=>({process:vi.fn()}));
vi.mock('@/server/notification-events',()=>({processNotificationEvents:s.process}));
import {GET,POST} from '@/app/api/internal/process-notification-events/route';
const key='F10_SYNTHETIC_WORKER_SECRET_NOT_A_REAL_CREDENTIAL_00000000';
function request(body='{}',auth='Bearer '+key){return new NextRequest('http://localhost/api/internal/process-notification-events',{method:'POST',headers:{authorization:auth,'content-type':'application/json'},body});}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('INTERNAL_API_SECRET',key);vi.stubEnv('F10_NOTIFICATIONS_ENABLED','true');vi.stubEnv('F09_EMAIL_WORKER_ENABLED','false');s.process.mockResolvedValue({processed:1,results:[{id:1,outcome:'complete'}]});});
afterEach(()=>vi.unstubAllEnvs());
it('in-app admission works with email paused and never calls a provider',async()=>{const r=await POST(request());expect(r.status).toBe(200);expect(s.process).toHaveBeenCalledWith(1);expect(await r.json()).toMatchObject({processed:1,deliveryConfirmed:false});expect(r.headers.get('Cache-Control')).toContain('no-store');});
it('no-auth request cannot claim or resolve recipients',async()=>{expect((await POST(request('{}','Bearer wrong'))).status).toBe(401);expect(s.process).not.toHaveBeenCalled();});
it('disabled F10 returns paused before any event processing',async()=>{vi.stubEnv('F10_NOTIFICATIONS_ENABLED','false');expect(await(await POST(request())).json()).toEqual({paused:true,processed:0});expect(s.process).not.toHaveBeenCalled();});
it.each(['{"recipient":9}','{"force":true}','{"replay":true}','{"limit":1000}','{bad','x'.repeat(2049)])('bounded input rejects overrides and invalid body %s',async body=>{expect((await POST(request(body))).status).toBe(400);expect(s.process).not.toHaveBeenCalled();});
it('provider/DB timeout is unconfirmed, not successful processing or automatic resend',async()=>{s.process.mockRejectedValue(Error('PRIVATE'));const r=await POST(request());expect(r.status).toBe(503);expect(await r.text()).not.toContain('PRIVATE');});
it('GET is authenticated no-work configuration information, not a delivery or DB-health claim',async()=>{const r=await GET(request());expect(await r.json()).toMatchObject({workExecuted:false,databaseReadinessNotTested:true,deliveryConfirmed:false});expect(s.process).not.toHaveBeenCalled();expect((await GET(request('{}','wrong'))).status).toBe(401);});
