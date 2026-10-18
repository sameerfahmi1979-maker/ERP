// @vitest-environment jsdom
import React from 'react';import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
const s=vi.hoisted(()=>({inspect:vi.fn(),retry:vi.fn(),complete:vi.fn(),invalidate:vi.fn()}));
vi.mock('@/server/actions/notifications/recovery',()=>({inspectNotificationRecovery:s.inspect,retryHeldNotificationEvent:s.retry}));
vi.mock('@/features/notifications/notification-open',()=>({NotificationArrival:({path}:{path:string})=><span data-testid="arrival">{path}</span>}));
import {NotificationRecoveryPanel} from '@/features/notifications/admin/notification-recovery-panel';
import {NotificationTaskContextCard} from '@/features/notifications/notification-task-context';
const row={id:1,state:'held',event_type:'approval_rejected',last_outcome:'held',recovery_revision:0,pending_recipients:1,held_recipients:1,omitted_decisions:1};
beforeEach(()=>{vi.clearAllMocks();s.inspect.mockResolvedValue({success:true,data:[row]});s.retry.mockResolvedValue({success:true});});afterEach(cleanup);
async function load(){render(<NotificationRecoveryPanel identity="owner-one"/>);fireEvent.click(screen.getByRole('button',{name:'Load or refresh recovery'}));await screen.findByRole('button',{name:'Recheck event 1'});}
it('does not query or make changes merely by mounting the administration page',()=>{render(<NotificationRecoveryPanel identity="owner-one"/>);expect(s.inspect).not.toHaveBeenCalled();expect(s.retry).not.toHaveBeenCalled();});
it('failed inspection has explicit feedback, not an empty successful table',async()=>{s.inspect.mockResolvedValue({success:false});render(<NotificationRecoveryPanel identity="owner-one"/>);fireEvent.click(screen.getByRole('button'));await screen.findByRole('alert');expect(screen.queryByRole('table')).toBe(null);});
it('lost response can reconcile the same operation after a refresh changes the visible state',async()=>{
 s.retry.mockResolvedValueOnce({success:false});await load();fireEvent.click(screen.getByRole('button',{name:'Recheck event 1'}));
 await screen.findByRole('button',{name:'Reconcile last recovery request'});const first=s.retry.mock.calls[0];
 s.inspect.mockResolvedValue({success:true,data:[{...row,state:'pending',recovery_revision:1}]});fireEvent.click(screen.getByRole('button',{name:'Load or refresh recovery'}));
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Recheck event 1'})).toBe(null));
 fireEvent.click(screen.getByRole('button',{name:'Reconcile last recovery request'}));await waitFor(()=>expect(s.retry).toHaveBeenCalledTimes(2));expect(s.retry.mock.calls[1]).toEqual(first);
});
it('double click cannot start two recovery operations',async()=>{
 let done!:(r:unknown)=>void;s.retry.mockImplementation(()=>new Promise(resolve=>{done=resolve;}));await load();const button=screen.getByRole('button',{name:'Recheck event 1'});fireEvent.click(button);fireEvent.click(button);expect(s.retry).toHaveBeenCalledTimes(1);await act(async()=>done({success:true}));
});
it('task context identifies the exact current leaf without selecting another section or discarding a draft',()=>{
 const select=vi.fn();const task={id:12,label:'Leave request',status:'approved',section:'time',path:'/admin/hr/employees/record/7?task=leave&task_id=12'};
 const view=render(<NotificationTaskContextCard task={task} onSection={select} blocked/>);expect(screen.getByText('Leave request #12')).toBeTruthy();expect(select).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Show related section'}));expect(select).not.toHaveBeenCalled();expect(screen.getByRole('status').textContent).toContain('unsaved entries are unchanged');
 view.rerender(<NotificationTaskContextCard task={task} onSection={select}/>);fireEvent.click(screen.getByRole('button',{name:'Show related section'}));expect(select).toHaveBeenCalledWith('time');
});
