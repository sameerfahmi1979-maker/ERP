import {expect,it,vi} from 'vitest';
vi.mock('@/server/reads/salary-snapshot',()=>({readSalarySnapshot:vi.fn()}));
import {employmentConfirmationFetcher} from '@/server/actions/reports/hr/hr-letter-documents';
function source(employment:{name_en:string}|null,error:unknown=null,status='active',joining='2019-01-01'){
 const query={select:vi.fn(()=>query),eq:vi.fn(()=>query),is:vi.fn(()=>query),single:vi.fn(async()=>({error,data:{id:7,employee_code:'SYN-7',employee_status:status,full_name_en:'SYNTHETIC PERSON',full_name_ar:'موظف اختبار',joining_date:joining,owner_company_id:1,owner_company:{legal_name_en:'SYNTHETIC COMPANY',legal_name_ar:'شركة اختبار'},designation:{designation_name_en:'Manager',designation_name_ar:'مدير'},employment_type:employment}}))};
 return {query,db:{from:vi.fn(()=>query)}};
}
it('projects the existing authorized employment-type relationship without changing the employee/company binding',async()=>{
 const {query,db}=source({name_en:'Part Time'});
 const result=await employmentConfirmationFetcher.fetch({employee_id:'7'},[],db as never);
 expect(db.from).toHaveBeenCalledExactlyOnceWith('employees');expect(query.eq).toHaveBeenCalledWith('id',7);
 expect(result.rows[0]).toMatchObject({employee_name:'SYNTHETIC PERSON',owner_company_id:1,employment_type:'Part Time'});
 expect(result.meta?.sourceRecordId).toBe(7);
});
it('keeps a missing employment type empty and never invents full-time facts',async()=>{
 const {db}=source(null);expect((await employmentConfirmationFetcher.fetch({employee_id:'7'},[],db as never)).rows[0].employment_type).toBe('');
});
it('fails a rejected employee read instead of producing a partial confirmation',async()=>{
 const {db}=source(null,{message:'PRIVATE'});await expect(employmentConfirmationFetcher.fetch({employee_id:'7'},[],db as never)).rejects.toThrow('Authorized employee source could not be loaded');
});
it.each(['inactive','suspended','terminated','archived','unknown'])('cannot certify current employment for %s source status',async status=>{
 const {db}=source(null,null,status);await expect(employmentConfirmationFetcher.fetch({employee_id:'7'},[],db as never)).rejects.toThrow('Current employment');
});
it.each(['active','on_leave','probation'])('accepts verified current employment in %s status',async status=>{
 const {db}=source(null,null,status);expect((await employmentConfirmationFetcher.fetch({employee_id:'7'},[],db as never)).rows).toHaveLength(1);
});
it('does not certify a future start date as completed employment',async()=>{
 const {db}=source(null,null,'active','2099-01-01');await expect(employmentConfirmationFetcher.fetch({employee_id:'7'},[],db as never)).rejects.toThrow('Current employment');
});
