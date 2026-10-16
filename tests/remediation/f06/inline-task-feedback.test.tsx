// @vitest-environment jsdom
import '../f05/setup';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {ValidatedTaskForm} from '@/components/workspace/validated-task-form';
import {reportWorkspaceFieldErrors} from '@/lib/workspace/field-errors';
afterEach(cleanup);
it('server field feedback targets the child, links to its control and focuses after pending clears',async()=>{
 render(<ValidatedTaskForm id="synthetic-child" onSubmit={async()=>{reportWorkspaceFieldErrors(document.getElementById('synthetic-child'),{shift_end_time:'Check the end time and overnight setting.'});}}>
  <label htmlFor="end">End time</label><input id="end" name="shift_end_time" defaultValue="06:00"/><button type="submit">Save shift</button>
 </ValidatedTaskForm>);
 await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Save shift'})));
 const control=screen.getByRole('textbox',{name:'End time'});
 expect(control.getAttribute('aria-invalid')).toBe('true');expect(document.activeElement).toBe(control);
 const link=screen.getByRole('button',{name:'End time: Check the end time and overnight setting.'});fireEvent.click(link);expect(document.activeElement).toBe(control);
 expect((control as HTMLInputElement).value).toBe('06:00');
});
it('feedback for an unrelated form does not contaminate a child form',async()=>{
 render(<><form id="unrelated"><input name="shift_end_time"/></form><ValidatedTaskForm id="synthetic-child" onSubmit={vi.fn()}><label htmlFor="end">End time</label><input id="end" name="shift_end_time"/></ValidatedTaskForm></>);
 await act(async()=>reportWorkspaceFieldErrors(document.getElementById('unrelated'),{shift_end_time:'Unrelated'}));
 expect(screen.queryByRole('alert')).toBeNull();expect(screen.getByRole('textbox',{name:'End time'}).hasAttribute('aria-invalid')).toBe(false);
});
