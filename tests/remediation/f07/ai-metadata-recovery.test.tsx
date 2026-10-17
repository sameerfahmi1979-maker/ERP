// @vitest-environment jsdom
// In-process React state test. No browser engine, network or device control.
import '../f05/setup';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {ReactNode} from 'react';
const m=vi.hoisted(()=>({apply:vi.fn(),read:vi.fn(),rows:[] as object[],hash:'a'.repeat(64)}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>null}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>null}));
vi.mock('@/features/dms/documents/section-activity',async()=>{const q=await import('@tanstack/react-query');return {useDmsSectionQuery:q.useQuery};});
vi.mock('@/features/dms/documents/section-read',()=>({readDmsSection:(...args:unknown[])=>m.read(...args)}));
vi.mock('@/server/actions/dms/ai-analysis',()=>({applyAiAnalysisToMetadata:(...args:unknown[])=>m.apply(...args)}));
vi.mock('@/features/dms/documents/section-read-boundary',()=>({QueryReadBoundary:({children}:{children:ReactNode})=><>{children}</>,AlertDialog:({open,children}:{open:boolean;children:ReactNode})=>open?<section aria-label="Metadata confirmation">{children}</section>:null}));
vi.mock('@/components/ui/alert-dialog',()=>({AlertDialogAction:'button',AlertDialogCancel:'button',AlertDialogContent:'div',AlertDialogDescription:'div',AlertDialogFooter:'div',AlertDialogHeader:'div',AlertDialogTitle:'h2'}));
vi.mock('@/components/ui/button',()=>({Button:({children,...props}:{children:ReactNode;[key:string]:unknown})=><button {...props}>{children}</button>}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn(),warning:vi.fn()}}));
vi.mock('@/components/erp/table/erp-data-table',()=>({ERPDataTable:({data,columns}:{data:object[];columns:{id:string;cell?:(p:{row:{original:object}})=>ReactNode}[]})=><div>{data.map((row,index)=><div key={index}>{columns.find(c=>c.id==='select')?.cell?.({row:{original:row}})}</div>)}</div>}));
import {AiMetadataDiffSection} from '@/features/dms/documents/sections/dms-document-ai-section';
afterEach(cleanup);
it('retains the exact reviewed request across response loss and a successful background refresh',async()=>{
 m.rows=[];m.hash='a'.repeat(64);m.read.mockImplementation(async(kind:string)=>kind==='getMetadataDefinitionsForType'?{success:true,data:[{id:1,document_type_id:1,field_code:'notes',field_label_en:'Notes',field_type:'text',is_required:false,is_ai_extractable:true,ai_confidence_threshold:0.8}]}:{success:true,data:m.rows,snapshot:m.hash,sourceSnapshot:'b'.repeat(64)});
 m.apply.mockResolvedValueOnce({success:false,uncertain:true,error:'Unconfirmed; retry the same review.'}).mockResolvedValueOnce({success:true,data:{appliedCount:1,skippedCount:0,appliedFields:['notes'],skippedFields:[],aiResultStatus:'partially_accepted'}});
 const qc=new QueryClient({defaultOptions:{queries:{retry:false}}}),onApplied=vi.fn();
 render(<QueryClientProvider client={qc}><AiMetadataDiffSection documentId={1} documentTypeId={1} result={{id:1,extracted_fields_json:{notes:'Full reviewed note'},field_confidence_json:{notes:{score:0.95,label:'high'}}} as never} onApplied={onApplied}/></QueryClientProvider>);
 fireEvent.click(await screen.findByTitle('notes'));
 fireEvent.click(await screen.findByRole('button',{name:'Apply Selected (1)'}));
 fireEvent.click(screen.getByRole('button',{name:'Apply Selected',exact:true}));
 await waitFor(()=>expect(m.apply).toHaveBeenCalledTimes(1));
 await waitFor(()=>expect((screen.getByRole('button',{name:'Cancel'}) as HTMLButtonElement).disabled).toBe(true));
 m.rows=[{id:1,document_id:1,definition_id:1,value_text:'Full reviewed note',value_number:null,value_date:null,value_datetime:null,value_boolean:null,value_json:null}];m.hash='c'.repeat(64);
 await qc.invalidateQueries();
 fireEvent.click(screen.getByRole('button',{name:'Apply Selected',exact:true}));
 await waitFor(()=>expect(onApplied).toHaveBeenCalledOnce());
 expect(m.apply.mock.calls[1]).toEqual(m.apply.mock.calls[0]);expect(m.apply.mock.calls[0][0].snapshot).toBe('a'.repeat(64));
 expect(m.apply.mock.calls[0][0].requestId).toMatch(/^[a-f0-9-]{36}$/);qc.clear();
});
