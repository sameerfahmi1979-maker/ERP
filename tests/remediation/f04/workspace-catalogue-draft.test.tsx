// @vitest-environment jsdom
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { FluentProvider,webLightTheme } from '@fluentui/react-components';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import type { AuthContext } from '@/lib/rbac/check';
import type { ApprovalRoleRow } from '@/server/actions/common-master-data/approval-roles';
import type { DesignationRow } from '@/server/actions/common-master-data/designations';
import type { DmsRequiredDocumentRuleRow } from '@/server/actions/common-master-data/dms-required-document-rules';
import { WorkspaceProvider,useWorkspaceContext } from '@/components/workspace/workspace-provider';
import { WorkspaceDraftProvider,useWorkspaceDraftStoreContext } from '@/components/workspace/workspace-draft-provider';
import { useWorkspaceControlledDraft,type WorkspaceDraftCodec } from '@/hooks/use-workspace-controlled-draft';
import { ApprovalRoleWorkspaceForm } from '@/features/common-master-data/approval-roles/approval-role-workspace-form';
import { DesignationWorkspaceForm } from '@/features/common-master-data/designations/designation-workspace-form';
import { DmsRequiredDocumentRuleForm } from '@/features/common-master-data/dms-required-document-rules/dms-required-document-rule-form';

const rolePath='/admin/common-master-data/approval-roles/record/81';
const port=vi.hoisted(()=>({path:'',push:vi.fn(),replace:vi.fn(),refresh:vi.fn(),rpc:vi.fn(),revalidate:vi.fn(),read:vi.fn(),ctx:{} as AuthContext}));
vi.mock('next/navigation',()=>({usePathname:()=>port.path,useSearchParams:()=>new URLSearchParams('mode=edit'),useRouter:()=>port}));
vi.mock('next/cache',()=>({revalidatePath:port.revalidate}));
vi.mock('@/lib/rbac/check',async()=>({...await import('@/lib/rbac/scope'),getAuthContext:async()=>port.ctx}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:port.rpc,from:port.read})}));
const codes=['common_md.manage','common_md.view','common_md.approval_roles.manage'];
const role={id:81,role_code:'L1',role_name:'Saved Synthetic Role',level_number:1,scope:'company',description:null,owner_company_id:7,is_active:true,
    can_approve:true,can_reject:true,can_delegate:false,workspace_revision:8,currency_code:'AED'} as ApprovalRoleRow;
