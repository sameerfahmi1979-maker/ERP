'use client';
import{Button}from'@/components/ui/button';
import type{useRecruitmentLifecycle}from'./use-recruitment-lifecycle';
export function RecruitmentRecovery({session,onSaved,onRetire}:{session:ReturnType<typeof useRecruitmentLifecycle>;onSaved:()=>void;onRetire?:()=>void}){
 return <div>{session.error&&<p role="alert">{session.error}</p>}{session.pending&&<div role="status">An original decision is awaiting confirmation. Changed values cannot be retried.<Button disabled={session.busy||session.blocked}onClick={async()=>{const r=await session.submit(session.pending!.request);if(r.success&&session.isCurrent())onSaved();}}>Retry original decision</Button><Button disabled={session.busy}onClick={()=>{if(session.retire())onRetire?.();}}>Remove private retry fields; check receipt only</Button></div>}{session.retired&&<Button disabled={session.busy}onClick={()=>void session.reconcile()}>Check original receipt</Button>}</div>;
}
