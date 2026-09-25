import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
// Next 16.3.5's shipped helper still exports the middleware name despite its proxy guide.
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
const state=vi.hoisted(()=>({refresh:vi.fn()}));
vi.mock('@/lib/supabase/middleware',()=>({updateSession:state.refresh}));
import { proxy, config } from '@/proxy';
import { maintenanceEnabled } from '@/lib/release/maintenance';
beforeEach(()=>{vi.stubEnv('ERP_MAINTENANCE_MODE','1');state.refresh.mockReset();state.refresh.mockResolvedValue(NextResponse.next());});
afterEach(()=>vi.unstubAllEnvs());
it.each(['1','true','false','', 'unexpected'])('explicit maintenance setting %j fails closed',value=>expect(maintenanceEnabled(value)).toBe(true));
it('unset and explicit zero retain normal mode',()=>{vi.stubEnv('ERP_MAINTENANCE_MODE',undefined);expect(maintenanceEnabled()).toBe(false);expect(maintenanceEnabled('0')).toBe(false);});
it.each(['/','/login','/auth/confirm?token_hash=synthetic','/auth/verify?invitation=synthetic','/dashboard','/api/internal/process-email-queue','/_next/static/app.js','/_next/image?url=/logo.png','/api/files/private.png','/favicon.ico'])('covers and blocks %s before Auth',async url=>{
 expect(unstable_doesMiddlewareMatch({config,nextConfig:{},url})).toBe(true);
 const res=await proxy(new NextRequest('https://erp.invalid'+url));expect(res.status).toBe(503);expect(res.headers.get('cache-control')).toContain('no-store');expect(res.headers.get('retry-after')).toBe('120');expect(state.refresh).not.toHaveBeenCalled();expect(res.headers.get('set-cookie')).toBeNull();expect(await res.text()).not.toContain('synthetic');
});
it.each(['POST','PUT','PATCH','DELETE','OPTIONS'])('blocks %s including Server Actions and worker calls',async method=>{
 const res=await proxy(new NextRequest('https://erp.invalid/dashboard',{method,headers:{'next-action':'synthetic','authorization':'Bearer synthetic'}}));expect(res.status).toBe(503);expect(state.refresh).not.toHaveBeenCalled();
});
it('returns branded HTML with no scripts, requests, forms or auto-reload',async()=>{
 const res=await proxy(new NextRequest('https://erp.invalid/login',{headers:{accept:'text/html'}}));const html=await res.text();expect(html).toContain('ALGT ERP');expect(html).toContain('unsaved work');expect(html).not.toMatch(/<script|<form|http-equiv|https?:\/\//i);expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
});
it('health is liveness-only and has no Auth dependency',async()=>{
 const res=await proxy(new NextRequest('https://erp.invalid/api/health/release'));expect(await res.json()).toEqual({service:'algt-erp',status:'maintenance',check:'liveness-only'});expect(state.refresh).not.toHaveBeenCalled();
});
it.each(['/api/health/release/child','/api/health/release.png'])('health-like path %s is not a bypass',async path=>expect((await proxy(new NextRequest('https://erp.invalid'+path))).status).toBe(503));
it('health POST remains blocked and HEAD has no body',async()=>{
 expect((await proxy(new NextRequest('https://erp.invalid/api/health/release',{method:'POST'}))).status).toBe(503);
 const head=await proxy(new NextRequest('https://erp.invalid/dashboard',{method:'HEAD'}));expect(head.status).toBe(503);expect(await head.text()).toBe('');
});
it('normal mode keeps assets out of Auth but business paths in it',async()=>{
 vi.stubEnv('ERP_MAINTENANCE_MODE','0');await proxy(new NextRequest('https://erp.invalid/logo.png'));expect(state.refresh).not.toHaveBeenCalled();await proxy(new NextRequest('https://erp.invalid/dashboard'));expect(state.refresh).toHaveBeenCalledOnce();
});
it('normal-mode liveness remains no-store without exposing environment values',async()=>{
 vi.stubEnv('ERP_MAINTENANCE_MODE','0');const res=await proxy(new NextRequest('https://erp.invalid/api/health/release'));expect(await res.json()).toEqual({service:'algt-erp',status:'ok',check:'liveness-only'});expect(res.headers.get('cache-control')).toContain('no-store');expect(state.refresh).not.toHaveBeenCalled();
});
