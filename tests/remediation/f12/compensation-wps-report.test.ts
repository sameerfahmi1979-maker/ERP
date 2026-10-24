import {expect,it} from 'vitest';
import {wpsReadinessFetcher} from '@/server/actions/reports/hr/wps-readiness-report';
import type {ReportReadClient} from '@/lib/report-center/scoped-read-client';
function fixture(n=1){
 const tables:Record<string,unknown[]>={employees:[],employee_payroll_profiles:[],employee_wps_profiles:[],employee_salary_components:[],employee_salary_revision_effects:[],employee_payroll_holds:[]};
 for(let employee_id=1;employee_id<=n;employee_id++){
  tables.employees.push({id:employee_id,employee_code:`SYN-${employee_id}`,full_name_en:'Synthetic only',employee_status:'active',joining_date:'2020-01-01',owner_company_id:1,owner_company:{legal_name_en:'Synthetic'}});
  tables.employee_payroll_profiles.push({employee_id,effective_date:'2020-01-01',currency:'USD',payroll_status:'active'});
  tables.employee_wps_profiles.push({employee_id,wps_applicable:true,wps_status:'active',salary_payment_method:'bank_transfer',labour_card_number:'PRIVATE_LABOUR',mohre_person_code:'PRIVATE_MOHRE',bank_id:1,iban:'PRIVATE_IBAN',account_number:'0000000123',exchange_house:null,bank:{bank_name_en:'Synthetic bank'}});
  tables.employee_salary_components.push({id:employee_id,employee_id,component_type_id:1,amount:'0.10',effective_from:'2020-01-01',effective_to:null,is_active:true,deleted_at:null,component_type:{component_kind:'earning',is_basic:true}});
 }
 for(const rows of Object.values(tables))for(const row of rows){const value=row as Record<string,unknown>;value.workspace_revision=1;if(value.component_type)(value.component_type as Record<string,unknown>).workspace_revision=1;}
 const calls:unknown[][]=[],errors=new Set<string>(),reads=new Map<string,number>();
 const hooks={onRead:(_table:string,_count:number)=>{void _table;void _count;}};
 const db={from:(table:string)=>{
  calls.push(['from',table]);const q:Record<string,unknown>={then:(resolve:(v:unknown)=>unknown)=>{const count=(reads.get(table)??0)+1;reads.set(table,count);hooks.onRead(table,count);return Promise.resolve({data:structuredClone(tables[table]),error:errors.has(table)?{message:'PRIVATE_PROVIDER_ERROR'}:null}).then(resolve);}};
  for(const method of ['select','eq','in','is','order'])q[method]=(...args:unknown[])=>{calls.push([table,method,...args]);return q;};return q;
 }} as unknown as ReportReadClient;
 return{tables,db,calls,errors,hooks};
}
const run=(db:ReportReadClient,filters:Record<string,unknown>={})=>wpsReadinessFetcher.fetch(filters,[],db);
it('complete scoped internal readiness uses dated salary without exposing account/identity/salary facts',async()=>{
 const f=fixture();const result=await run(f.db);expect(result.rows[0]).toMatchObject({readiness_status:'ready',employee_code:'SYN-1'});expect(result.meta?.total).toBe(1);
 const text=JSON.stringify(result);for(const secret of ['PRIVATE_','0000000123','gross_salary','basic_salary','paid','bankAccepted'])expect(text).not.toContain(secret);
 expect(f.calls.filter(c=>c[0]==='from')).toHaveLength(12);
 expect(result.meta).toMatchObject({reviewOnly:true,asOf:expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),sourceFingerprint:expect.stringMatching(/^[a-f0-9]{64}$/)});
});
it('no per-employee queries or first-N export cap for 1107 permitted subjects',async()=>{
 const f=fixture(1107);const r=await run(f.db);expect(r.rows).toHaveLength(1107);expect(r.meta?.total).toBe(1107);expect(f.calls.filter(c=>c[0]==='from')).toHaveLength(12);
});
it('readiness filtering reconciles count and owner metadata to returned rows',async()=>{
 const f=fixture(2);f.tables.employee_payroll_holds.push({id:1,employee_id:2,workspace_revision:1,is_active:true});
 const r=await run(f.db,{readiness_status:'ready'});expect(r.rows).toHaveLength(1);expect(r.meta?.total).toBe(1);expect(r.rows[0].employee_code).toBe('SYN-1');
});
it.each(['employees','employee_wps_profiles','employee_payroll_profiles','employee_salary_components','employee_salary_revision_effects','employee_payroll_holds'])('failed %s source aborts rather than silently issuing a partial review',async table=>{
 const f=fixture();f.errors.add(table);await expect(run(f.db)).rejects.toThrow('unavailable');
});
it('missing profile, salary overlap and inactive profiles cannot claim Ready',async()=>{
 for(const mode of ['missing','overlap','inactive']){
  const f=fixture();if(mode==='missing')f.tables.employee_payroll_profiles=[];
  if(mode==='inactive')(f.tables.employee_payroll_profiles[0] as Record<string,unknown>).payroll_status='inactive';
  if(mode==='overlap')f.tables.employee_salary_components.push({...f.tables.employee_salary_components[0] as object,id:2});
  expect((await run(f.db)).rows[0].readiness_status).toBe('incomplete');
 }
});
it('foreign subject and duplicate singleton facts are rejected',async()=>{
 for(const mode of ['foreign','duplicate']){const f=fixture();f.tables.employee_payroll_profiles.push({...f.tables.employee_payroll_profiles[0] as object,employee_id:mode==='foreign'?9:1});await expect(run(f.db)).rejects.toThrow();}
});
it('actual applied revision overrides Basic but pending proposals are never queried',async()=>{
 const f=fixture();f.tables.employee_salary_revision_effects.push({id:1,employee_id:1,revision_id:7,effective_date:'2020-01-02',new_basic:'0.20',currency:'USD'});
 expect((await run(f.db)).rows[0].readiness_status).toBe('ready');expect(f.calls.flat().join(' ')).not.toContain('employee_salary_revisions');
});
it('empty authorized selection is distinct from failure and needs no child reads',async()=>{
 const f=fixture(0);expect(await run(f.db)).toMatchObject({rows:[],meta:{total:0}});expect(f.calls.filter(c=>c[0]==='from')).toHaveLength(2);
});
it.each(['employees','employee_payroll_profiles','employee_wps_profiles','employee_salary_components'])('rejects changed %s versions instead of exporting mixed facts',async table=>{
 const f=fixture();f.hooks.onRead=(name,count)=>{if(name===table&&count===2)(f.tables[table][0] as Record<string,unknown>).workspace_revision=2;};
 await expect(run(f.db)).rejects.toThrow('sources changed');
});
it.each(['selection','type','effect','hold'])('reconciles changed %s and never hides differences by retrying',async mode=>{
 const f=fixture();f.hooks.onRead=(table,count)=>{
  if(count!==2)return;
  if(mode==='selection'&&table==='employees')f.tables.employees=[];
  if(mode==='type'&&table==='employee_salary_components')((f.tables[table][0] as Record<string,unknown>).component_type as Record<string,unknown>).workspace_revision=2;
  if(mode==='effect'&&table==='employee_salary_revision_effects')f.tables[table].push({id:1,employee_id:1,revision_id:7,effective_date:'2020-01-02',new_basic:'0.20',currency:'USD'});
  if(mode==='hold'&&table==='employee_payroll_holds')f.tables[table].push({id:1,employee_id:1,workspace_revision:1,is_active:true});
 };
 await expect(run(f.db)).rejects.toThrow('sources changed');expect(f.calls.filter(c=>c[0]==='from'&&c[1]==='employees')).toHaveLength(2);
});
it('sanitizes malformed confidential facts instead of exposing values through schema errors',async()=>{
 const f=fixture();(f.tables.employee_wps_profiles[0] as Record<string,unknown>).iban={private:'PRIVATE_ACCOUNT'};
 await expect(run(f.db)).rejects.toThrow(/^Complete payroll review sources unavailable$/);
});
