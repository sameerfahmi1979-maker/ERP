// @vitest-environment jsdom
import {cleanup,render,screen} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),category:vi.fn(),value:vi.fn(),categories:vi.fn(),missing:vi.fn(),redirect:vi.fn()}));
vi.mock('next/navigation',()=>({notFound:m.missing,redirect:m.redirect}));
vi.mock('next/link',()=>({default:({children,href}:{children:React.ReactNode;href:string})=><a href={href}>{children}</a>}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.auth}));
vi.mock('@/server/actions/master-data/lookups',()=>({getLookupCategoryById:m.category,getLookupValueById:m.value,listLookupCategories:m.categories}));
vi.mock('@/features/master-data/lookups/components/lookup-category-workspace-form',()=>({LookupCategoryWorkspaceForm:()=> <div data-testid="lookup-editor"/>}));
vi.mock('@/features/master-data/lookups/components/lookup-value-workspace-form',()=>({LookupValueWorkspaceForm:()=> <div data-testid="lookup-editor"/>}));
import CategoryPage from '@/app/(protected)/admin/master-data/lookups/categories/record/[id]/page';
import ValuePage from '@/app/(protected)/admin/master-data/lookups/values/record/[id]/page';
import NewValuePage from '@/app/(protected)/admin/master-data/lookups/values/record/new/page';
const props=()=>({params:Promise.resolve({id:'9'}),searchParams:Promise.resolve({mode:'edit'})});
beforeEach(()=>{
 vi.clearAllMocks();m.auth.mockResolvedValue({profile:{id:1,must_change_password:false},isAccountActive:true,roleAssignments:[],globalPermissionCodes:['master_data.lookups.view','master_data.lookups.manage']});
 m.missing.mockImplementation(()=>{throw Error('TEST_NOT_FOUND');});m.redirect.mockImplementation((to:string)=>{throw Error('TEST_REDIRECT:'+to);});
 m.category.mockResolvedValue({success:true,data:{id:9,is_locked:false}});m.value.mockResolvedValue({success:true,data:{id:9,category_id:8,is_locked:false}});m.categories.mockResolvedValue({success:true,data:[{id:8,is_locked:false}]});
});afterEach(cleanup);
it.each([['category',CategoryPage,'category'],['value',ValuePage,'value']] as const)('%s route sends only explicit not_found to404',async(_name,Page,source)=>{m[source].mockResolvedValue({success:false,kind:'not_found'});await expect(Page(props())).rejects.toThrow('TEST_NOT_FOUND');expect(m.missing).toHaveBeenCalledOnce();});
it.each([['category',CategoryPage,'category'],['value',ValuePage,'value']] as const)('%s failed read renders retryable safe alert, not404/editor',async(_name,Page,source)=>{m[source].mockResolvedValue({success:false,kind:'failed',error:'PRIVATE_SQL'});render(await Page(props()));expect(screen.getByRole('alert')).toBeTruthy();expect(screen.queryByTestId('lookup-editor')).toBeNull();expect(m.missing).not.toHaveBeenCalled();expect(document.body.textContent).not.toContain('PRIVATE_SQL');expect(screen.getByRole('link')).toBeTruthy();});
it.each([['category',CategoryPage,'category'],['value',ValuePage,'value']] as const)('%s forbidden result uses access-denied, not404',async(_name,Page,source)=>{m[source].mockResolvedValue({success:false,kind:'forbidden'});await expect(Page(props())).rejects.toThrow('TEST_REDIRECT:/access-denied');expect(m.missing).not.toHaveBeenCalled();});
it('new value category-list failure blocks the editor instead of inventing empty choices',async()=>{m.categories.mockResolvedValue({success:false,kind:'failed',error:'PRIVATE_CATEGORIES'});render(await NewValuePage());expect(screen.getByRole('alert')).toBeTruthy();expect(screen.queryByTestId('lookup-editor')).toBeNull();expect(document.body.textContent).not.toContain('PRIVATE_CATEGORIES');});
it('existing value category-list failure blocks editing without clearing hidden fields',async()=>{m.categories.mockResolvedValue({success:false,kind:'failed',error:'PRIVATE_CATEGORIES'});render(await ValuePage(props()));expect(screen.getByRole('alert')).toBeTruthy();expect(screen.queryByTestId('lookup-editor')).toBeNull();expect(m.missing).not.toHaveBeenCalled();expect(document.body.textContent).not.toContain('PRIVATE_CATEGORIES');});
it.each([NewValuePage,()=>ValuePage(props())])('category-list forbidden result is access denied',async Page=>{m.categories.mockResolvedValue({success:false,kind:'forbidden'});await expect(Page()).rejects.toThrow('TEST_REDIRECT:/access-denied');expect(m.missing).not.toHaveBeenCalled();});
