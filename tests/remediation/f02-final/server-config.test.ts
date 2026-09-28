import { describe, expect, it } from 'vitest';
import { assertConfiguredPrintUrl, getAdminConfig, getPdfTransportConfig, getPrintTokenSecret } from '@/lib/config/server-features';
const valid = { NODE_ENV:'production',GOTENBERG_URL:'http://renderer.railway.internal:3000',INTERNAL_SITE_URL:'http://erp.railway.internal:3000' };
describe('feature-dependent private configuration',()=>{
 it('does not require unrelated provider credentials for rendering',()=>{
  expect(getPdfTransportConfig(valid)).toEqual({rendererUrl:valid.GOTENBERG_URL,internalSiteUrl:valid.INTERNAL_SITE_URL,timeoutMs:30000});
 });
 it('fails clearly for missing private renderer URLs without falling back to a public URL',()=>{
  expect(()=>getPdfTransportConfig({NODE_ENV:'production',NEXT_PUBLIC_SITE_URL:'https://public.example.invalid'})).toThrow('GOTENBERG_URL');
  expect(()=>getPdfTransportConfig({...valid,INTERNAL_SITE_URL:undefined})).toThrow('INTERNAL_SITE_URL');
 });
 it.each(['file:///tmp/file','http://name:secret@renderer/','https://renderer/path','https://renderer/?secret=test','https://renderer/#value'])('rejects malformed renderer origin without leaking its value: %s',url=>{
  try { getPdfTransportConfig({...valid,GOTENBERG_URL:url}); throw new Error('accepted'); } catch(e) { expect(String(e)).toContain('GOTENBERG_URL');expect(String(e)).not.toContain(url); }
 });
 it.each(['NaN','0','-1','1.5','999999'])('rejects invalid timeout %s',timeout=>{expect(()=>getPdfTransportConfig({...valid,GOTENBERG_TIMEOUT_MS:timeout})).toThrow('GOTENBERG_TIMEOUT_MS');});
 it('accepts only the exact configured print origin and route',()=>{
  expect(()=>assertConfiguredPrintUrl(valid.INTERNAL_SITE_URL+'/print/employee/1?token=synthetic',valid.INTERNAL_SITE_URL)).not.toThrow();
  for(const url of ['http://127.0.0.1:3000/print/test','http://erp.railway.internal:3000.evil/print/test',valid.INTERNAL_SITE_URL+'/print/../admin',valid.INTERNAL_SITE_URL+'/admin']){
   expect(()=>assertConfiguredPrintUrl(url,valid.INTERNAL_SITE_URL)).toThrow();
  }
 });
 it('requires secrets only when the corresponding feature requests them',()=>{
  expect(()=>getPrintTokenSecret({})).toThrow('PDF_PRINT_TOKEN_SECRET');
  expect(()=>getPrintTokenSecret({PDF_PRINT_TOKEN_SECRET:'short'})).toThrow('32');
  expect(()=>getAdminConfig({NEXT_PUBLIC_SUPABASE_URL:'https://db.example.invalid'})).toThrow('SUPABASE_SERVICE_ROLE_KEY');
 });
});