let client:QueryClient;
let store:NonNullable<ReturnType<typeof useWorkspaceDraftStoreContext>>;
let owner:NonNullable<ReturnType<typeof useWorkspaceContext>>;
function Observe(){store=useWorkspaceDraftStoreContext()!;owner=useWorkspaceContext()!;return null;}
const allow=()=>true;
function tree(child:React.ReactNode){
 return <FluentProvider theme={webLightTheme}><QueryClientProvider client={client}><WorkspaceDraftProvider>
 <WorkspaceProvider principalId="draft-audit" canRestoreRoute={allow}><Observe/>{child}</WorkspaceProvider>
 </WorkspaceDraftProvider></QueryClientProvider></FluentProvider>;
}
const field=(name:string)=>document.querySelector('[name="'+name+'"]') as HTMLInputElement|HTMLSelectElement;
const roleApp=()=>tree(<ApprovalRoleWorkspaceForm role={role} mode="edit" authContext={port.ctx} companies={[{id:7,company_code:'SEVEN',legal_name_en:'Seven'}]}/>);
const submitted=()=>port.rpc.mock.calls[0]?.[1];
const synth = 'Typed but not saved ZQ44';
beforeEach(()=>{
 localStorage.clear();sessionStorage.clear();vi.clearAllMocks();
 port.path=rolePath;
 port.ctx={profile:{id:1,must_change_password:false},roleCodes:[],isAccountActive:true,permissionCodes:codes,globalPermissionCodes:codes,roleAssignments:[{roleId:1,roleCode:'synthetic',ownerCompanyId:null,branchId:null,permissionCodes:codes}]} as unknown as AuthContext;
 port.rpc.mockResolvedValue({error:null,data:{id:81,revision:'9',replayed:false}});
 port.read.mockImplementation(()=>{throw Error('Unexpected relation read');});client=new QueryClient({defaultOptions:{queries:{retry:false}}});
});
afterEach(()=>{cleanup();client.clear();});
it('Approval Role restores an explicitly unchecked draft and saves false only after Save',async()=>{
 const ui=render(roleApp());
 await waitFor(()=>expect(owner.state.tabs.some(t=>t.route.startsWith(rolePath))).toBe(true));
 // Mirror production WorkspaceContent owner admission by remounting the child
 // after the initial provider has established the tab. Keep the real provider.
 ui.rerender(tree(null));ui.rerender(roleApp());
 const ownerId=owner.state.tabs.find(t=>t.route.startsWith(rolePath))!.id;
 fireEvent.input(field('role_name'),{target:{value:synth}});
 fireEvent.blur(field('role_name'));
 fireEvent.change(field('scope'),{target:{value:'branch'}});
 const before=screen.getByRole('checkbox',{name:'Can Approve'});
 expect(before.getAttribute('data-checked')).not.toBeNull();
 fireEvent.click(before);
 expect(before.getAttribute('data-checked')).toBeNull();
 await new Promise(resolve=>setTimeout(resolve,25));
 const key='draft:tab:'+ownerId+':approval-role-workspace-form';
 expect(store.getDraft(key)).toMatchObject({role_name:synth,scope:'branch'}); expect(store.getDraft(key)?.can_approve).toBe('false');
 const local=Object.keys(localStorage).map(k=>localStorage.getItem(k)).join(' ');
 expect(local).toContain(rolePath);
 expect(local).not.toContain(synth);
 expect(sessionStorage.length).toBe(0);
 expect(port.rpc).not.toHaveBeenCalled();
 // Route change and remount with the same real provider/store.
 port.path='/dashboard';ui.rerender(tree(null));
 port.path=rolePath;ui.rerender(tree(null));ui.rerender(roleApp());
 expect(field('role_name').value).toBe(synth);expect(field('scope').value).toBe('branch');
 expect(screen.getByRole('checkbox',{name:'Can Approve'}).getAttribute('data-checked')).toBeNull();
 expect(port.rpc).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));
 await waitFor(()=>expect(port.rpc).toHaveBeenCalledOnce());
 expect(port.rpc.mock.calls[0][0]).toBe('phase3_save_catalogue');
 expect(submitted()).toMatchObject({p_id:81,p_revision:'8',p_data:{role_name:synth,scope:'branch',can_approve:false}});
 await waitFor(()=>expect(port.revalidate).toHaveBeenCalledTimes(2));

});

const designation = {
  id: 81, designation_code: 'S01', designation_name_en: 'Synthetic Supervisor',
  is_supervisor: true, is_authorized_signatory: false, is_active: true, workspace_revision: 8,
} as DesignationRow;
const requiredRule = {
  id: 81, rule_code: 'R01', rule_name: 'Synthetic document rule', entity_type: 'employee',
  is_required: true, requires_expiry_date: false, is_active: true, workspace_revision: 8,
} as DmsRequiredDocumentRuleRow;

