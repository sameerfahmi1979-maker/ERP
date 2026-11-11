// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({prepare:vi.fn(),live:true}));
vi.mock('@/server/actions/dms/intake-review',()=>({prepareExactIntakeReview:state.prepare}));
vi.mock('@/components/layout/read-cache-boundary',()=>({useReadCacheOwner:()=>({identity:'synthetic-owner',generation:1,isLive:()=>state.live})}));
import {DmsExactFileReview} from '@/features/dms/intake/dms-exact-file-review';
const plan={actorId:7,sessionId:9,typeId:11,expiryDate:null,fingerprint:'a'.repeat(64),requiresOverride:false,reason:null,canOverride:false};
beforeEach(()=>{vi.resetAllMocks();state.live=true;state.prepare.mockResolvedValue({success:true,data:plan});});
afterEach(cleanup);
function setup(){const change=vi.fn(),block=vi.fn();const props={sessionId:9,typeId:11,onChange:change,onBlockReason:block,reviewKey:'analysis-1'};return {...render(<DmsExactFileReview {...props}/>),change,block,props};}
async function verify(){fireEvent.click(screen.getByRole('button',{name:'Verify original for review'}));await screen.findByText('The original file’s format, size and fingerprint were verified.');}
it('reports missing proof even when human checkbox is checked, without manufacturing confirmation',async()=>{
 state.prepare.mockResolvedValue({success:true,data:{...plan,requiresOverride:true,canOverride:true,reason:'The AI result is missing or is not bound to these exact verified bytes.'}});
 const t=setup();await verify();fireEvent.click(screen.getByLabelText(/I checked the original/));
 await waitFor(()=>expect(t.block).toHaveBeenLastCalledWith(expect.stringContaining('not bound to these exact verified bytes')));
 expect(t.change).toHaveBeenLastCalledWith(null);
 expect(t.block.mock.lastCall?.[0]).toContain('do not upload again');
});
it('allows valid verified review only after explicit confirmation',async()=>{
 const t=setup();await verify();expect(t.change).toHaveBeenLastCalledWith(null);
 fireEvent.click(screen.getByLabelText(/I checked the original/));
 await waitFor(()=>expect(t.change).toHaveBeenLastCalledWith({...plan,confirmed:true,override:false,reasonText:null}));
 expect(t.block).toHaveBeenLastCalledWith(null);
});
it('keeps scoped manual override reason and authority requirements',async()=>{
 state.prepare.mockResolvedValue({success:true,data:{...plan,requiresOverride:true,canOverride:true,reason:'Selected type differs.'}});
 const t=setup();await verify();fireEvent.click(screen.getByLabelText(/I checked the original/));fireEvent.click(screen.getByLabelText(/Use my scoped DMS/));
 expect(t.change).toHaveBeenLastCalledWith(null);
 expect(t.block).toHaveBeenLastCalledWith(expect.stringContaining('20 characters'));
 fireEvent.change(screen.getByLabelText(/Reason for manual override/),{target:{value:'Original checked; selected type is correct.'}});
 await waitFor(()=>expect(t.change.mock.lastCall?.[0]).toMatchObject({confirmed:true,override:true}));
});
it('does not offer override to an ordinary reviewer',async()=>{
 state.prepare.mockResolvedValue({success:true,data:{...plan,requiresOverride:true,reason:'Proof unavailable.'}});
 const t=setup();await verify();fireEvent.click(screen.getByLabelText(/I checked the original/));
 expect(screen.queryByLabelText(/Use my scoped DMS/)).toBeNull();expect(t.change).toHaveBeenLastCalledWith(null);
 expect(t.block).toHaveBeenLastCalledWith(expect.stringContaining('Proof unavailable'));
});
it('invalidates old human confirmation when the analysis identity changes',async()=>{
 const t=setup();await verify();fireEvent.click(screen.getByLabelText(/I checked the original/));
 t.rerender(<DmsExactFileReview {...t.props} reviewKey="analysis-2"/>);
 await waitFor(()=>expect(t.change).toHaveBeenLastCalledWith(null));
 expect(screen.queryByLabelText(/I checked the original/)).toBeNull();
});
it('surfaces the actual verification failure and keeps approval blocked',async()=>{
 state.prepare.mockResolvedValue({success:false,error:'Original file changed. Retain this review.'});
 const t=setup();fireEvent.click(screen.getByRole('button',{name:'Verify original for review'}));
 await screen.findByText('Original file changed. Retain this review.');
 expect(t.block).toHaveBeenLastCalledWith('Original file changed. Retain this review.');expect(t.change).toHaveBeenLastCalledWith(null);
});
it('blocks approval while account identity is unavailable',()=>{
 state.live=false;const t=setup();expect(t.block).toHaveBeenLastCalledWith(expect.stringContaining('account or access is changing'));expect(t.change).toHaveBeenLastCalledWith(null);
});
