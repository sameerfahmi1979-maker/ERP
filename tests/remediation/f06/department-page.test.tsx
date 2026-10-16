// @vitest-environment jsdom
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
const mock=vi.hoisted(()=>({read:vi.fn(),auth:vi.fn(),permission:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:mock.auth,hasPermission:mock.permission}));
vi.mock('@/server/reads/departments',()=>({readDepartments:mock.read}));
vi.mock('@/server/department-scope-catalogue',()=>({readDepartmentScopeCatalogue:async()=>({success:true,data:{companies:[],branches:[]}})}));
vi.mock('next/navigation',()=>({redirect:(path:string)=>{throw Error('redirect:'+path);}}));
vi.mock('@/components/erp/page-header',()=>({ERPPageHeader:()=>null}));
vi.mock('@/components/erp/load-error',()=>({LoadError:({title}:any)=><p role="alert">Unable to load {title}</p>}));
vi.mock('@/features/common-master-data/departments/departments-list-client',()=>({DepartmentsListClient:({departments,authContext}:any)=><p>Working list {departments.length} principal {authContext.profile.id}</p>}));
vi.mock('@/components/ui/button',()=>({Button:()=>null}));
import Page from '@/app/(protected)/admin/common-master-data/departments/page';
beforeEach(()=>{vi.clearAllMocks();mock.auth.mockResolvedValue({profile:{id:6}});mock.permission.mockReturnValue(true);mock.read.mockResolvedValue({success:true,data:[]});});afterEach(cleanup);
it('keeps recovery-capable list mounted when no working records remain',async()=>{render(await Page());expect(screen.getByText('Working list 0 principal 6')).toBeTruthy();expect(mock.read).toHaveBeenCalledWith({},await mock.auth.mock.results[0].value);expect(mock.auth).toHaveBeenCalledOnce();});
it('failed reads are not presented as an empty department catalogue',async()=>{mock.read.mockResolvedValue({success:false,error:'internal details'});render(await Page());expect(screen.getByRole('alert').textContent).toBe('Unable to load Departments');expect(screen.queryByText(/Working list/)).toBeNull();expect(screen.queryByText('internal details')).toBeNull();});
it('unauthorized entry does not issue a business read',async()=>{mock.permission.mockReturnValue(false);await expect(Page()).rejects.toThrow('redirect:');expect(mock.read).not.toHaveBeenCalled();});
