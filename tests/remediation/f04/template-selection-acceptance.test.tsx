// @vitest-environment jsdom
import React from 'react';
import {cleanup,fireEvent,render,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {syntheticAuthContext} from '../../performance/fixtures/auth-context';
const ctx=vi.hoisted(()=>({read:vi.fn(),select:vi.fn()}));
vi.mock('@/lib/reads/client',async()=>({...await vi.importActual('@/lib/reads/client'),readJson:ctx.read}));
vi.mock('@/components/ui/dialog',()=>({Dialog:({children}:React.PropsWithChildren)=><div>{children}</div>,DialogContent:({children}:React.PropsWithChildren)=><div>{children}</div>,DialogHeader:({children}:React.PropsWithChildren)=><div>{children}</div>,DialogTitle:({children}:React.PropsWithChildren)=><h2>{children}</h2>,DialogDescription:({children}:React.PropsWithChildren)=><p>{children}</p>,DialogFooter:({children}:React.PropsWithChildren)=><div>{children}</div>}));
vi.mock('@/components/ui/scroll-area',()=>({ScrollArea:({children}:React.PropsWithChildren)=><div>{children}</div>}));
import {ReportTemplateSelectDialog} from '@/components/report-center/report-template-select-dialog';
import {reportTemplateSelectionCriteriaSchema} from '@/lib/reads/report-template-selection-schema';
import {ReadError} from '@/lib/reads/client';
const auth=syntheticAuthContext(['reports.view']);
let client:QueryClient;
beforeEach(()=>{
 client=new QueryClient({defaultOptions:{queries:{retry:false,retryDelay:0}}});
 ctx.read.mockImplementation(async(_resource,input)=>{
  const criteria=reportTemplateSelectionCriteriaSchema.parse(input);
  const template={id:1,template_name:'Synthetic A',template_code:'SYN',template_type:'report',is_default:false,governance_status:'approved',visual_editor_engine:null,branding_profile_id:3,branding_profile_name:'Branding',branding_profile_type:'company',company_name:'Synthetic',logo_url:null,owner_company_id:criteria.ownerCompanyIds[0],selectable:true};
  return {success:true,data:{criteria,rows:[template],totalCount:1,selected:criteria.selectedId?template:null}};
 });
});
const dialog=(company=1,open=true)=><QueryClientProvider client={client}><ReportTemplateSelectDialog authContext={auth} open={open} ownerCompanyIds={[company]} onSelect={ctx.select} onOpenChange={()=>{}}/></QueryClientProvider>;
afterEach(()=>{cleanup();client.clear();ctx.select.mockReset();ctx.read.mockReset();});
it('company change clears the previous branding selection before confirmation',async()=>{
 const ui=render(dialog());fireEvent.click((await ui.findByText('Synthetic A')).closest('button')!);
 await waitFor(()=>expect((ui.getByText('Use Template') as HTMLButtonElement).disabled).toBe(false));
 ui.rerender(dialog(2));expect((ui.getByText('Use Template') as HTMLButtonElement).disabled).toBe(true);expect(ctx.select).not.toHaveBeenCalled();
});
it('cancel/reopen does not restore an unconfirmed selection',async()=>{
 const ui=render(dialog());fireEvent.click((await ui.findByText('Synthetic A')).closest('button')!);
 await waitFor(()=>expect((ui.getByText('Use Template') as HTMLButtonElement).disabled).toBe(false));
 ui.rerender(dialog(1,false));ui.rerender(dialog());expect((ui.getByText('Use Template') as HTMLButtonElement).disabled).toBe(true);
});
it('lookup failure is an error rather than a misleading empty catalogue',async()=>{
 ctx.read.mockRejectedValue(new ReadError('offline',503));const ui=render(dialog());
 expect((await ui.findByRole('alert')).textContent).toContain('Could not load');expect(ui.queryByText('No active templates found.')).toBeNull();expect(ctx.select).not.toHaveBeenCalled();
});
