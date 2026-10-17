// @vitest-environment jsdom
import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({defaults:vi.fn(),batch:vi.fn(),auto:vi.fn(),origin:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:(path:string)=>{throw Error('Redirect '+path);}}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({profile:{id:7}}),hasPermission:()=>true}));
vi.mock('@/server/actions/dms/documents',()=>({getDmsNewDocumentDefaults:m.defaults,prepareDmsManualOrigin:m.origin}));
vi.mock('@/server/actions/dms/batch-intake',()=>({isDmsBatchIntakeEnabled:m.batch}));
vi.mock('@/server/actions/dms/ai-intake',()=>({isDmsAiAutoStartEnabled:m.auto}));
vi.mock('@/features/dms/upload/dms-upload-inbox-page-client',()=>({DmsUploadInboxPageClient:({entityContext}:{entityContext:unknown})=><div data-testid="subject">{JSON.stringify(entityContext)}</div>}));
vi.mock('@/features/dms/documents/dms-document-record-form',()=>({DmsDocumentRecordForm:({entityContext}:{entityContext:unknown})=><div data-testid="subject">{JSON.stringify(entityContext)}</div>}));
import InboxPage from '@/app/(protected)/dms/inbox/page';
import NewDocumentPage from '@/app/(protected)/dms/documents/record/new/page';
beforeEach(()=>{vi.resetAllMocks();m.defaults.mockResolvedValue({success:true,data:{documentTypes:[],categories:[]}});m.origin.mockResolvedValue({success:true,data:{company:7001,branch:null}});m.batch.mockResolvedValue(true);m.auto.mockResolvedValue(false);});afterEach(cleanup);
for(const [name,Page]of [['Inbox',InboxPage],['New document',NewDocumentPage]] as const){
 it.each(['employee','employee_dependent','company','branch','party','site'])(name+' reads the actual camel-case %s entry-point context',async entityType=>{render(await Page({searchParams:Promise.resolve({entityType,entityId:'7001'})}));expect(screen.getByTestId('subject').textContent).toBe(JSON.stringify({entityType,entityId:7001,...(name==='New document'&&entityType!=='party'?{scope:{company:7001,branch:null}}:{})}));});
 it(name+' rejects conflicting contexts before loading defaults or rendering a form',async()=>{render(await Page({searchParams:Promise.resolve({entity_type:'employee',entity_id:'7001',entityType:'branch',entityId:'7001'})}));expect(screen.getByRole('alert').textContent).toMatch(/conflicting/);expect(screen.queryByTestId('subject')).toBeNull();expect(m.defaults).not.toHaveBeenCalled();expect(m.batch).not.toHaveBeenCalled();expect(m.auto).not.toHaveBeenCalled();});
}
it('manual origin denial cannot turn into an unlinked new-document form',async()=>{m.origin.mockResolvedValue({success:false,error:'Original subject denied'});render(await NewDocumentPage({searchParams:Promise.resolve({entityType:'employee',entityId:'7001'})}));expect(screen.getByRole('alert').textContent).toContain('Original subject denied');expect(screen.queryByTestId('subject')).toBeNull();expect(m.defaults).not.toHaveBeenCalled();});
