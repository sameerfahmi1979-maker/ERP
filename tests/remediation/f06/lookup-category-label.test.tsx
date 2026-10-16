// @vitest-environment jsdom
// Actual Base UI Select and actual F06 form; workspace/server boundaries mocked.
import '../f05/setup';
import type {ReactNode} from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
import type {LookupCategory,LookupValue} from '@/features/master-data/lookups/types';
const m=vi.hoisted(()=>({draft:undefined as number|null|undefined}));
vi.mock('@/hooks/use-workspace-form-navigation',()=>({useWorkspaceFormNavigation:()=>({closeTab:()=>{},activeTab:{id:'labels'},markDirty:()=>{},forceCloseActiveTab:()=>{},updateTabRoute:()=>{},renameTab:()=>{},isTabActive:()=>true})}));
vi.mock('next/navigation',()=>({useRouter:()=>({replace:()=>{}})}));
vi.mock('@/hooks/use-workspace-form-dirty',()=>({useWorkspaceFormDirty:()=>({isDirty:false,resetDirty:()=>{}})}));
vi.mock('@/hooks/use-workspace-form-draft',()=>({useWorkspaceFormDraft:()=>({getDraftDefault:(_key:string,fallback:unknown)=>fallback,getDraftBoolean:(_key:string,fallback:unknown)=>fallback,getDraftNullableId:(_key:string,fallback:unknown)=>m.draft===undefined?fallback:m.draft,syncDraft:()=>{},writeDraftField:()=>{},clearDraft:()=>{}})}));
vi.mock('@/hooks/use-workspace-form-section',()=>({useWorkspaceFormSection:()=>['basic',()=>{}]}));
vi.mock('@/features/master-data/lookups/use-lookup-mutation',()=>({useLookupMutation:()=>({blocked:false,working:false,uncertain:false,savedId:null,run:vi.fn()})}));
vi.mock('@tanstack/react-query',()=>({useQueryClient:()=>({})}));
vi.mock('@/components/workspace/erp-record-workspace-form',()=>({ERPRecordWorkspaceForm:({children}:{children:ReactNode})=><div>{children}</div>,ERPRecordSectionPanel:({children}:{children:ReactNode})=><section>{children}</section>}));
import {LookupValueWorkspaceForm} from '@/features/master-data/lookups/components/lookup-value-workspace-form';
const auth={profile:{id:1},isAccountActive:true,roleAssignments:[],roleCodes:[],permissionCodes:[],globalPermissionCodes:['master_data.lookups.manage','master_data.lookups.lock']} as unknown as AuthContext;
const categories=[{id:4,workspace_revision:1,category_code:'QA_FIRST',category_name_en:'First synthetic category',is_active:true},{id:8,workspace_revision:2,category_code:'QA_SECOND',category_name_en:'Second synthetic category',is_active:true}] as LookupCategory[];
beforeEach(()=>{m.draft=undefined;});afterEach(cleanup);
it('closed initial trigger displays category label before opening while serialized value stays numeric',()=>{
 const v=render(<LookupValueWorkspaceForm categories={categories} mode="add" authContext={auth}/>);
 expect(screen.getByRole('combobox').textContent).toContain('First synthetic category (QA_FIRST)');expect((v.container.querySelector('input[name="category_id"]') as HTMLInputElement).value).toBe('4');expect(screen.queryByRole('listbox')).toBeNull();
});
it.each(['edit','view'] as const)('closed %s trigger labels the immutable saved category',mode=>{
 render(<LookupValueWorkspaceForm value={{id:9,category_id:8,value_code:'QA',workspace_revision:2} as LookupValue} categories={categories} mode={mode} authContext={auth}/>);expect(screen.getByRole('combobox').textContent).toContain('Second synthetic category (QA_SECOND)');
});
it('remounted in-memory category draft has its label immediately',()=>{m.draft=8;const first=render(<LookupValueWorkspaceForm categories={categories} mode="add" authContext={auth}/>);first.unmount();render(<LookupValueWorkspaceForm categories={categories} mode="add" authContext={auth}/>);expect(screen.getByRole('combobox').textContent).toContain('Second synthetic category (QA_SECOND)');});
it('explicit category selection updates label and serialized original identifier',async()=>{
 const v=render(<LookupValueWorkspaceForm categories={categories} mode="add" authContext={auth}/>);fireEvent.click(screen.getByRole('combobox'));const option=await screen.findByRole('option',{name:'Second synthetic category (QA_SECOND)'});fireEvent.pointerDown(option,{pointerType:'mouse'});fireEvent.click(option,{detail:1});await waitFor(()=>expect(screen.getByRole('combobox').textContent).toContain('Second synthetic category (QA_SECOND)'));expect((v.container.querySelector('input[name="category_id"]') as HTMLInputElement).value).toBe('8');
});
it('explicit cleared draft retains placeholder rather than silently selecting the first category',()=>{m.draft=null;render(<LookupValueWorkspaceForm categories={categories} mode="add" authContext={auth}/>);expect(screen.getByRole('combobox').textContent).toContain('Select category');});
it('unavailable retained category is honest rather than a raw ID or a silent replacement',()=>{m.draft=999;const v=render(<LookupValueWorkspaceForm categories={categories} mode="add" authContext={auth}/>);expect(screen.getByRole('combobox',{name:'Category'}).textContent).toContain('Selected category unavailable');expect((v.container.querySelector('input[name="category_id"]') as HTMLInputElement).value).toBe('999');});
