import { expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({list:vi.fn(),permission:vi.fn(()=>false)}));
vi.mock('server-only',()=>({}));
vi.mock('next/navigation',()=>({redirect:(destination:string)=>{throw Error('redirect:'+destination);}}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({}),hasPermission:state.permission}));
vi.mock('@/server/actions/reports/registry',()=>({listReportRegistry:state.list}));
vi.mock('@/components/erp/page-header',()=>({ERPPageHeader:()=>null}));
vi.mock('@/features/report-center/report-registry-table',()=>({ReportRegistryTable:()=>null}));
import Page from '@/app/(protected)/admin/reports/page';
it('denied report users reach a real access-denied page before any report lookup',async()=>{
 await expect(Page()).rejects.toThrow('redirect:/access-denied');
 expect(state.list).not.toHaveBeenCalled();
});
