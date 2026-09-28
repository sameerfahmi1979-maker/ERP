import { afterEach,expect,it,vi } from 'vitest';
import { gotenbergConvertHtml,gotenbergConvertUrl } from '@/lib/pdf/gotenberg';
import { signPrintToken,verifyPrintToken } from '@/lib/pdf/print-token';
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
function config(){vi.stubEnv('NODE_ENV','production');vi.stubEnv('GOTENBERG_URL','https://renderer.example.invalid');vi.stubEnv('INTERNAL_SITE_URL','http://app.internal:3000');}
it('actual PDF adapter rejects wrong-origin print requests before network I/O',async()=>{
 config();const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 await expect(gotenbergConvertUrl({url:'http://localhost:9999/print/employee/1?token=synthetic'})).rejects.toThrow('configured internal');expect(fetch).not.toHaveBeenCalled();
});
it('actual PDF adapter posts only to configured private renderer and computes output checksum',async()=>{
 config();const fetch=vi.fn(async()=>new Response('%PDF-synthetic'));
 vi.stubGlobal('fetch',fetch);const result=await gotenbergConvertHtml({html:'<p>synthetic</p>'});
 expect(fetch.mock.calls[0][0]).toBe('https://renderer.example.invalid/forms/chromium/convert/html');
 expect(result.buffer.toString()).toBe('%PDF-synthetic');expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
});
it('private print signing reads runtime configuration and rejects a retired secret',()=>{
 vi.stubEnv('PDF_PRINT_TOKEN_SECRET','synthetic-test-only-secret-version-one');
 const token=signPrintToken({templateKey:'synthetic',recordType:'employee',recordId:90001,userId:90002,ownerCompanyId:90003});
 expect(verifyPrintToken(token).recordId).toBe(90001);
 vi.stubEnv('PDF_PRINT_TOKEN_SECRET','synthetic-test-only-secret-version-two');
 expect(()=>verifyPrintToken(token)).toThrow('signature');
});
