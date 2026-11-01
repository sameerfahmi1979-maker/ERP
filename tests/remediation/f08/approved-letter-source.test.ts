import {expect,it,vi} from 'vitest';
vi.mock('@/server/reads/salary-snapshot',()=>({readSalarySnapshot:vi.fn()}));
import {employmentLetterFetcher,salaryCertGeneralFetcher,nocFetcher,joiningChecklistFetcher,ppeIssueFormFetcher} from '@/server/actions/reports/hr/hr-letter-documents';
import type {ReportReadClient} from '@/lib/report-center/scoped-read-client';
function fixture(ppeError=false){
 const calls:unknown[][]=[];
 const emp={id:7,employee_code:'SYN-7',full_name_en:'SYNTHETIC PERSON',full_name_ar:'موظف اختبار',employee_status:'active',gender:'female',joining_date:'2020-01-01',owner_company_id:1,owner_company:{legal_name_en:'SYNTHETIC COMPANY',legal_name_ar:'شركة اختبار'},designation:{designation_name_en:'Engineer',designation_name_ar:'مهندسة'},department:{department_name_en:'Operations'},employment_type:{name_en:'Full Time'}};
 const db={from:(table:string)=>{
  calls.push(['from',table]);const response=table==='employees'?{data:emp,error:null}:table==='employee_ppe_issues'?{data:[{ppe_item_name:'Helmet',quantity:null,issue_date:'2026-10-20',issued_by_profile:{display_name:'Synthetic issuer'}}],error:ppeError?{message:'PRIVATE'}:null}:{data:[],error:null};
  const q:Record<string,unknown>={then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(response).then(resolve)};
  for(const method of ['select','eq','is','single','order','limit'])q[method]=(...args:unknown[])=>{calls.push([table,method,...args]);return q;};return q;
 }} as unknown as ReportReadClient;
 return {db,calls};
}
it.each([employmentLetterFetcher,salaryCertGeneralFetcher,nocFetcher,joiningChecklistFetcher])('$reportCode preserves selected employee/company scope and passes real Arabic/current-employment facts',async fetcher=>{
 const {db,calls}=fixture(),result=await fetcher.fetch({employee_id:7},[],db);
 expect(result.meta?.sourceRecordId).toBe(7);
 for(const row of result.rows)expect(row).toMatchObject({employee_name_ar:'موظف اختبار',company_name_ar:'شركة اختبار',designation_ar:'مهندسة',employee_status:'active',gender:'female',owner_company_id:1});
 expect(calls).toContainEqual(['employees','eq','id',7]);
 expect(calls.some(([table,method,value])=>table==='employees'&&method==='select'&&String(value).includes('gender'))).toBe(true);
});
it('does not manufacture a PPE quantity or condition and maps only the actual issuer',async()=>{
 const {db}=fixture(),result=await ppeIssueFormFetcher.fetch({employee_id:7},[],db);
 expect(result.rows[0]).toMatchObject({quantity:null,condition:'[Not recorded]',issuer:'Synthetic issuer'});
});
it('rejects an unavailable custody read instead of returning a certifiable empty form',async()=>{
 const {db}=fixture(true);await expect(ppeIssueFormFetcher.fetch({employee_id:7},[],db)).rejects.toThrow('PPE custody records could not be verified');
});
