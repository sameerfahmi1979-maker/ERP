// @vitest-environment jsdom
// Real dialog, field feedback, combobox and retained-request hook. Only host /
// transport boundaries are doubled; no database or browser acceptance is claimed.
import '../f05/setup';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {FluentProvider,webLightTheme} from '@fluentui/react-components';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import type {DmsUploadSessionRow} from '@/server/actions/dms/upload-sessions';
const m=vi.hoisted(()=>({store:null as unknown,action:vi.fn(),push:vi.fn(),close:vi.fn()}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>m.store}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:'n02-validation-owner'})}));
vi.mock('@/hooks/use-workspace-navigation-lock',()=>({useWorkspaceNavigationLock:()=>undefined}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:m.push})}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),warning:vi.fn(),error:vi.fn()}}));
vi.mock('@/server/actions/dms/document-upload-attach',()=>({createDocumentFromUpload:m.action}));
vi.mock('@/server/actions/dms/entity-documents',()=>({linkDmsDocumentToEntity:vi.fn()}));
import {DmsCreateDocumentFromUploadDialog} from '@/features/dms/upload/dms-create-document-from-upload-dialog';
const session={id:17,original_filename:'validation.txt',mime_type:'text/plain',file_size_bytes:9,is_duplicate:false} as DmsUploadSessionRow;
const mount=()=>render(<FluentProvider theme={webLightTheme}><DmsCreateDocumentFromUploadDialog open onOpenChange={m.close} session={session} documentTypes={[{id:8,type_code:'SYN',name_en:'Synthetic'}]}/></FluentProvider>);
const title=()=>screen.getByRole('textbox',{name:/Document Title/});
const type=()=>screen.getByRole('combobox',{name:'Document Type'});
const save=()=>fireEvent.click(screen.getByRole('button',{name:'Create document',exact:true}));
async function chooseType(){fireEvent.click(type());fireEvent.click(await screen.findByRole('option',{name:'SYN — Synthetic'}));}
beforeEach(()=>{vi.resetAllMocks();m.store=createWorkspaceDraftStore();m.action.mockResolvedValue({success:false,error:'Known rejected request'});});
afterEach(cleanup);
it('blank save lists both required fields and links to the actual type control',async()=>{
 mount();save();expect(screen.getByText('Check 2 fields before saving')).toBeTruthy();expect(document.activeElement).toBe(title());
 fireEvent.click(screen.getByRole('button',{name:'Document Type: This field is required.'}));expect(document.activeElement).toBe(type());expect(m.action).not.toHaveBeenCalled();
});
it('title-only save identifies only Document Type and focuses it without dispatch',()=>{
 mount();fireEvent.change(title(),{target:{value:'Synthetic'}});save();expect(screen.getByText('Check 1 field before saving')).toBeTruthy();expect(document.activeElement).toBe(type());
 expect(screen.queryByText('Title and document type are required')).toBeNull();expect(m.action).not.toHaveBeenCalled();
});
it('correcting the required type clears field feedback before the request starts',async()=>{
 mount();fireEvent.change(title(),{target:{value:'Synthetic'}});save();await chooseType();
 await waitFor(()=>expect(screen.queryByText(/Check \d+ fields? before saving/)).toBeNull());
 expect(screen.queryByText('Title and document type are required')).toBeNull();expect(m.action).not.toHaveBeenCalled();
});
it('editing after a known rejection removes stale message but retains other draft values',async()=>{
 mount();fireEvent.change(title(),{target:{value:'Synthetic'}});await chooseType();save();await screen.findByText('Known rejected request');
 fireEvent.change(title(),{target:{value:'Corrected'}});expect(screen.queryByText('Known rejected request')).toBeNull();expect(type().textContent).toContain('SYN — Synthetic');expect(m.action).toHaveBeenCalledTimes(1);
});
it('retry clears old feedback only during dispatch and preserves the exact retained tuple and lock',async()=>{
 m.action.mockResolvedValueOnce({success:false,uncertain:true,error:'Creation unconfirmed'});mount();fireEvent.change(title(),{target:{value:'Synthetic'}});await chooseType();save();await screen.findByText('Creation unconfirmed');
 expect(title()).toHaveProperty('disabled',true);expect(type()).toHaveProperty('disabled',true);expect(screen.getByRole('button',{name:'Cancel',exact:true})).toHaveProperty('disabled',true);
 let finish!:(value:unknown)=>void;m.action.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));fireEvent.click(screen.getByRole('button',{name:'Retry original request'}));
 await waitFor(()=>expect(m.action).toHaveBeenCalledTimes(2));expect(m.action.mock.calls[1]).toEqual(m.action.mock.calls[0]);expect(screen.queryByText('Creation unconfirmed')).toBeNull();
 await act(async()=>finish({success:false,uncertain:true,error:'Still unconfirmed'}));await screen.findByText('Still unconfirmed');expect(m.close).not.toHaveBeenCalled();expect(m.push).not.toHaveBeenCalled();
});
