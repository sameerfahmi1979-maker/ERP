import {beforeEach,expect,it,vi} from 'vitest';
import {z} from 'zod';
const m=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:m.rpc})}));
import {reviewedCall} from '@/server/dms-reviewed-updates';
import {savedIntakeErrorCodes,savedIntakeErrorMessages} from '@/lib/dms/saved-intake-errors';
import {savedIntakeFilenameError} from '@/lib/dms/saved-intake';
beforeEach(()=>vi.clearAllMocks());
const call=()=>reviewedCall('dms_saved_intake_review',{},z.unknown(),savedIntakeErrorCodes,savedIntakeErrorMessages);
it('identifies the known rejected field group without exposing SQL or payload',async()=>{
 m.rpc.mockResolvedValue({error:{code:'22023',message:'Invalid intake fields or file extension',details:'PRIVATE DATA'}});
 const r=await call();expect(r).toMatchObject({success:false,uncertain:false});expect(r.error).toContain('intake-fields');expect(JSON.stringify(r)).not.toContain('PRIVATE');
});
it('reports a safe schema reference while withholding database details',async()=>{
 m.rpc.mockResolvedValue({error:{code:'42703',message:'column PRIVATE missing',details:'PRIVATE DATA'}});
 const r=await call();expect(r.error).toContain('intake-42703');expect(JSON.stringify(r)).not.toContain('PRIVATE');
});
it('never converts an unknown outcome to a definite rejection',async()=>{
 m.rpc.mockResolvedValue({error:{code:'XX000',message:'Invalid intake fields or file extension'}});
 const r=await call();expect(r.uncertain).toBe(true);expect(r.error).not.toContain('intake-fields');
});
it('does not apply a known message to the wrong error code',async()=>{
 m.rpc.mockResolvedValue({error:{code:'42501',message:'Invalid intake fields or file extension'}});
 const r=await call();expect(r.errorCode).toBe('permission_denied');expect(r.error).not.toContain('intake-fields');
});
it('catches missing or changed saved-file extensions before submitting',()=>{
 expect(savedIntakeFilenameError('Renamed','Original.pdf')).toBe('Keep the original .pdf file extension.');
 expect(savedIntakeFilenameError('Renamed.exe','Original.pdf')).toBeTruthy();
 expect(savedIntakeFilenameError('Renamed.PDF','Original.pdf')).toBeNull();
 expect(savedIntakeFilenameError('Renamed','Original')).toBeNull();
});
