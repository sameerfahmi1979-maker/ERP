// Direct server-handler/library tests with offline data/render ports; no browser.
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {createElement} from 'react';
const m=vi.hoisted(()=>({db:vi.fn(),load:vi.fn(),render:vi.fn(),healthy:vi.fn(),url:vi.fn(),version:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:m.db}));
vi.mock('@/components/erp/print/templates/hr-employment-letter',()=>({loadHrEmploymentLetterData:m.load,renderHrEmploymentLetter:m.render}));
vi.mock('@/components/erp/print/templates/sample-quotation',()=>({loadSampleQuotationData:m.load,renderSampleQuotation:m.render}));
vi.mock('@/components/erp/print/templates/bilingual-sample',()=>({loadBilingualSampleData:m.load,renderBilingualSample:m.render}));
vi.mock('@/lib/pdf/gotenberg',()=>({isGotenbergHealthy:m.healthy,gotenbergConvertUrl:m.url,getGotenbergVersion:m.version}));
import {GET} from '@/app/print/[templateKey]/[recordType]/[recordId]/route';
import {renderPdf} from '@/lib/pdf/renderer';
import {signPrintToken} from '@/lib/pdf/print-token';
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv('PDF_PRINT_TOKEN_SECRET','synthetic-h05-print-secret-at-least-32-characters');vi.stubEnv('NODE_ENV','test');
 const q={select:()=>q,eq:()=>q,is:()=>q,single:async()=>({data:{id:1,governance_status:'approved',template_name:'Synthetic'},error:null})};m.db.mockReturnValue({from:()=>q});
 m.load.mockResolvedValue({synthetic:true});m.render.mockReturnValue(createElement('p',null,'SYNTHETIC LEGACY OUTPUT'));
 m.healthy.mockResolvedValue(true);m.url.mockResolvedValue({buffer:Buffer.from('%PDF-1.4\n%%EOF'),checksum:'synthetic',fileSizeBytes:14});m.version.mockResolvedValue('synthetic-version');
});
afterEach(()=>vi.unstubAllEnvs());
it.each(['missing','invalid','formerly-valid'] as const)('retired print route ignores %s bearer without querying private data',async kind=>{
 const u=new URL('http://erp.invalid/print/hr-employment-letter-en/employee/41');
 if(kind!=='missing')u.searchParams.set('token',kind==='invalid'?'invalid':signPrintToken({templateKey:'hr-employment-letter-en',recordType:'employee',recordId:41,userId:0,ownerCompanyId:1}));
 const r=await GET(new NextRequest(u),{params:Promise.resolve({templateKey:'hr-employment-letter-en',recordType:'employee',recordId:'41'})});
 expect(r.status).toBe(410);expect(r.headers.get('cache-control')).toContain('no-store');expect(r.headers.get('referrer-policy')).toBe('no-referrer');expect(await r.text()).not.toContain('SYNTHETIC LEGACY OUTPUT');expect(m.db).not.toHaveBeenCalled();expect(m.load).not.toHaveBeenCalled();expect(m.render).not.toHaveBeenCalled();
});
it('retired renderer fails before network, token issuance or input-dependent legacy loading',async()=>{
 await expect(renderPdf({templateKey:'hr-employment-letter-en',ownerCompanyId:1,sourceRecordType:'employee',sourceRecordId:41,locale:'en',direction:'ltr',pageSize:'A4',orientation:'portrait',outputProfile:'standard'}, {userId:1})).rejects.toThrow(/retired/i);
 expect(m.healthy).not.toHaveBeenCalled();expect(m.url).not.toHaveBeenCalled();expect(m.version).not.toHaveBeenCalled();
});
