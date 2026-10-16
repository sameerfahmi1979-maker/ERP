import {expect,it} from 'vitest';
import fs from 'node:fs';
import {candidateConversionInputSchema,candidateConversionContractSchema,requisitionCreationSchema,requisitionCreationContractSchema} from '@/lib/hr/numbered-recruitment-contract';
const valid={owner_company_id:1,joining_date:'2026-10-04',emergency_contact_name:'Contact',emergency_contact_mobile:'000'};
const op='5e6a4fad-ad32-4c77-9774-78411fbdb954';
it.each([0,-1,1.2,Number.MAX_SAFE_INTEGER+1,'1'])('rejects malformed IDs %s',id=>{expect(candidateConversionInputSchema.safeParse({...valid,owner_company_id:id}).success).toBe(false);});
it.each(['2026-02-30','bad','2026-2-01',''])('rejects malformed date %s',joining_date=>{expect(candidateConversionInputSchema.safeParse({...valid,joining_date}).success).toBe(false);});
it.each(['emergency_contact_name','emergency_contact_mobile'])('requires real nonblank %s',field=>{expect(candidateConversionInputSchema.safeParse({...valid,[field]:'   '}).success).toBe(false);});
it.each([0,-1,1.5,2147483648])('rejects vacancies %s without inventing one',vacancies_count=>{expect(requisitionCreationSchema.safeParse({requisition_title:'Synthetic',vacancies_count}).success).toBe(false);});
it('rejects protected/unknown fields and impossible branch-only scope',()=>{expect(requisitionCreationSchema.safeParse({requisition_title:'Synthetic',requisition_code:'Injected'}).success).toBe(false);expect(candidateConversionInputSchema.safeParse({...valid,employee_code:'Injected'}).success).toBe(false);expect(requisitionCreationSchema.safeParse({requisition_title:'Synthetic',branch_id:1}).success).toBe(false);});
it('requires different create and conversion revision contracts',()=>{expect(requisitionCreationContractSchema.safeParse({operationId:op,revision:null}).success).toBe(true);expect(candidateConversionContractSchema.safeParse({operationId:op,revision:'3'}).success).toBe(true);expect(candidateConversionContractSchema.safeParse({operationId:op,revision:null}).success).toBe(false);expect(requisitionCreationContractSchema.safeParse({operationId:op,revision:'3'}).success).toBe(false);});
const sql=fs.readFileSync('supabase/migrations/20261004182739_f06_numbered_recruitment_consumers.sql','utf8');
it('retains invoker F03 writes and independent public allocator authority',()=>{expect(sql).toMatch(/function public\.create_numbered_job_requisition[\s\S]*?security invoker/);expect(sql).toMatch(/function public\.convert_candidate_to_employee_atomic[\s\S]*?security invoker/);expect(sql).toContain('public.allocate_numbering_reference');expect(sql).toContain('public.finish_numbering_reservation');expect(sql).not.toContain('erp_private.numbering_allocate(');expect(sql).not.toMatch(/alter policy|drop policy|grant.*on public\.employees/i);});
it('uses current source revision, full affected count, immutable receipt replay and late authority checks',()=>{expect(sql).toContain('c.workspace_revision<>p_revision');expect(sql).toContain('affected<>cardinality(tasks)');expect(sql).toContain("receipt->>'hash'<>h");expect(sql).toContain("return receipt->'result'||jsonb_build_object('replayed',replay)");expect(sql.match(/public\.current_user_can_manage_employee\(employee_id\)/g)?.length).toBeGreaterThanOrEqual(2);});
it('receipt writer is trigger-only, and source/link statement locks precede row guards',()=>{expect(sql).toContain('revoke all on function erp_private.capture_recruitment_consumer_receipt() from public,anon,authenticated,service_role');expect(sql).toContain('before insert or update or delete on public.employee_recruitment_links for each statement');expect(sql).toContain('before insert or update or delete on public.hr_onboarding_tasks for each statement');expect(sql).toContain('Candidate already has a conversion link');});
it('qualifies conversion-local variables through their explicitly labelled declaration block',()=>{
 const body=sql.slice(sql.indexOf('create function public.convert_candidate_to_employee_atomic('),sql.indexOf('revoke all on function public.convert_candidate_to_employee_atomic('));
 expect(body).toMatch(/<<conversion_state>>\s*declare [^\n]*employee_id bigint;employee_code text;/);
 expect(body).toContain('e.employee_code=conversion_state.employee_code');
 expect(body).toContain('set employee_id=conversion_state.employee_id');
 expect(body).toContain('end conversion_state;');
 expect(body).not.toMatch(/convert_candidate_to_employee_atomic\.employee_(?:code|id)/);
});
it.each([
 'e.id=conversion_state.employee_id',
 'l.employee_id=conversion_state.employee_id',
 'l.offer_id is not distinct from conversion_state.offer_id',
 'l.requisition_id is not distinct from conversion_state.req_id',
])('disambiguates replay identity predicate %s',predicate=>{
 const conversion=sql.slice(sql.indexOf('create function public.convert_candidate_to_employee_atomic('));
 const replay=conversion.slice(conversion.indexOf('if replay then'),conversion.indexOf('\n else\n'));
 expect(replay).toContain(predicate);
 expect(replay).not.toMatch(/\bl\.(employee_id|offer_id)\s*(?:=|is not distinct from)\s*\1\b/);
});
it('does not trust GUC reference/hash without actual INSERT and allocation proof',()=>{
 expect(sql).toContain('function erp_private.prove_recruitment_target_insert()');
 expect(sql).toContain('after insert on public.employees for each row execute function erp_private.prove_recruitment_target_insert()');
 expect(sql).toContain("r.request_hash=md5(jsonb_build_array(null::bigint,v_rule,null::text,'reserved'::text,v_table,null::bigint,v_reason)::text)");
 expect(sql).toContain('Recruitment INSERT requires its matching reserved number');expect(sql).toContain('Receipt requires current authoritative INSERT proof');
 expect(sql).toContain('v_proof.transaction_id<>pg_current_xact_id()');expect(sql).toContain('Receipt requires consumed matching allocation and target');
});
it.each(['owner_company_id','branch_id','department_id','designation_id','work_site_id','requested_by','hiring_manager_id','employment_type_id','employee_category_id','target_start_date','budgeted_salary_min','budgeted_salary_max','job_description','requirements','notes'])('binds omitted requisition %s to its canonical null, not caller INSERT extras',field=>{
 const proof=sql.slice(sql.indexOf("if v_kind='requisition' then"),sql.indexOf('\n else\n'));
 const expected=proof.slice(proof.indexOf('v_expected:='),proof.indexOf('if not to_jsonb(new)'));
 expect(expected).toContain(`'${field}',null`);
 expect(expected.indexOf(`'${field}',null`)).toBeLessThan(expected.indexOf('||v_data'));
});
it('completion is deferred, fact-based, exact and automatically removes all private proof data',()=>{
 expect(sql).toContain('deferrable initially deferred for each row execute function erp_private.complete_recruitment_consumer_proof()');
 expect(sql).toContain('Actual conversion update/insert proof missing');expect(sql).toContain('Recruitment audit completion is incomplete');expect(sql).toContain('Onboarding completion is incomplete');
 expect(sql).toContain('v_receipt.result is distinct from v_expected');expect(sql).toContain('v_hash is distinct from v_fact.row_hash');
 expect(sql).toContain('references erp_private.recruitment_consumer_proofs(actor,operation_id) on delete cascade');expect(sql).toContain('delete from erp_private.recruitment_consumer_proofs');
 for(const table of ['recruitment_consumer_receipts','recruitment_consumer_proofs','recruitment_consumer_facts'])expect(sql).toContain(`alter table erp_private.${table} owner to postgres`);
 expect(sql).toContain('revoke all on function erp_private.complete_recruitment_consumer_proof() from public,anon,authenticated,service_role');
});
it('parenthesizes SQL CASE so its THEN cannot terminate the outer PL/pgSQL IF condition',()=>{
 expect(sql).toContain("if v_count<>(case when v_proof.kind='requisition' then 1 else jsonb_array_length(v_tasks)+5 end) then");
 expect(sql).not.toMatch(/if\s+v_count\s*<>\s*case\s+when/i);
});
it('sets exact untrusted request context before employee INSERT and keeps it through business audit completion',()=>{
 const body=sql.slice(sql.indexOf('create function public.convert_candidate_to_employee_atomic('),sql.indexOf('revoke all on function public.convert_candidate_to_employee_atomic('));
 expect(body.indexOf("set_config('erp.recruitment_consumer',jsonb_build_object")).toBeLessThan(body.indexOf('insert into public.employees('));
 expect(body.indexOf("set_config('erp.recruitment_consumer','',true)")).toBeGreaterThan(body.indexOf('insert into public.audit_logs('));
 expect(body).toContain("'payload',p_data,'candidate_id',p_candidate,'revision',p_revision");
});
