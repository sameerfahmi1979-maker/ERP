'use client';
import{useState}from'react';
import{useQueryClient}from'@tanstack/react-query';
import type{AuthContext}from'@/lib/rbac/check';
import type{CandidateRow}from'@/server/actions/hr/recruitment';
import type{RecruitmentLifecycleRequest}from'@/lib/hr/recruitment-lifecycle-contract';
import{Button}from'@/components/ui/button';
import{useRecruitmentLifecycle}from'./use-recruitment-lifecycle';
import{RecruitmentDecisionDialog}from'./recruitment-decision-dialog';
import{RecruitmentRecovery}from'./recruitment-recovery';
import{invalidateRecruitmentCandidateReadModels}from'@/lib/query/invalidation';
import{candidateRecordKey}from'@/hooks/use-hr-candidate-record';import{candidateRecordIdentity}from'@/lib/reads/hr-candidate-record-schema';
export function CandidateJoiningControls({candidate,authContext,admitted}:{candidate:CandidateRow;authContext:AuthContext;admitted:boolean}){
 const session=useRecruitmentLifecycle(authContext,candidate.id,null,'joining'),[request,setRequest]=useState<RecruitmentLifecycleRequest|null>(null),qc=useQueryClient();
 const actions:RecruitmentLifecycleRequest['action'][]=candidate.joining_status==='not_started'?['start','cancel','no-show']:candidate.joining_status==='in_progress'?['finish','cancel','no-show']:['reopen'];
 const saved=()=>{setRequest(null);invalidateRecruitmentCandidateReadModels(qc,candidate.id,'onboarding');void qc.invalidateQueries({queryKey:candidateRecordKey(candidate.id,candidateRecordIdentity(authContext))});void qc.invalidateQueries({queryKey:['recruitment','conversion-prep',candidate.id]});};
 const recovery=<RecruitmentRecovery session={session}onSaved={saved}/>;
 return <section className="space-y-2"aria-label="Joining progress"><h3 className="text-sm font-semibold">Joining — {candidate.joining_status.replaceAll('_',' ')}</h3><p className="text-sm text-muted-foreground">Joining completion requires an actual employee conversion and resolved mandatory tasks with verified assignments and evidence. No company checklist is assumed.</p>{!request&&recovery}<div className="flex flex-wrap gap-2">{actions.map(action=><Button key={action}size="sm"variant="outline"disabled={!admitted||session.busy||session.blocked||!!session.pending}onClick={()=>{if(session.startNew())setRequest({kind:'joining',candidateId:candidate.id,id:candidate.id,revision:String(candidate.workspace_revision),action,values:{},reason:''});}}>{action==='finish'?'Complete joining':action.replaceAll('-',' ')}</Button>)}</div><RecruitmentDecisionDialog request={request}busy={session.busy}locked={!!session.pending}recovery={recovery}onClose={()=>setRequest(null)}onConfirm={async reason=>{if(!request||!admitted)return;const r=await session.submit({...request,reason});if(r.success&&session.isCurrent())saved();}}/></section>;
}
