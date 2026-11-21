'use client';
import{useState}from'react';
import{useQueryClient}from'@tanstack/react-query';
import type{AuthContext}from'@/lib/rbac/check';
import type{CandidateRow}from'@/server/actions/hr/recruitment';
import type{RecruitmentLifecycleRequest}from'@/lib/hr/recruitment-lifecycle-contract';
import{Button}from'@/components/ui/button';
import{Input}from'@/components/ui/input';
import{Label}from'@/components/ui/label';
import{employeeDate}from'@/lib/hr/employee-contract';
import{useRecruitmentLifecycle}from'./use-recruitment-lifecycle';
import{RecruitmentDecisionDialog}from'./recruitment-decision-dialog';
import{RecruitmentRecovery}from'./recruitment-recovery';
import{invalidateRecruitmentCandidateReadModels}from'@/lib/query/invalidation';
import{candidateRecordKey}from'@/hooks/use-hr-candidate-record';import{candidateRecordIdentity}from'@/lib/reads/hr-candidate-record-schema';
export function CandidateJoiningControls({candidate,authContext,admitted}:{candidate:CandidateRow;authContext:AuthContext;admitted:boolean}){
 const session=useRecruitmentLifecycle(authContext,candidate.id,null,'joining'),[request,setRequest]=useState<RecruitmentLifecycleRequest|null>(null),qc=useQueryClient();
 const [actualJoiningDate,setActualJoiningDate]=useState('');
 const canFinish=authContext.permissionCodes.includes('hr.employment.lifecycle.manage')&&employeeDate.safeParse(actualJoiningDate).success;
 const actions:RecruitmentLifecycleRequest['action'][]=candidate.joining_status==='not_started'?['start','cancel','no-show']:candidate.joining_status==='in_progress'?['finish','cancel','no-show']:['reopen'];
 const saved=()=>{setRequest(null);invalidateRecruitmentCandidateReadModels(qc,candidate.id,'onboarding');void qc.invalidateQueries({queryKey:candidateRecordKey(candidate.id,candidateRecordIdentity(authContext))});void qc.invalidateQueries({queryKey:['recruitment','conversion-prep',candidate.id]});};
 const recovery=<RecruitmentRecovery session={session}onSaved={saved}/>;
 return <section className="space-y-2" aria-label="Joining progress">
  <h3 className="text-sm font-semibold">Joining — {candidate.joining_status.replaceAll('_',' ')}</h3>
  <p className="text-sm text-muted-foreground">To activate the employee record, complete the mandatory tasks and verify the actual joining date.</p>
  {!request&&recovery}
  {actions.includes('finish')&&<div className="max-w-xs space-y-1">
   <Label htmlFor={`actual-joining-${candidate.id}`}>Actual joining date</Label>
   <Input id={`actual-joining-${candidate.id}`} type="date" value={actualJoiningDate} onChange={event=>setActualJoiningDate(event.target.value)} disabled={!!request||!!session.pending||session.busy}/>
  </div>}
  <div className="flex flex-wrap gap-2">{actions.map(action=><Button key={action} size="sm" variant="outline"
   disabled={!admitted||session.busy||session.blocked||!!session.pending||(action==='finish'&&!canFinish)}
   onClick={()=>{if(session.startNew())setRequest({kind:'joining',candidateId:candidate.id,id:candidate.id,
    revision:String(candidate.workspace_revision),action,values:action==='finish'?{actual_joining_date:actualJoiningDate}:{},reason:''});}}>
   {action==='finish'?'Complete joining':action.replaceAll('-',' ')}</Button>)}</div>
  <RecruitmentDecisionDialog request={request} busy={session.busy} locked={!!session.pending} recovery={recovery} onClose={()=>setRequest(null)}
   onConfirm={async reason=>{if(!request||!admitted)return;const r=await session.submit({...request,reason});if(r.success&&session.isCurrent())saved();}}/>
 </section>;
}
