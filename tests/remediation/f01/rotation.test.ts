import { afterEach, expect, it, vi } from 'vitest';
afterEach(()=>{vi.unstubAllEnvs();vi.resetModules();});
it('print-secret rotation rejects old synthetic signatures and accepts new ones',async()=>{
 const payload={templateKey:'F01',recordType:'synthetic',recordId:910903,userId:1,ownerCompanyId:900101};
 vi.stubEnv('PDF_PRINT_TOKEN_SECRET','F01-old-synthetic-signing-key-not-production-111');vi.resetModules();
 const old=await import('@/lib/pdf/print-token');const token=old.signPrintToken(payload);expect(old.verifyPrintToken(token).recordId).toBe(910903);
 vi.stubEnv('PDF_PRINT_TOKEN_SECRET','F01-new-synthetic-signing-key-not-production-222');vi.resetModules();
 const next=await import('@/lib/pdf/print-token');expect(()=>next.verifyPrintToken(token)).toThrow('signature');expect(next.verifyPrintToken(next.signPrintToken(payload)).recordId).toBe(910903);
});
