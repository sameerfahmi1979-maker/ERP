import {expect,it} from 'vitest';
import {preparationProgressMessage,type PreparationProgress} from '@/lib/dms/preparation/progress';
const base:PreparationProgress={stage:'waiting',admitted:true,workerHealthy:true,createdAt:'2026-11-03T00:00:00Z',startedAt:null,updatedAt:'2026-11-03T00:00:00Z',errorCode:null};
it('distinguishes unscheduled historical requests, offline service and available-slot waiting',()=>{
 expect(preparationProgressMessage({...base,admitted:false})).toContain('Resume');
 expect(preparationProgressMessage({...base,workerHealthy:false})).toContain('not responding');
 expect(preparationProgressMessage(base)).toContain('slot');
});
it('never labels running, ready or failed work as queued',()=>{
 for(const stage of ['reading','analysing','ready','held','retry_wait'] as const)expect(preparationProgressMessage({...base,stage})).not.toContain('slot');
 expect(preparationProgressMessage({...base,stage:'held'})).toContain('retained');
 expect(preparationProgressMessage({...base,stage:'ready',workerHealthy:false})).toContain('Ready for review');
});
