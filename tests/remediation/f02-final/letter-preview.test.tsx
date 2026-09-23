// @vitest-environment jsdom
import { act,cleanup,render,waitFor } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { afterEach,expect,it,vi } from 'vitest';
import { LetterPreviewDialog } from '@/features/report-center/letter-preview-dialog';
const actions=vi.hoisted(()=>({run:vi.fn(),branding:vi.fn(),templates:vi.fn(),visual:vi.fn()}));
vi.mock('@/server/actions/reports/runner',()=>({runReportAction:actions.run}));
vi.mock('@/server/actions/reports/templates',()=>({resolveTemplatePreview:actions.branding,listReportTemplatesForSelection:actions.templates,renderVisualTemplateForLetterPreview:actions.visual}));
vi.mock('@/lib/output/letter-document-builder',()=>({buildLetterExecutiveLedgerDocument:()=>null}));
vi.mock('@/features/executive-ledger/executive-ledger-preview',()=>({ExecutiveLedgerPreview:()=>null}));
vi.mock('@/lib/export/pdf',()=>({exportToPDF:vi.fn()}));
vi.mock('@/lib/export/print',()=>({exportToPrint:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
const result=(name:string)=>({success:true,data:{data:{columns:['employee_name'],rows:[{employee_name:name}]},resolvedTemplateId:null}});
it('actual preview ignores a late response for the previous synthetic employee',async()=>{
 let old!:(v:unknown)=>void;
 actions.run.mockImplementation(({filters})=>filters.employee_id==='90001'?new Promise(r=>{old=r;}):Promise.resolve(result('CURRENT_SYNTHETIC')));
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 const page=(id:number)=><QueryClientProvider client={client}><LetterPreviewDialog open onOpenChange={vi.fn()} reportCode="test" reportLabel="Synthetic letter" employeeId={id}/></QueryClientProvider>;
 const ui=render(page(90001));ui.rerender(page(90002));
 await waitFor(()=>expect(ui.getByText('CURRENT_SYNTHETIC')).toBeTruthy());
 await act(async()=>old(result('STALE_SYNTHETIC')));
 expect(ui.queryByText('STALE_SYNTHETIC')).toBeNull();expect(ui.getByText('CURRENT_SYNTHETIC')).toBeTruthy();client.clear();
});
it('a returned report failure is visible and output buttons remain disabled',async()=>{
 actions.run.mockResolvedValue({success:false,error:'Synthetic report failure'});
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 const ui=render(<QueryClientProvider client={client}><LetterPreviewDialog open onOpenChange={vi.fn()} reportCode="test" reportLabel="Synthetic letter" employeeId={90001}/></QueryClientProvider>);
 await waitFor(()=>expect(ui.getByText('Synthetic report failure')).toBeTruthy());
 for(const button of ui.getAllByRole('button').filter(b=>/PDF|Print/.test(b.textContent??'')))expect((button as HTMLButtonElement).disabled).toBe(true);
 expect(actions.run).toHaveBeenCalledTimes(1);client.clear();
});
