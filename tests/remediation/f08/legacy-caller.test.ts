import {beforeEach,expect,it,vi} from 'vitest';
const generate=vi.hoisted(()=>vi.fn());
vi.mock('@/server/actions/output/generate-official-document',()=>({generateOfficialDocument:generate}));
import {generateHrEmploymentLetterPdf} from '@/server/actions/pdf/generate-hr-letter';
beforeEach(()=>{vi.resetAllMocks();generate.mockResolvedValue({success:true,issuanceId:7,downloadUrl:'/api/output/file?issuanceId=7',fileSizeBytes:100});});
it('retires standalone generation without an original request token',async()=>{expect((await generateHrEmploymentLetterPdf({employeeId:1})).success).toBe(false);expect(generate).not.toHaveBeenCalled();});
it.each([-1,0,NaN])('denies invalid employee %s before admission',async employeeId=>{expect((await generateHrEmploymentLetterPdf({employeeId,clientRequestToken:'synthetic-token'})).success).toBe(false);expect(generate).not.toHaveBeenCalled();});
it('does not let legacy template/route selections bypass the canonical fixed definition',async()=>{expect((await generateHrEmploymentLetterPdf({employeeId:1,templateKey:'arbitrary',clientRequestToken:'synthetic-token'})).success).toBe(false);expect(generate).not.toHaveBeenCalled();});
it('always forwards the same caller token to canonical durable issuance, including retries',async()=>{
 const input={employeeId:1,clientRequestToken:'synthetic-stable-token'};await generateHrEmploymentLetterPdf(input);await generateHrEmploymentLetterPdf(input);
 expect(generate.mock.calls[0]).toEqual(generate.mock.calls[1]);expect(generate).toHaveBeenCalledWith('HR_EMPLOYMENT_LETTER',1,expect.objectContaining({clientRequestToken:input.clientRequestToken,language:'en'}));
});
