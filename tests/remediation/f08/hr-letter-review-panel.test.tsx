// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor}from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi}from 'vitest';
const m=vi.hoisted(()=>({action:vi.fn(),live:true,owner:{identity:{authUserId:'synthetic-a',scopeVersion:'1'},generation:0,isLive:()=>m.live}}));
vi.mock('@/server/actions/output/hr-letter-reviews',()=>({hrLetterReview:m.action}));
vi.mock('@/components/layout/read-cache-boundary',()=>({useReadCacheOwner:()=>m.owner}));
vi.mock('@/features/report-center/hr-letter-source-selector',()=>({HrLetterSourceSelector:({onChange}:{onChange:(s:string)=>void})=><button type="button" onClick={()=>onChange('11')}>Choose synthetic original</button>}));
import {HrLetterReviewPanel}from '@/features/report-center/hr-letter-review-panel';
const review={id:12,employee_id:7,code:'HR_PPE_ISSUE_FORM',source_id:11,receiver_id:null,document_id:22,version_id:3,fingerprint:'b'.repeat(64),facts:{condition:'Good',condition_ar:'جيد',ppe_item_ar:'خوذة'},status:'approved',created_by:1,reviewed_by:2,created_at:'2026-10-31T00:00:00Z',reviewed_at:'2026-10-31T01:00:00Z'};
const changed=vi.fn(),pending=vi.fn(),dirty=vi.fn();
const page=()=>render(<HrLetterReviewPanel employeeId={7} code="HR_PPE_ISSUE_FORM" value="" disabled={false} onChange={changed} onPending={pending} onDirty={dirty}/>);
beforeEach(()=>{vi.clearAllMocks();m.live=true;m.action.mockImplementation(async(p:{action:string})=>p.action==='options'?{success:true,options:[{id:22,version:3,label:'QA-DMS-1 · Synthetic evidence'}]}:{success:true,rows:[review]});});
afterEach(cleanup);
async function prepare(){page();await screen.findByText(/Review 12/);fireEvent.click(screen.getByText('Prepare a source review'));fireEvent.click(screen.getByText('Choose synthetic original'));await waitFor(()=>expect(screen.getByRole('option',{name:'QA-DMS-1 · Synthetic evidence'})).toBeTruthy());fireEvent.change(screen.getByLabelText('Linked evidence'),{target:{value:'22'}});fireEvent.change(screen.getByLabelText('Actual condition at issue — English'),{target:{value:'Good'}});fireEvent.change(screen.getByLabelText('Actual condition at issue — Arabic'),{target:{value:'جيد'}});fireEvent.change(screen.getByLabelText('PPE item — Arabic'),{target:{value:'خوذة'}});fireEvent.click(screen.getByRole('checkbox'));}
it('never auto-selects an approval or issues while reading reviews',async()=>{page();await screen.findByText(/Review 12/);expect(changed).not.toHaveBeenCalled();expect(m.action.mock.calls.every(([p])=>['list','options'].includes(p.action))).toBe(true);fireEvent.click(screen.getByText(/Review 12/));fireEvent.click(screen.getByText('Use reviewed particulars'));expect(changed).toHaveBeenCalledWith('12');});
it('locks an uncertain submission and retries exactly the retained operation and payload',async()=>{
 await prepare();m.action.mockImplementation(async(p:{action:string})=>p.action==='submit'?{success:false,uncertain:true,error:'Unconfirmed'}:{success:true,rows:[review]});
 fireEvent.click(screen.getByText('Submit for independent source review'));await screen.findByText('Retry original review request');
 const first=m.action.mock.calls.find(([p])=>p.action==='submit')![0];expect(first.submission).toMatchObject({sourceId:11,documentId:22,versionId:3,facts:{condition:'Good'}});expect(pending).toHaveBeenCalledWith(true);
 expect((screen.getByLabelText('Actual condition at issue — English')as HTMLInputElement).closest('fieldset')?.disabled).toBe(true);
 fireEvent.click(screen.getByText('Retry original review request'));await waitFor(()=>expect(m.action.mock.calls.filter(([p])=>p.action==='submit')).toHaveLength(2));expect(m.action.mock.calls.filter(([p])=>p.action==='submit')[1][0]).toEqual(first);
});
it('prevents duplicate clicks while an acknowledgement is outstanding',async()=>{await prepare();let resolve!:(r:unknown)=>void;m.action.mockImplementation(()=>new Promise(r=>{resolve=r;}));const button=screen.getByText('Submit for independent source review');fireEvent.click(button);fireEvent.click(button);expect(m.action.mock.calls.filter(([p])=>p.action==='submit')).toHaveLength(1);await act(async()=>resolve({success:true,rows:[review]}));});
it('ignores late source responses after the account lifetime retires',async()=>{let resolve!:(r:unknown)=>void;m.action.mockImplementation(()=>new Promise(r=>{resolve=r;}));page();m.live=false;await act(async()=>resolve({success:true,rows:[review]}));expect(changed).not.toHaveBeenCalled();expect(screen.queryByText(/Review 12/)).toBeNull();});
it('requires an original, evidence and attestation before submitting',async()=>{page();await screen.findByText(/Review 12/);fireEvent.click(screen.getByText('Prepare a source review'));fireEvent.click(screen.getByText('Submit for independent source review'));expect(m.action.mock.calls.some(([p])=>p.action==='submit')).toBe(false);expect(screen.getByRole('status').textContent).toContain('Select the original');});
