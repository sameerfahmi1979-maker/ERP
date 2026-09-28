// @vitest-environment jsdom
import { act,cleanup,render,waitFor } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { afterEach,expect,it,vi } from 'vitest';
import { DmsOrchestrationProgressCard } from '@/features/dms/orchestration/dms-orchestration-progress-card';
const actions=vi.hoisted(()=>({run:vi.fn(),retry:vi.fn()}));
vi.mock('@/server/actions/dms/orchestration',()=>({runDmsAiOrchestrationPostDraft:actions.run,retryDmsOrchestrationStep:actions.retry}));
vi.mock('@/lib/query/invalidation',()=>({invalidateDmsOrchestrationStatus:vi.fn()}));
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.resetAllMocks();});
function view(){const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});return {client,ui:render(<StrictMode><QueryClientProvider client={client}><DmsOrchestrationProgressCard sessionCode="F02-SYNTHETIC" documentId={90001} autoTrigger/></QueryClientProvider></StrictMode>)};}
it('waits for status and auto-starts only once under StrictMode',async()=>{
 let resolve!:(r:Response)=>void;
 vi.stubGlobal('fetch',vi.fn(()=>new Promise(r=>{resolve=r;})));
 actions.run.mockResolvedValue({success:true,data:{completedStepCount:1,failedStepCount:0}});
 const {client}=view(); expect(actions.run).not.toHaveBeenCalled();
 await act(async()=>resolve(new Response(JSON.stringify({data:{orchestrationStatus:'pending',steps:[]}}))));
 await waitFor(()=>expect(actions.run).toHaveBeenCalledTimes(1)); client.clear();
});
it.each(['complete','complete_with_warnings','running','queued'])('does not restart %s work',async status=>{
 const fetch=vi.fn(async()=>new Response(JSON.stringify({data:{orchestrationStatus:status,steps:[]}})));
 vi.stubGlobal('fetch',fetch); const {client}=view();
 await waitFor(()=>expect(client.isFetching()).toBe(0)); expect(fetch).toHaveBeenCalled();expect(actions.run).not.toHaveBeenCalled();client.clear();
});
it('does not interpret a failed status request as permission to start work',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:403})));
 const {client}=view();await waitFor(()=>expect(client.getQueryCache().getAll()[0]?.state.status).toBe('error'));
 expect(actions.run).not.toHaveBeenCalled();client.clear();
});
