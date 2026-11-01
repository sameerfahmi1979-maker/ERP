import {afterEach,expect,it,vi} from 'vitest';
import {buildVerificationUrl} from '@/lib/public-verification/token';
import {generateQrDataUrl} from '@/lib/public-verification/qr';
afterEach(()=>vi.unstubAllEnvs());
it('separates public verification from local sign-in/navigation without allowing HTTP QR images',async()=>{
 vi.stubEnv('NEXT_PUBLIC_SITE_URL','http://localhost:3000');vi.stubEnv('PUBLIC_VERIFICATION_BASE_URL','https://erp.example.invalid/');
 const url=buildVerificationUrl('synthetic-only');expect(url).toBe('https://erp.example.invalid/verify/synthetic-only');
 expect(await generateQrDataUrl(url)).toMatch(/^data:image\/png;base64,/);
 expect(await generateQrDataUrl('http://localhost:3000/verify/synthetic-only')).toBeNull();
 expect(process.env.NEXT_PUBLIC_SITE_URL).toBe('http://localhost:3000');
});
it.each(['http://localhost:3000','https://user:secret@example.invalid','https://example.invalid/?x=1','https://example.invalid/#x','https://example.invalid/private','javascript:alert(1)',''])('rejects an unsafe verification origin without a silent fallback',url=>{
 vi.stubEnv('PUBLIC_VERIFICATION_BASE_URL',url);expect(()=>buildVerificationUrl('synthetic-only')).toThrow();
});
it('preserves the production HTTPS fallback when no explicit verification origin exists',()=>{
 vi.stubEnv('PUBLIC_VERIFICATION_BASE_URL',undefined);vi.stubEnv('NEXT_PUBLIC_SITE_URL','https://erp.example.invalid/');
 expect(buildVerificationUrl('synthetic-only')).toBe('https://erp.example.invalid/verify/synthetic-only');
});
