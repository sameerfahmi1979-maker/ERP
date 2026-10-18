// @vitest-environment jsdom
import './setup';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {EmailDeliveryReviewForm} from '@/features/notifications/admin/email-delivery-review-form';
const m=vi.hoisted(()=>({record:vi.fn()}));
vi.mock('@/server/actions/notifications/email-reviews',()=>({recordEmailDeliveryReview:m.record}));
beforeEach(()=>{vi.clearAllMocks();m.record.mockResolvedValue({success:true,data:{id:8}});});
afterEach(cleanup);
function mount(){const recorded=vi.fn(),close=vi.fn();const view=render(<EmailDeliveryReviewForm queueId={7} onClose={close} onRecorded={recorded}/>);return {...view,recorded,close};}
const fill=()=>fireEvent.change(screen.getByLabelText('Non-sensitive trace reference'),{target:{value:'F09 synthetic ticket 01'}});
it('operator review required fields use global field validation without persistence',()=>{
 mount();fireEvent.click(screen.getByRole('button',{name:'Save review'}));expect(m.record).not.toHaveBeenCalled();expect(screen.getByRole('alert').textContent).toContain('Non-sensitive trace reference');
});
it('an unknown save retries the original operation identity',async()=>{
 m.record.mockRejectedValueOnce(Error('PRIVATE'));const view=mount();fill();fireEvent.click(screen.getByRole('button',{name:'Save review'}));await screen.findByRole('alert');expect(view.close).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Save review'}));await waitFor(()=>expect(view.recorded).toHaveBeenCalledOnce());expect(m.record.mock.calls[0][0]).toEqual(m.record.mock.calls[1][0]);expect(screen.queryByText('PRIVATE')).toBeNull();
});
it('an unknown original cannot be replaced by different review text',async()=>{
 m.record.mockRejectedValueOnce(Error('PRIVATE'));mount();fill();fireEvent.click(screen.getByRole('button',{name:'Save review'}));await screen.findByRole('alert');fireEvent.change(screen.getByLabelText('Non-sensitive trace reference'),{target:{value:'Other reference'}});fireEvent.click(screen.getByRole('button',{name:'Save review'}));await waitFor(()=>expect(screen.getByRole('alert')).toBeTruthy());expect(m.record).toHaveBeenCalledOnce();
});
it('rapid duplicate review clicks make one request and cannot send mail',async()=>{
 let finish!:(v:unknown)=>void;m.record.mockReturnValue(new Promise(resolve=>{finish=resolve;}));const view=mount();fill();const button=screen.getByRole('button',{name:'Save review'});fireEvent.click(button);fireEvent.click(button);expect(m.record).toHaveBeenCalledOnce();
 await act(async()=>finish({success:true,data:{id:8}}));expect(view.recorded).toHaveBeenCalledOnce();expect(m.record.mock.calls[0][0]).toMatchObject({queueId:7,disposition:'investigating',traceReference:'F09 synthetic ticket 01'});
});
it('an unmounted identity cannot publish a late result into another account',async()=>{
 let finish!:(v:unknown)=>void;m.record.mockReturnValue(new Promise(resolve=>{finish=resolve;}));const view=mount();fill();fireEvent.click(screen.getByRole('button',{name:'Save review'}));view.unmount();await act(async()=>finish({success:true,data:{id:8}}));expect(view.recorded).not.toHaveBeenCalled();
});
