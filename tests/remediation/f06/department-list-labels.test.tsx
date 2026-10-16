// @vitest-environment jsdom
import React from 'react';
import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({list:vi.fn(),scope:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({}),hasPermission:()=>true}));
vi.mock('@/server/actions/common-master-data/departments',()=>({listDepartments:mock.list}));
vi.mock('@/server/department-scope-catalogue',()=>({readDepartmentScopeCatalogue:mock.scope}));
vi.mock('@/components/erp/page-header',()=>({ERPPageHeader:()=>null}));
vi.mock('@/components/erp/load-error',()=>({LoadError:({title}:{title:string})=><div role="alert">{title} unavailable</div>}));
vi.mock('@/features/common-master-data/departments/departments-list-client',()=>({DepartmentsListClient:({departments}:{departments:Array<{owner_company?:{legal_name_en:string}|null;branch?:{branch_name_en:string}|null}>})=><div>{departments.map((d,i)=><p key={i}>{d.owner_company?.legal_name_en??'Unavailable company'} / {d.branch?.branch_name_en??'Unavailable branch'}</p>)}</div>}));
import Page from '@/app/(protected)/admin/common-master-data/departments/page';
beforeEach(()=>{vi.clearAllMocks();mock.list.mockResolvedValue({success:true,data:[{id:28,owner_company_id:1,branch_id:1,owner_company:null,branch:null}]});mock.scope.mockResolvedValue({success:true,data:{companies:[{id:1,legal_name_en:'Authorized company A',company_code:'A',status:'active',can_manage:false}],branches:[{id:1,owner_company_id:1,branch_name_en:'Authorized branch A1',branch_name_ar:null,branch_code:'A1',status:'active',can_manage:true}]}});});
afterEach(cleanup);
it('a branch manager sees authorized labels without base-table access',async()=>{render(await Page());expect(screen.getByText('Authorized company A / Authorized branch A1')).toBeTruthy();});
it('does not turn a failed label lookup into a successful empty or unlabeled list',async()=>{mock.scope.mockResolvedValue({success:false});render(await Page());expect(screen.getByRole('alert').textContent).toContain('Department organizations and branches');expect(screen.queryByText('Unavailable company / Unavailable branch')).toBeNull();});
it('does not probe catalogue after a failed Department read',async()=>{mock.list.mockResolvedValue({success:false});render(await Page());expect(screen.getByRole('alert').textContent).toContain('Departments');expect(mock.scope).not.toHaveBeenCalled();});
it('an empty authorized list remains a successful empty list',async()=>{mock.list.mockResolvedValue({success:true,data:[]});render(await Page());expect(screen.queryByRole('alert')).toBeNull();});
it('does not associate a catalogue branch from a different company',async()=>{const value=await mock.scope();value.data.branches[0].owner_company_id=2;mock.scope.mockResolvedValue(value);render(await Page());expect(screen.getByText('Authorized company A / Unavailable branch')).toBeTruthy();});
