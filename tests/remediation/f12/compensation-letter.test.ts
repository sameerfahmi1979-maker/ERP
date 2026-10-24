import {expect,it} from 'vitest';
import {salaryCertWithAmountFetcher} from '@/server/actions/reports/hr/hr-letter-documents';
import type {ReportReadClient} from '@/lib/report-center/scoped-read-client';
function fixture(employeeId=8){
 const calls:unknown[][]=[];const db={from:(table:string)=>{
  let range=0;calls.push(['from',table]);const q:Record<string,unknown>={then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(table==='employees'?{data:{id:employeeId,employee_code:'SYN-8',full_name_en:'Synthetic only',joining_date:'2020-01-01',owner_company_id:1,owner_company:{legal_name_en:'Synthetic'},designation:null},error:null}:table==='employee_payroll_profiles'?{data:{employee_id:8,workspace_revision:1,effective_date:'2020-01-01',currency:'USD',payroll_status:'active'},error:null}:table==='employee_salary_components'?{data:range===0?[{id:1,employee_id:8,workspace_revision:1,component_type_id:1,amount:'0.10',effective_from:'2020-01-01',effective_to:null,is_active:true,deleted_at:null,component_type:{component_kind:'earning',is_basic:true,workspace_revision:1}}]:[],count:1,error:null}:{data:[],count:0,error:null}).then(resolve)};
  for(const method of ['select','eq','is','order','single','maybeSingle','range'])q[method]=(...args:unknown[])=>{if(method==='range')range=Number(args[0]);calls.push([table,method,...args]);return q;};return q;
 }} as unknown as ReportReadClient;return{db,calls};
}
it.each(['hr.payroll.view','hr.payroll.view.self','hr.payroll.view.team'])('%s capability reaches the already-scoped source rather than being falsely rejected',async permission=>{
 const f=fixture();const r=await salaryCertWithAmountFetcher.fetch({employee_id:8},[permission],f.db);expect(r.rows[0]).toMatchObject({basic_salary:'0.10',gross_salary:'0.10',currency:'USD'});expect(r.meta?.salarySourceFingerprint).toMatch(/^[0-9a-f]{64}$/);expect(f.calls.filter(c=>c[0]==='from'&&c[1]==='employee_payroll_profiles')).toHaveLength(2);
});
it('ordinary report capability alone cannot start a salary source read',async()=>{
 const f=fixture();await expect(salaryCertWithAmountFetcher.fetch({employee_id:8},['reports.run'],f.db)).rejects.toThrow('permission');expect(f.calls).toEqual([]);
});
it('wrong employee returned by a source cannot become an issued salary subject',async()=>{
 const f=fixture(9);await expect(salaryCertWithAmountFetcher.fetch({employee_id:8},['hr.payroll.view'],f.db)).rejects.toThrow('not available');expect(f.calls.filter(c=>c[0]==='from')).toHaveLength(1);
});
