import {beforeEach,expect,it,vi} from 'vitest';
import {isValidElement,type ReactNode} from 'react';
const m=vi.hoisted(()=>({find:vi.fn(),defaults:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({}),hasPermission:()=>true}));
vi.mock('@/server/actions/dms/documents',()=>({getDmsNewDocumentDefaults:m.defaults}));
vi.mock('@/server/actions/dms/batch-intake',()=>({findDmsBatchAdmission:m.find,isDmsBatchIntakeEnabled:async()=>true}));
vi.mock('@/server/actions/dms/ai-intake',()=>({isDmsAiAutoStartEnabled:async()=>false}));
vi.mock('@/features/dms/upload/dms-upload-inbox-page-client',()=>({DmsUploadInboxPageClient:()=>null}));
vi.mock('@/components/erp/page-header',()=>({ERPPageHeader:()=>null}));
import Page from '@/app/(protected)/dms/inbox/page';
import {DmsUploadInboxPageClient} from '@/features/dms/upload/dms-upload-inbox-page-client';
function clientProps(node:ReactNode):Record<string,unknown>|undefined{
 if(!isValidElement<Record<string,unknown>>(node))return;
 if(node.type===DmsUploadInboxPageClient)return node.props;
 const children=node.props.children;
 for(const child of Array.isArray(children)?children:[children]){const found=clientProps(child as ReactNode);if(found)return found;}
}
beforeEach(()=>{vi.resetAllMocks();m.defaults.mockResolvedValue({success:true,data:{documentTypes:[]}})});
it('uses the recovered original subject and receipt rather than starting an unlinked upload',async()=>{
 const receipt={batch_code:'BATCH1',manifest:{context:{type:'employee',id:9}}};m.find.mockResolvedValue({success:true,receipts:[receipt]});
 const node=await Page({searchParams:Promise.resolve({recoverBatch:'BATCH1'})});
 expect(clientProps(node)).toMatchObject({recoveryReceipt:receipt,entityContext:{entityType:'employee',entityId:9}});
});
it('inaccessible original never falls back to new-batch UI',async()=>{
 m.find.mockResolvedValue({success:false,error:'unavailable'});
 const node=await Page({searchParams:Promise.resolve({recoverBatch:'BATCH1'})});
 expect(clientProps(node)).toBeUndefined();expect(m.defaults).not.toHaveBeenCalled();
});
it('rejects conflicting subjects',async()=>{
 m.find.mockResolvedValue({success:true,receipts:[{manifest:{context:{type:'employee',id:9}}}]});
 const node=await Page({searchParams:Promise.resolve({recoverBatch:'BATCH1',entity_type:'company',entity_id:'2'})});
 expect(clientProps(node)).toBeUndefined();expect(m.defaults).not.toHaveBeenCalled();
});
it('rejects repeated recovery identifiers',async()=>{
 const node=await Page({searchParams:Promise.resolve({recoverBatch:['A','B']})});
 expect(clientProps(node)).toBeUndefined();expect(m.find).not.toHaveBeenCalled();expect(m.defaults).not.toHaveBeenCalled();
});
