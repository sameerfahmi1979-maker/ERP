// @vitest-environment jsdom
import './setup';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DmsDocumentFilesSection } from '@/features/dms/documents/sections/dms-document-files-section';
import { DmsDocumentVersionsSection } from '@/features/dms/documents/sections/dms-document-versions-section';
import type { ReactNode } from 'react';
const mocks=vi.hoisted(()=>({files:vi.fn(),preview:vi.fn(),versions:vi.fn(),remove:vi.fn(),ocr:vi.fn()}));
vi.mock('@/server/actions/dms/document-files',()=>({getDmsDocumentFiles:mocks.files,getDmsDocumentFileSignedUrl:mocks.preview,adminDeleteDmsDocumentFile:mocks.remove,getDmsDocumentVersions:mocks.versions,setDmsDocumentCurrentVersion:vi.fn(),unlinkDmsDocumentVersion:vi.fn()}));
vi.mock('@/server/actions/dms/ocr',()=>({triggerDmsOcrForFile:mocks.ocr}));
vi.mock('@/features/dms/documents/sections/dms-link-version-dialog',()=>({DmsLinkVersionDialog:()=>null}));
const file={id:10,document_id:1,version_id:2,file_name:'Synthetic file.pdf',mime_type:'application/pdf',file_size_bytes:100,file_role:'primary',integrity_status:'pending',ocr_status:'not_started',created_at:'2026-09-30T12:00:00Z'};
const clients:QueryClient[]=[];
function mount(children:ReactNode){const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});clients.push(client);return render(<FluentProvider theme={webLightTheme}><QueryClientProvider client={client}>{children}</QueryClientProvider></FluentProvider>);}
beforeEach(()=>{vi.clearAllMocks();mocks.files.mockResolvedValue({success:true,data:[file]});mocks.preview.mockResolvedValue({success:true,data:{signedUrl:'/synthetic-preview'}});mocks.versions.mockResolvedValue({success:true,data:[{id:2,version_number:1,is_current:true,created_at:file.created_at}]});});
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());});
it('preview can close and reopen; missing download capability hides both table and panel buttons',async()=>{
 mount(<DmsDocumentFilesSection documentId={1} canPreview canDownload={false}/>);await screen.findByTitle('Synthetic file.pdf');expect(screen.queryByRole('button',{name:'Download',exact:true})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Close preview'}));await waitFor(()=>expect(screen.queryByTitle('Synthetic file.pdf')).toBeNull());fireEvent.click(screen.getByRole('button',{name:'Preview',exact:true}));await screen.findByTitle('Synthetic file.pdf');
});
it('default no-capability display does not request preview or expose file actions',async()=>{mount(<DmsDocumentFilesSection documentId={1}/>);await screen.findByText('Synthetic file.pdf');expect(mocks.preview).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'Download',exact:true})).toBeNull();expect(screen.queryByRole('button',{name:'Preview',exact:true})).toBeNull();});
it('failed file reads are retryable errors, not no-files states',async()=>{mocks.files.mockResolvedValueOnce({success:false,error:'private backend detail'});mount(<DmsDocumentFilesSection documentId={1}/>);await screen.findByText('Could not load document files.');expect(screen.queryByText('No files attached')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Retry'}));await screen.findByText('Synthetic file.pdf');expect(screen.queryByText('private backend detail')).toBeNull();});
it('preview denial does not suggest an unauthorized download',async()=>{mocks.preview.mockResolvedValue({success:false,error:'restricted'});mount(<DmsDocumentFilesSection documentId={1} canPreview/>);await screen.findByText(/Preview could not be loaded/);expect(screen.queryByRole('button',{name:/Download/})).toBeNull();});
it('file columns and filters apply to related records without fetching additional data',async()=>{mount(<DmsDocumentFilesSection documentId={1}/>);await screen.findByText('Synthetic file.pdf');fireEvent.click(screen.getByRole('button',{name:'Edit filters'}));fireEvent.change(screen.getByLabelText('File'),{target:{value:'absent'}});fireEvent.click(screen.getByRole('button',{name:'Apply'}));expect(screen.getByText('No loaded records match your filters.')).toBeTruthy();expect(mocks.files).toHaveBeenCalledOnce();});
it('versions respect separate preview and download capabilities',async()=>{mount(<DmsDocumentVersionsSection documentId={1} canUpload={false} canPreview canDownload={false}/>);await screen.findByText('Synthetic file.pdf');expect(screen.getByRole('button',{name:'Preview'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Download'})).toBeNull();expect(screen.queryByRole('button',{name:'Link New Version'})).toBeNull();});
it('version file read failure cannot claim that a version has no files',async()=>{mocks.files.mockRejectedValue(new Error('private'));mount(<DmsDocumentVersionsSection documentId={1}/>);await screen.findByText('Could not load document versions and files.');expect(screen.queryByText('No files in this version')).toBeNull();});
