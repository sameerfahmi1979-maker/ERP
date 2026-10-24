import {expect,it} from 'vitest';import {eosCasesFetcher} from '@/server/actions/reports/hr/eos-cases-report';import type {ReportReadClient} from '@/lib/report-center/scoped-read-client';
function fixture(error:unknown=null){const rows=[{id:1,employee_id:8,eos_type:'resignation',case_status:'draft',notice_date:'2030-01-01',last_working_date:'2030-01-31',employment_end_date:'2030-02-10',final_settlement_status:'not_started',clearance_completed:false,employee:{employee_code:'SYN-8',full_name_en:'Synthetic',owner_company_id:1}}];const q:Record<string,unknown>={then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:error?null:rows,error}).then(resolve)};for(const m of ['select','is','order','limit','eq','in','gte','lte'])q[m]=()=>q;return{from:()=>q} as unknown as ReportReadClient;}
it('separation report keeps all three dates separate and does not mark finance/clearance complete',async()=>{
 const r=await eosCasesFetcher.fetch({},[],fixture());expect(r.rows[0]).toMatchObject({notice_date:'2030-01-01',last_working_date:'2030-01-31',employment_end_date:'2030-02-10',final_settlement_status:'not_started',clearance_completed:'No'});
});
it('failed separation reads cannot become empty reports or expose internal errors',async()=>{
 await expect(eosCasesFetcher.fetch({},[],fixture({message:'PRIVATE_SQL_ERROR'}))).rejects.toThrow('records unavailable');
 await expect(eosCasesFetcher.fetch({owner_company_id:1},[],fixture({message:'PRIVATE_SQL_ERROR'}))).rejects.toThrow('scope unavailable');
});
