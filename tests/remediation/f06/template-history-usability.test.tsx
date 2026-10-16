// @vitest-environment jsdom
// Mounted history + real child-dialog shell; query transport and UI primitives doubled.
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ReactNode} from 'react';
import type {ReportTemplate,ReportTemplateEvent} from '@/lib/report-center/types';
const m=vi.hoisted(()=>({query:{data:[] as ReportTemplateEvent[],isLoading:false,isError:false,refetch:vi.fn()},options:null as null|{queryFn:()=>Promise<unknown>},history:vi.fn(),close:vi.fn()}));
vi.mock('@tanstack/react-query',()=>({useQuery:(options:{queryFn:()=>Promise<unknown>})=>{m.options=options;return m.query;}}));
vi.mock('@/server/actions/reports/template-governance',()=>({getTemplateGovernanceHistory:m.history}));
vi.mock('@/lib/report-center/template-governance-attempt',()=>({createTemplateGovernanceAttempt:vi.fn()}));
vi.mock('@/hooks/use-workspace-navigation-lock',()=>({useWorkspaceNavigationLock:vi.fn()}));
vi.mock('@/components/ui/dialog',()=>({Dialog:({children}:{children:ReactNode})=><div>{children}</div>,DialogContent:({children}:{children:ReactNode})=><section role="dialog">{children}</section>,DialogTitle:({children}:{children:ReactNode})=><h2>{children}</h2>}));
vi.mock('@/components/ui/button',()=>({Button:({children,variant,size,...props}:{children:ReactNode;variant?:string;size?:string})=>{void variant;void size;return <button {...props}>{children}</button>;}}));
vi.mock('sonner',()=>({toast:{error:vi.fn()}}));
import {TemplateGovernanceHistoryDialog} from '@/features/report-center/template-governance-actions';
const template={id:9,template_name:'Synthetic letter'} as ReportTemplate;
const event=(overrides:Partial<ReportTemplateEvent>={}):ReportTemplateEvent=>({id:10,template_id:9,event_type:'template_new_version_created',actor_user_profile_id:7,occurred_at:'2026-10-04T09:00:00Z',payload_json:{version_no:3,revision:2,parent_template_id:8},notes:null,...overrides});
const mount=()=>render(<TemplateGovernanceHistoryDialog template={template} open onOpenChange={m.close}/>);
beforeEach(()=>{vi.clearAllMocks();m.query={data:[],isLoading:false,isError:false,refetch:vi.fn()};m.options=null;m.history.mockResolvedValue({success:true,data:[]});});
afterEach(cleanup);
it('presents version and revision as human-readable history without raw request metadata',()=>{m.query.data=[event({payload_json:{version_no:3,revision:2,parent_template_id:8,operation_id:'PRIVATE-OPERATION',unexpected:'PRIVATE-METADATA'}})];mount();expect(screen.getByText('Template version 3')).toBeTruthy();expect(screen.getByText('Record revision 2')).toBeTruthy();expect(screen.getByText('Created from an earlier template version.')).toBeTruthy();expect(document.body.textContent).not.toMatch(/PRIVATE-|parent_template_id|operation_id|\{"/);});
it('every dialog button has a usable name and cancel closes history',()=>{mount();for(const button of screen.getAllByRole('button'))expect((button.getAttribute('aria-label')??button.textContent??'').trim()).not.toBe('');fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}));expect(m.close).toHaveBeenCalledWith(false);});
it('renders a successful empty history honestly',()=>{mount();expect(screen.getByText('No governance events recorded yet.')).toBeTruthy();});
it('announces loading without a false empty result',()=>{m.query.isLoading=true;mount();expect(screen.getByRole('status').textContent).toContain('Loading governance history');expect(screen.queryByText('No governance events recorded yet.')).toBeNull();});
it('provides a named retry for failed reads',()=>{m.query.isError=true;mount();fireEvent.click(screen.getByRole('button',{name:'Retry governance history'}));expect(m.query.refetch).toHaveBeenCalledTimes(1);expect(screen.queryByText('No governance events recorded yet.')).toBeNull();});
it('rejects a malformed successful transport result rather than returning empty history',async()=>{mount();m.history.mockResolvedValue({success:true});await expect(m.options!.queryFn()).rejects.toThrow('History unavailable');});
it('does not expose unknown event codes or malformed metadata',()=>{m.query.data=[event({event_type:'private_internal_code' as ReportTemplateEvent['event_type'],occurred_at:'bad date',payload_json:{version_no:{token:'PRIVATE'},revision:[],superseded_by_template_id:0}})];mount();expect(screen.getByText('Template event')).toBeTruthy();expect(screen.getByText('Date unavailable')).toBeTruthy();expect(document.body.textContent).not.toMatch(/private_internal_code|PRIVATE|Invalid Date/);});
it('retains reason text as escaped text and summarizes supersession without internal IDs',()=>{m.query.data=[event({notes:'Review <b>carefully</b>',payload_json:{superseded_by_template_id:12}})];mount();expect(screen.getByText('Review <b>carefully</b>')).toBeTruthy();expect(document.querySelector('b')).toBeNull();expect(screen.getByText('Superseded by a newer template version.')).toBeTruthy();expect(document.body.textContent).not.toContain('superseded_by_template_id');});
