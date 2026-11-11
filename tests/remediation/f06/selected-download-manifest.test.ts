import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({client:vi.fn(),auth:vi.fn(),permission:vi.fn(),access:vi.fn(),docs:[] as unknown[],files:[] as unknown[],calls:[] as unknown[]}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.client}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.auth,hasPermission:m.permission}));
vi.mock('@/lib/dms/document-access',()=>({checkDocumentConfidentialityAccess:m.access}));
import {getSelectedDmsDownloadFiles} from '@/server/actions/dms/selected-download';
beforeEach(()=>{vi.clearAllMocks();m.calls=[];m.docs=[{id:1,document_no:'DMS-1',current_version_id:7}];m.files=[{id:9,file_name:'original.pdf',file_size_bytes:3}];m.auth.mockResolvedValue({profile:{id:5,must_change_password:false},isAccountActive:true});m.permission.mockReturnValue(true);m.access.mockResolvedValue({allowed:true});
 m.client.mockResolvedValue({from:(table:string)=>{const q:any={select:()=>q,in:(...x:unknown[])=>{m.calls.push(['in',...x]);return q},is:(...x:unknown[])=>{m.calls.push(['is',...x]);return q},eq:(...x:unknown[])=>{m.calls.push(['eq',...x]);return q},order:()=>q,limit:async()=>({data:m.files,error:null}),then:(resolve:Function)=>Promise.resolve({data:m.docs,error:null}).then(resolve as never)};expect(['dms_documents','dms_document_files']).toContain(table);return q}});
});
it('returns current-version original/attachment IDs without Storage locations',async()=>{
 expect(await getSelectedDmsDownloadFiles([1])).toEqual({success:true,files:[{id:9,name:'original.pdf',size:3,folder:'DMS-1'}]});
 expect(m.calls).toContainEqual(['eq','version_id',7]);expect(m.calls).toContainEqual(['in','file_role',['original','attachment']]);expect(m.access).toHaveBeenCalledWith(expect.anything(),1,expect.anything(),'dms.documents.download');
});
it('denies inaccessible documents rather than silently skipping selected records',async()=>{m.docs=[];expect(await getSelectedDmsDownloadFiles([1])).toMatchObject({success:false});});
it('enforces confidentiality and download permission',async()=>{m.access.mockResolvedValue({allowed:false});expect(await getSelectedDmsDownloadFiles([1])).toMatchObject({success:false});m.permission.mockReturnValue(false);expect(await getSelectedDmsDownloadFiles([1])).toMatchObject({success:false});});
it('holds large selections without silently truncating them',async()=>{m.files=Array.from({length:51},(_,id)=>({id:id+1,file_name:'test',file_size_bytes:3}));expect(await getSelectedDmsDownloadFiles([1])).toMatchObject({success:false,error:expect.stringContaining('Select fewer')});});
it('rejects duplicate IDs and too many documents before reading',async()=>{expect(await getSelectedDmsDownloadFiles([1,1])).toMatchObject({success:false});expect(await getSelectedDmsDownloadFiles(Array.from({length:26},(_,i)=>i+1))).toMatchObject({success:false});expect(m.client).not.toHaveBeenCalled();});
