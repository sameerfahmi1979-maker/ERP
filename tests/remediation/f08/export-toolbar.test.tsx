// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {ReactNode} from 'react';
import type {ReportRegistryEntry} from '@/lib/report-center/types';
vi.mock('@/hooks/use-legacy-email-access',()=>({useLegacyEmailAccess:()=>false}));
vi.mock('@/components/erp/email/erp-send-email-dialog',()=>({ERPSendEmailDialog:()=>null}));
vi.mock('@/server/actions/email',()=>({sendReportEmail:vi.fn()}));
vi.mock('@/lib/export/generate-attachment',()=>({generatePDFAttachment:vi.fn(),generateExcelAttachment:vi.fn(),generateCSVAttachment:vi.fn()}));
vi.mock('@/components/ui/button',()=>({Button:({children,variant:_,size:__,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:string;size?:string})=><button {...props}>{children}</button>}));
vi.mock('@/components/ui/badge',()=>({Badge:({children}:{children:ReactNode})=><span>{children}</span>}));
vi.mock('@/components/ui/dropdown-menu',()=>({DropdownMenu:({children}:{children:ReactNode})=><div>{children}</div>,DropdownMenuContent:({children}:{children:ReactNode})=><div>{children}</div>,DropdownMenuTrigger:({children}:{children:ReactNode})=><button>{children}</button>,DropdownMenuItem:({children,onClick}:{children:ReactNode;onClick:()=>void})=><button onClick={onClick}>{children}</button>,DropdownMenuSeparator:()=>null}));
import {ReportExportToolbar} from '@/features/report-center/report-export-toolbar';
afterEach(cleanup);
const registry={report_code:'F08_SYNTHETIC',report_name_en:'Synthetic',report_category:'list',sensitive_profile:'normal',default_output_formats:['csv','pdf','excel','print']} as ReportRegistryEntry;
it('delegates CSV to the same parent export contract as the other formats, not a second unsafe serializer',()=>{
 const exportAction=vi.fn();render(<ReportExportToolbar registryEntry={registry} data={{columns:['code'],rows:[{code:'=NOT_A_FORMULA'}]}} rowCount={1} onExport={exportAction} canUseData={()=>true}/>);fireEvent.click(screen.getByRole('button',{name:'CSV',exact:true}));expect(exportAction).toHaveBeenCalledExactlyOnceWith('csv');
});
it('a retired result cannot start a CSV export',()=>{const exportAction=vi.fn();render(<ReportExportToolbar registryEntry={registry} data={{columns:[],rows:[]}} rowCount={0} onExport={exportAction} canUseData={()=>false}/>);fireEvent.click(screen.getByRole('button',{name:'CSV',exact:true}));expect(exportAction).not.toHaveBeenCalled();});
it('official letter source data cannot bypass the governed issuance/draft path through generic PDF, print, CSV or email',()=>{
 render(<ReportExportToolbar registryEntry={{...registry,is_letter_type:true}} data={{columns:[],rows:[]}} rowCount={0} onExport={vi.fn()} canUseData={()=>true}/>);expect(screen.getByRole('note').textContent).toContain('not an official document');expect(screen.queryByRole('button')).toBeNull();
});
