import {expect,it} from 'vitest';
import {batchManifestSchema,canonicalBatchManifest,batchFingerprint,verifyBatchReceipt,type BatchManifest} from '@/lib/dms/batch-admission';
import {createHash} from 'node:crypto';
const hash='a'.repeat(64),operation='d7000000-0000-4000-8000-000000000001',authUserId='a7000000-0000-4000-8000-000000000001';
const file={position:0,original_filename:'synthetic.pdf',mime_type:'application/pdf',file_size_bytes:40,sha256_hash:hash};
it.each(['employee','employee_dependent','company','branch','party','site'] as const)('binds %s to distinct canonical bytes and receipt without changing the v1 protocol',async type=>{
 const manifest:BatchManifest={version:1,context:{type,id:7001},files:[file]};
 const literal='["dms-batch-admission/v1",["'+type+'",7001],[[0,"synthetic.pdf","application/pdf",40,"'+hash+'"]]]';
 expect(canonicalBatchManifest(manifest)).toBe(literal);expect(await batchFingerprint(manifest)).toBe(createHash('sha256').update(literal).digest('hex'));
 const receipt={version:1,operation_id:operation,auth_user_id:authUserId,profile_id:7001,fingerprint:await batchFingerprint(manifest),manifest,batch_id:7010,batch_code:'B'+'A'.repeat(32),company_id:7001,branch_id:null,
  members:[{position:0,id:7010,code:'A'.repeat(32),bucket:'dms-temp',path:'sessions/'+'A'.repeat(32)+'/synthetic.pdf',name:'synthetic.pdf',mime:'application/pdf',size:40,sha256:hash}]};
 const request={manifest,contract:{operationId:operation,revision:null}};
 expect(await verifyBatchReceipt(receipt,request,{authUserId,profileId:7001})).toEqual(receipt);
 expect(await verifyBatchReceipt({...receipt,manifest:{...manifest,context:{type:'party',id:7999}}},request,{authUserId,profileId:7001})).toBeNull();
});
it.each(['vehicle','__proto__','constructor','unknown'])('unsupported %s context is rejected rather than discarded',type=>{expect(batchManifestSchema.safeParse({version:1,context:{type,id:7001},files:[file]}).success).toBe(false);});
it('context type changes cannot borrow another context fingerprint',async()=>{const a:BatchManifest={version:1,context:{type:'employee',id:7001},files:[file]},b:BatchManifest={...a,context:{type:'employee_dependent',id:7001}};expect(await batchFingerprint(a)).not.toBe(await batchFingerprint(b));});
