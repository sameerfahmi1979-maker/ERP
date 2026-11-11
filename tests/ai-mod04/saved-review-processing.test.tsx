// @vitest-environment jsdom
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {api,setup,view} from './saved-intake-harness';
import {preparationIsRunning,type PreparationProgress} from '@/lib/dms/preparation/progress';
const progress:PreparationProgress={stage:'analysing',admitted:true,workerHealthy:true,createdAt:'',startedAt:null,updatedAt:'',errorCode:null};
beforeEach(setup);afterEach(cleanup);
it('shows a rotating indicator beside actual running AI processing',async()=>{
 api.status.mockResolvedValue({success:true,data:{state:'running',sourceCurrent:true,candidate:null,progress}});
 render(view());await screen.findByText('Analysing the file and preparing suggestions…');
 const spinner=screen.getByTestId('saved-intake-processing-spinner');expect(spinner.classList.contains('animate-spin')).toBe(true);
 expect(spinner.closest('[role="status"]')?.getAttribute('aria-busy')).toBe('true');
});
it.each(['waiting','held','retry_wait','cancelled','ready','applied'] as const)('does not imply active AI execution for %s',stage=>{
 expect(preparationIsRunning({...progress,stage})).toBe(false);
});
it('stops the running indication for paused, offline or unadmitted work',()=>{
 expect(preparationIsRunning(null)).toBe(false);
 expect(preparationIsRunning({...progress,holdReason:'paused'})).toBe(false);
 expect(preparationIsRunning({...progress,workerHealthy:false})).toBe(false);
 expect(preparationIsRunning({...progress,admitted:false})).toBe(false);
 expect(preparationIsRunning({...progress,stage:'reading'})).toBe(true);
});
