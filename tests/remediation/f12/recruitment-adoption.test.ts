import fs from 'node:fs';
import {it,expect} from 'vitest';
import {candidateProgressStates,candidateProgressStages,recruitmentLifecycleRequest} from '@/lib/hr/recruitment-lifecycle-contract';
const read=(file:string)=>fs.readFileSync(file,'utf8');
const sql=read('supabase/migrations/20261021164610_f12_recruitment_lifecycle.sql');
it('ordinary progress cannot manufacture a hire or use invented source states',()=>{
 expect(candidateProgressStates).toEqual(['new','screening','shortlisted','interview','selected','offered','accepted','rejected','withdrawn','blacklisted']);
 expect(candidateProgressStages).toEqual(['new','screening','shortlisted','interview','offer','onboarding','closed']);
 expect(recruitmentLifecycleRequest.safeParse({kind:'pipeline',candidateId:1,id:1,revision:'1',action:'update',values:{candidate_status:'hired',pipeline_stage:'hired'},reason:'Cannot manufacture conversion'}).success).toBe(false);
});
it('versioned requisition edits preserve explicit zero rejection and original opening',()=>{
 const r={kind:'requisition',candidateId:null,id:1,revision:'3',action:'update',values:{vacancies_count:0},reason:'Actual vacancy review'};
 expect(recruitmentLifecycleRequest.safeParse(r).success).toBe(false);
 expect(recruitmentLifecycleRequest.safeParse({...r,values:{vacancies_count:2}}).success).toBe(true);
 expect(recruitmentLifecycleRequest.safeParse({...r,revision:null,values:{vacancies_count:2}}).success).toBe(false);
});
it('stale business openings use explicit conflict rather than retryable engine serialization',()=>{
 expect(sql).toContain("Recruitment changed since opening' USING ERRCODE='PT409'");
 expect(sql).not.toMatch(/USING ERRCODE='40001'/);
});
it('both conversion entry and authoritative insert proof retain the exact accepted-offer gate',()=>{
 expect(sql).toContain('f12_require_accepted_offer(p_candidate,p_data)');
 expect(sql).toContain('f12_require_accepted_offer(v_candidate.id,v_data)');
 expect(sql).toContain("Accepted-offer insert proof gate missing");
 expect(sql).toContain('erp_private.onboarding_permission(p_candidate,p_employee,p_code)');
});
it('child collections retain compact presentation and actual forms use versioned commands',()=>{
 for(const kind of ['interviews','offers','onboarding']){
  const source=read(`src/features/hr/recruitment/tabs/candidate-${kind}-tab.tsx`);
  expect(source).toMatch(/presentation="embedded"/);
  expect(source).toContain('useRecruitmentLifecycle');
 }
});
it('ordinary profile saves cannot overwrite governed progress through stale drafts',()=>{
 const source=read('src/features/hr/recruitment/candidate-workspace-form.tsx');
 expect(source).toContain('const{candidate_status,pipeline_stage,...profilePayload}=payload');
 expect(source).toContain('updateCandidate(originalId, profilePayload');
});
