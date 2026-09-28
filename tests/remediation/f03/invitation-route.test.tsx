import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const state=vi.hoisted(()=>({confirm:vi.fn()}));
vi.mock('@/lib/auth/confirm-link',()=>({confirmAuthLink:state.confirm}));
import { GET } from '@/app/auth/confirm/route';
import VerifyPage from '@/app/(auth)/auth/verify/page';
beforeEach(()=>{state.confirm.mockReset();vi.stubEnv('NEXT_PUBLIC_SITE_URL','https://erp.algt.net');});
afterEach(()=>{vi.unstubAllEnvs();});
it.each([
 ['https://erp.algt.net','https://erp.algt.net'],
 ['http://127.0.0.1:16401','http://127.0.0.1:16401'],
 [undefined,'https://erp.algt.net'],
])('callback uses configured origin %s or fallback, clears fragments and never trusts request host',async(configured,expected)=>{
 vi.stubEnv('NEXT_PUBLIC_SITE_URL',configured);
 const response=await GET(new NextRequest('https://untrusted-host.invalid/auth/confirm'));
 expect(response.headers.get('location')).toBe(expected+'/auth/link-error?reason=invalid_invite_link#');
 expect(response.headers.get('cache-control')).toContain('no-store');expect(response.headers.get('referrer-policy')).toBe('no-referrer');
 expect(state.confirm).not.toHaveBeenCalled();
});
it('initial ERP invitation GET renders a form without verifying/consuming anything',async()=>{
 const result=await VerifyPage({searchParams:Promise.resolve({invitation:'a'.repeat(43)})});
 expect(result.props).toEqual({invitation:'a'.repeat(43),flow:'invite'});expect(state.confirm).not.toHaveBeenCalled();
});
it('legacy token-hash callback forwards to a non-consuming page, not provider verification',async()=>{
 const response=await GET(new NextRequest('https://erp.algt.net/auth/confirm?token_hash='+'a'.repeat(64)+'&type=invite'));
 expect(response.headers.get('location')).toContain('/auth/verify?token_hash=');expect(state.confirm).not.toHaveBeenCalled();
});
it('ambiguous mixed credentials are rejected before verification',async()=>{
 await expect(VerifyPage({searchParams:Promise.resolve({invitation:'a'.repeat(43),type:'invite',token_hash:'a'.repeat(64)})})).rejects.toThrow('NEXT_REDIRECT');
 expect(state.confirm).not.toHaveBeenCalled();
});
