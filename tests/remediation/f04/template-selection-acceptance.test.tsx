// @vitest-environment jsdom
import { cleanup,fireEvent,render } from '@testing-library/react';
import { afterEach,expect,it,vi } from 'vitest';
const ctx=vi.hoisted(()=>({templates:[{id:1,template_name:'Synthetic A',template_code:'SYN',template_type:'report'}],select:vi.fn(),error:null as Error|null}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:ctx.templates,isPending:false,error:ctx.error})}));
vi.mock('@/server/actions/reports/templates',()=>({listReportTemplatesForSelection:vi.fn()}));
vi.mock('@/components/ui/dialog',()=>({Dialog:({children}:any)=><div>{children}</div>,DialogContent:({children}:any)=><div>{children}</div>,DialogHeader:({children}:any)=><div>{children}</div>,DialogTitle:({children}:any)=><h2>{children}</h2>,DialogDescription:({children}:any)=><p>{children}</p>,DialogFooter:({children}:any)=><div>{children}</div>}));
vi.mock('@/components/ui/scroll-area',()=>({ScrollArea:({children}:any)=><div>{children}</div>}));
import { ReportTemplateSelectDialog } from '@/components/report-center/report-template-select-dialog';
const dialog=(company=1,open=true)=><ReportTemplateSelectDialog open={open} ownerCompanyIds={[company]} onSelect={ctx.select} onOpenChange={()=>{}}/>;
afterEach(()=>{cleanup();ctx.select.mockClear();ctx.error=null;});
it('company change clears the previous branding selection before confirmation',()=>{const ui=render(dialog());fireEvent.click(ui.getByRole('button',{name:/Synthetic A/}));expect((ui.getByText('Use Template') as HTMLButtonElement).disabled).toBe(false);ui.rerender(dialog(2));expect((ui.getByText('Use Template') as HTMLButtonElement).disabled).toBe(true);expect(ctx.select).not.toHaveBeenCalled();});
it('cancel/reopen does not restore an unconfirmed selection',()=>{const ui=render(dialog());fireEvent.click(ui.getByRole('button',{name:/Synthetic A/}));ui.rerender(dialog(1,false));ui.rerender(dialog());expect((ui.getByText('Use Template') as HTMLButtonElement).disabled).toBe(true);});
it('lookup failure is an error rather than a misleading empty catalogue',()=>{ctx.error=new Error('offline');const ui=render(dialog());expect(ui.getByRole('alert').textContent).toContain('Could not load');expect(ui.queryByText('No active templates found.')).toBeNull();expect(ctx.select).not.toHaveBeenCalled();});