it.each([
  ['/admin/common-master-data/designations/record/81', 'Is Supervisor', 'Authorized Signatory',
    { is_supervisor: false, is_authorized_signatory: true },
    () => <DesignationWorkspaceForm designation={designation} mode="edit" authContext={port.ctx} />],
  ['/admin/common-master-data/dms-required-documents/record/81', 'Is Required', 'Requires Expiry Date',
    { is_required: false, requires_expiry_date: true },
    () => <DmsRequiredDocumentRuleForm rule={requiredRule} mode="edit" authContext={port.ctx} />],
] as const)('keeps true and false values after leaving and returning to %s', async (path, checked, unchecked, payload, form) => {
  port.path = path;
  const ui = render(tree(null));
  await waitFor(() => expect(owner.state.tabs.some(tab => tab.route.startsWith(path))).toBe(true));
  ui.rerender(tree(form()));
  expect(screen.getByRole('checkbox', { name: checked }).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('checkbox', { name: unchecked }).getAttribute('aria-checked')).toBe('false');
  fireEvent.click(screen.getByRole('checkbox', { name: checked }));
  fireEvent.click(screen.getByRole('checkbox', { name: unchecked }));
  port.path = '/dashboard';
  ui.rerender(tree(null));
  port.path = path;
  ui.rerender(tree(null));
  ui.rerender(tree(form()));
  expect(screen.getByRole('checkbox', { name: checked }).getAttribute('aria-checked')).toBe('false');
  expect(screen.getByRole('checkbox', { name: unchecked }).getAttribute('aria-checked')).toBe('true');
  expect(port.rpc).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
  await waitFor(() => expect(port.rpc).toHaveBeenCalledOnce());
  expect(submitted()).toMatchObject({ p_id: 81, p_revision: '8', p_data: payload });
});
const wide=Object.fromEntries(Array.from({length:40},(_,i)=>['field_'+i,'value '+i]));
const codec:WorkspaceDraftCodec<typeof wide> = {encode:v=>v,restore:(start,read)=>Object.fromEntries(Object.entries(start).map(([k,v])=>[k,read(k,v)]))};
function Wide(){
 const draft=useWorkspaceControlledDraft({formId:'wide',initialValue:wide,enabled:true,codec});
 return <input aria-label="Wide synthetic form field" value={draft.value.field_0} onChange={e=>draft.setValue({...draft.value,field_0:e.target.value})}/>;
}
it('a controlled 40-field form notifies draft-store listeners once per changed field',async()=>{
 const ui=render(tree(null));
 await waitFor(()=>expect(owner.state.tabs.some(t=>t.route.startsWith(rolePath))).toBe(true));
 ui.rerender(tree(<Wide/>));
 const receive=vi.fn(),close=store.subscribe(receive);
 const meta=vi.spyOn(Storage.prototype,'setItem');
 fireEvent.change(screen.getByRole('textbox',{name:'Wide synthetic form field'}),{target:{value:synth}});
 expect(receive.mock.calls).toHaveLength(1);
 fireEvent.change(screen.getByRole('textbox',{name:'Wide synthetic form field'}),{target:{value:synth+' X'}});
 expect(receive.mock.calls).toHaveLength(2);
 expect(meta.mock.calls).toHaveLength(0);
 expect(port.rpc).not.toHaveBeenCalled();expect(port.read).not.toHaveBeenCalled();
 expect(meta.mock.calls.every(args=>!String(args[1]).includes(synth))).toBe(true);
 close();meta.mockRestore();

});

it('native submit reaches Save and Close and fresh provider reopens from server values',async()=>{
 const ui=render(roleApp());
 await waitFor(()=>expect(owner.state.tabs.some(t=>t.route.startsWith(rolePath))).toBe(true));
 ui.rerender(tree(null));ui.rerender(roleApp());
 fireEvent.input(field('role_name'),{target:{value:synth}});
 expect(port.rpc).not.toHaveBeenCalled();
 ui.unmount();
 render(roleApp());
 expect(field('role_name').value).toBe(role.role_name);
 expect(port.rpc).not.toHaveBeenCalled();
 fireEvent.submit(document.querySelector('#approval-role-workspace-form')!);
 await waitFor(()=>expect(port.rpc).toHaveBeenCalledOnce());
 expect(submitted().p_data.role_name).toBe(role.role_name);
});
