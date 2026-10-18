// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const s=vi.hoisted(()=>({prepare:vi.fn(),complete:vi.fn(),push:vi.fn(),invalidate:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:s.push})}));
vi.mock('@/server/actions/notifications/open',()=>({prepareNotificationOpen:s.prepare,completeNotificationOpen:s.complete}));
vi.mock('@/lib/query/invalidation',()=>({invalidateMyNotifications:s.invalidate}));
import {NotificationOpenButton,NotificationArrival} from '@/features/notifications/notification-open';
const token='b23ec154-aa22-44cc-8fee-2b954e9bf007',path='/dms/documents/record/7';
const clients:QueryClient[]=[];
function arrival(props:{token?:string;path:string}){const qc=new QueryClient();clients.push(qc);return render(<QueryClientProvider client={qc}><NotificationArrival {...props}/></QueryClientProvider>);}
beforeEach(()=>{window.history.replaceState({},'',path+'?f10_open='+token);s.prepare.mockResolvedValue({success:true,data:{id:7,token,path}});s.complete.mockResolvedValue({success:true});});
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());vi.clearAllMocks();});
it('clicking Open prepares navigation but never calls the read completion',async()=>{
 render(<NotificationOpenButton id={7}/>);fireEvent.click(screen.getByRole('button',{name:'Open record'}));
 await waitFor(()=>expect(s.push).toHaveBeenCalledWith(path+'?f10_open='+token));expect(s.complete).not.toHaveBeenCalled();
});
it('denied preparation leaves the alert unread with actionable feedback',async()=>{
 s.prepare.mockResolvedValue({success:false,error:'Destination denied; alert remains unread.'});render(<NotificationOpenButton id={7}/>);fireEvent.click(screen.getByRole('button'));
 await screen.findByRole('alert');expect(s.push).not.toHaveBeenCalled();expect(s.complete).not.toHaveBeenCalled();
});
it('query-bearing canonical target retains its identifier when adding the ticket',async()=>{
 s.prepare.mockResolvedValue({success:true,data:{id:7,token,path:'/admin/reports/templates/governance?template_id=2'}});render(<NotificationOpenButton id={7}/>);fireEvent.click(screen.getByRole('button'));
 await waitFor(()=>expect(s.push).toHaveBeenCalledWith('/admin/reports/templates/governance?template_id=2&f10_open='+token));
});
it('double click while preparation is pending makes one operation only',async()=>{
 let finish!:(r:unknown)=>void;s.prepare.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));render(<NotificationOpenButton id={7}/>);const button=screen.getByRole('button');fireEvent.click(button);fireEvent.click(button);
 expect(s.prepare).toHaveBeenCalledTimes(1);await act(async()=>finish({success:false,error:'Retry'}));
});
it('unmounted preparation cannot navigate a replacement owner',async()=>{
 let finish!:(r:unknown)=>void;s.prepare.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const view=render(<NotificationOpenButton id={7}/>);fireEvent.click(screen.getByRole('button'));view.unmount();
 await act(async()=>finish({success:true,data:{id:7,token,path}}));expect(s.push).not.toHaveBeenCalled();
});
it('ordinary record opening without a notification ticket marks nothing read',()=>{arrival({path});expect(s.complete).not.toHaveBeenCalled();expect(s.invalidate).not.toHaveBeenCalled();});
it('authorized mounted target acknowledgement refreshes counts and strips its transient ticket',async()=>{
 arrival({path,token});await waitFor(()=>expect(s.invalidate).toHaveBeenCalledTimes(1));expect(s.complete).toHaveBeenCalledWith(token,path);expect(window.location.search).toBe('');
});
it('completion failure is not hidden; retry reconciles the same ticket',async()=>{
 s.complete.mockResolvedValueOnce({success:false});arrival({path,token});await screen.findByRole('status');expect(s.invalidate).not.toHaveBeenCalled();expect(window.location.search).toContain(token);
 fireEvent.click(screen.getByRole('button',{name:'Retry read confirmation'}));await waitFor(()=>expect(s.invalidate).toHaveBeenCalledTimes(1));expect(s.complete.mock.calls).toEqual([[token,path],[token,path]]);
});
it('late arrival acknowledgement cannot refresh or change a replacement screen',async()=>{
 let finish!:(r:unknown)=>void;s.complete.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const view=arrival({path,token});view.unmount();
 await act(async()=>finish({success:true}));expect(s.invalidate).not.toHaveBeenCalled();expect(window.location.search).toContain(token);
});
