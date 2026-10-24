import {describe,expect,it}from 'vitest';
import {employeeCreateShape,employeeUpdateSchema,EMPLOYMENT_FIELDS}from '@/lib/hr/employee-contract';
import {EMPLOYEE_FOUNDATION_FIELDS,changedEmploymentFields,employeeFoundationIssues,employmentChangeSummary,employmentSnapshotAt,employmentFieldLabel}from '@/lib/hr/employee-foundation';
describe('canonical employee foundation',()=>{
 it('accounts for every canonical create field without introducing another source of truth',()=>expect(Object.keys(EMPLOYEE_FOUNDATION_FIELDS).sort()).toEqual(Object.keys(employeeCreateShape).sort()));
 for(const [field,meta]of Object.entries(EMPLOYEE_FOUNDATION_FIELDS))it(`owns ${field}`,()=>{expect(meta.label.length).toBeGreaterThan(1);expect(meta.source.length).toBeGreaterThan(1);expect(['person','employment','organisation','emergency']).toContain(meta.group);expect(typeof meta.required).toBe('boolean');});
 it('does not weaken legacy-null update or silently require optional facts',()=>{expect(employeeUpdateSchema.safeParse({employee_category_id:null,known_name:'Synthetic'}).success).toBe(true);expect(EMPLOYEE_FOUNDATION_FIELDS.nationality_id.required).toBe(false);});
 it('identifies missing and blank required facts, but returns labels not medical values',()=>{const issues=employeeFoundationIssues({blood_group:'PRIVATE_MEDICAL',emergency_contact_mobile:'  '},true);expect(issues).toContainEqual({field:'employee_category_id',code:'legacy-category',label:'Employee Category'});expect(issues.some(row=>row.field==='emergency_contact_mobile')).toBe(true);expect(JSON.stringify(issues)).not.toContain('PRIVATE_MEDICAL');});
 it.each([['date_of_birth','joining_date'],['contract_start_date','contract_end_date'],['probation_start_date','probation_end_date']])('flags reversed %s / %s', (a,b)=>expect(employeeFoundationIssues({[a]:'2026-01-02',[b]:'2026-01-01'})).toContainEqual(expect.objectContaining({field:b,code:'invalid-chronology'})));
 it('treats omission, clear, and zero distinctly',()=>{expect(changedEmploymentFields({notice_period_days:0},{})).toEqual([]);expect(changedEmploymentFields({notice_period_days:0},{notice_period_days:'0'})).toEqual([]);expect(changedEmploymentFields({notice_period_days:1},{notice_period_days:0})).toEqual(['notice_period_days']);expect(changedEmploymentFields({branch_id:7},{branch_id:null})).toEqual(['branch_id']);expect(changedEmploymentFields({branch_id:null},{branch_id:''})).toEqual([]);});
 for(const field of EMPLOYMENT_FIELDS)it(`reviews material ${field} changes`,()=>{const result=employmentChangeSummary({[field]:'before'},{[field]:'after'});expect(result.fields).toContain(field);expect(result.actions.length).toBeGreaterThan(0);expect(result.impacts.join()).toContain('not automatically');expect(employmentFieldLabel(field)).not.toContain('_');});
 it('no-op has no invented employment action',()=>expect(employmentChangeSummary({branch_id:1},{branch_id:1})).toEqual({fields:[],actions:[],impacts:[]}));
});
describe('recorded history evidence, never a schedule or reconstructed payroll source',()=>{
 const events=[{id:1,effective_date:'2025-01-01',new_values:{branch_id:1}},{id:2,effective_date:'2025-02-01',new_values:{branch_id:2}}];
 it('before recording is unknown',()=>expect(employmentSnapshotAt(events,'2024-12-31').status).toBe('unknown'));
 it.each([['2025-01-01',1],['2025-01-31',1],['2025-02-01',2],['2025-03-01',2]])('on/after boundary %s', (date,id)=>expect(employmentSnapshotAt(events,date)).toMatchObject({status:'recorded',eventId:id}));
 it('does not mutate journal inputs',()=>{const result=employmentSnapshotAt(events,'2025-03-01');if(result.status==='recorded')result.facts.branch_id=99;expect(events[1].new_values.branch_id).toBe(2);});
 it('same-day corrections require review',()=>expect(employmentSnapshotAt([...events,{id:3,effective_date:'2025-02-01',new_values:{branch_id:3}}],'2025-02-01').status).toBe('review-required'));
 it('backdated later recording is held instead of guessed',()=>expect(employmentSnapshotAt([...events,{id:3,effective_date:'2025-01-10',new_values:{branch_id:3}}],'2025-02-01').status).toBe('review-required'));
 it('order of input does not change evidence',()=>expect(employmentSnapshotAt([...events].reverse(),'2025-02-01')).toEqual(employmentSnapshotAt(events,'2025-02-01')));
 it.each(['2025-02-29','bad','2025-13-01'])('rejects invalid date %s',date=>expect(employmentSnapshotAt(events,date).status).toBe('review-required'));
 it('duplicate journal IDs are held',()=>expect(employmentSnapshotAt([events[0],events[0]],'2025-02-01').status).toBe('review-required'));
});
