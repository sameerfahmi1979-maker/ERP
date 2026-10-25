// Actual private Data/Storage APIs, synthetic identity adapter. No browser.
import {beforeAll,expect,it,vi} from 'vitest';import {createClient,type SupabaseClient} from '@supabase/supabase-js';import sharp from 'sharp';import {createHash,randomUUID} from 'node:crypto';import {NextRequest} from 'next/server';
import {syntheticAuthContext} from '../../performance/fixtures/auth-context';
const s=vi.hoisted(()=>({user:null as unknown as SupabaseClient,admin:null as unknown as SupabaseClient,ctx:null as unknown as ReturnType<typeof syntheticAuthContext>,lost:false,lastFailure:'',dropRpc:''}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>s.user}));vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>s.admin}));vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/rbac/check',async original=>({...await original<typeof import('@/lib/rbac/check')>(),getAuthContext:async()=>s.ctx}));
import {loadPhotoSource,currentPhotoState} from '@/server/hr-photo-source';import {GET} from '@/app/api/hr/subject-photo/route';
import {admitSingleUpload,acknowledgeSingleUpload} from '@/server/dms-single-upload-admission';import {createNumberedDocumentFromUpload} from '@/server/numbered-upload-create';import {runPhotoUpload,photoUploadStateSchema} from '@/lib/hr/photo-upload-workflow';
import {verifyTemporaryUpload} from '@/server/dms-temp-upload-verification';
import {attachVerifiedDocumentVersion} from '@/server/dms-version-attachment';
import {prepareExactIntakeReview,confirmExactIntakeReview} from '@/server/actions/dms/intake-review';
import {readPhotoRequiredDetails,completePhotoRequiredDetails} from '@/server/actions/hr/photo-controls';
import {readPhotoRecovery,retainPhotoRecovery,saveWithPhotoRecovery,resumePhotoSave,finishPhotoRecovery} from '@/server/actions/hr/photo-recovery';
let ids:{employee:number;dependent:number;document:number;file:number;version:number;profile:number;type:number;company:number;claims:{sub:string;session_id:string}},png:Buffer;
const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
let uploaded:ReturnType<typeof photoUploadStateSchema.parse>;
beforeAll(async()=>{
 expect(process.env.PHOTO_NATIVE).toBe('owned-local-only');const url=process.env.PHOTO_URL!,u=new URL(url);expect(u.protocol).toBe('http:');expect(u.hostname).toBe('127.0.0.1');ids=JSON.parse(process.env.PHOTO_FIXTURE!);
 const make=(token:string,inject=false)=>createClient(url,token,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token},fetch:async(input,init)=>{const r=await fetch(input,init);if(!r.ok){const e=await r.clone().json().catch(()=>({message:'Unparsed failure'}));s.lastFailure=JSON.stringify({status:r.status,code:e.code,message:e.message,error:e.error});}if(inject&&s.dropRpc&&String(input).endsWith('/rpc/'+s.dropRpc)&&r.ok){s.dropRpc='';await r.arrayBuffer();throw Error('Synthetic committed response loss');}if(inject&&s.lost&&String(input).endsWith('/rpc/finish_numbered_dms_upload')&&r.ok){s.lost=false;await r.arrayBuffer();throw Error('Synthetic loss after committed file completion');}return r;}}});
 s.user=make(process.env.PHOTO_USER_TOKEN!,true);s.admin=make(process.env.PHOTO_SERVICE_TOKEN!);
 vi.spyOn(s.user.auth,'getClaims').mockResolvedValue({data:{claims:ids.claims},error:null} as never);
 s.ctx=syntheticAuthContext(['hr.employees.create','hr.employees.view','hr.employees.update','hr.compliance.view','hr.compliance.manage','dms.documents.view','dms.documents.edit','dms.documents.preview','dms.documents.download','dms.documents.upload','dms.documents.create'],{id:ids.profile,auth_user_id:ids.claims.sub,owner_company_id:ids.company});
 const assignment=await s.admin.from('user_roles').select('role_id').eq('user_profile_id',ids.profile).eq('owner_company_id',ids.company).single();expect(assignment.error).toBeNull();
 s.ctx.globalPermissionCodes=[];s.ctx.roleAssignments=[{roleId:assignment.data!.role_id,roleCode:'synthetic-company-scoped',ownerCompanyId:ids.company,branchId:null,permissionCodes:s.ctx.permissionCodes}];
 for(const b of ['dms-documents','dms-temp'])expect((await s.admin.storage.createBucket(b,{public:false})).error).toBeNull();
 png=await sharp({create:{width:120,height:140,channels:3,background:{r:20,g:80,b:160}}}).png().toBuffer();expect((await s.admin.storage.from('dms-documents').upload('photo-test/original.png',png,{contentType:'image/png'})).error).toBeNull();
});
it('exact private photo source decodes and attests actual bytes through real APIs',async()=>{const r=await loadPhotoSource(ids.employee,null,ids.document);expect(r.bytes).toEqual(png);expect(r.source).toEqual({documentId:ids.document,versionId:ids.version,fileId:ids.file,sha256:digest(png),width:120,height:140});});
it('parent photo cannot be selected for a dependent without an exact link',async()=>{await expect(loadPhotoSource(ids.employee,ids.dependent,ids.document)).rejects.toThrow('linked to this person');});
it('framing save uses native revision control; private preview and both downloads remain distinct',async()=>{
 const source=(await loadPhotoSource(ids.employee,null,ids.document)).source,frame={version:1,source,rotation:180,crop:{x:0,y:0,width:100,height:100}};
 const save=await s.user.rpc('save_workspace_record',{p_entity:'employees',p_operation:randomUUID(),p_id:ids.employee,p_revision:1,p_data:{photo_dms_document_id:ids.document,photo_framing:frame}});
 expect(save.error).toBeNull();expect((await currentPhotoState(ids.employee,null)).state.framing).toEqual(frame);
 for(const mode of ['preview','download','original']){const r=await GET(new NextRequest('http://127.0.0.1/api/hr/subject-photo?employee='+ids.employee+'&mode='+mode));expect(r.status,await r.clone().text().then(t=>t.slice(0,160))).toBe(200);expect(r.headers.get('cache-control')).toContain('no-store');expect(r.headers.get('content-disposition')).toContain(mode==='preview'?'inline':'attachment');const b=Buffer.from(await r.arrayBuffer());if(mode==='original')expect(b).toEqual(png);else{expect((await sharp(b).metadata()).format).toBe('jpeg');expect(digest(b)).not.toBe(digest(png));}}
 expect(Buffer.from(await (await s.admin.storage.from('dms-documents').download('photo-test/original.png')).data!.arrayBuffer())).toEqual(png);
});
it('new photo upload, scoped allocation and response-loss retry retain one document and exact person link',async()=>{
 const bytes=await sharp({create:{width:120,height:140,channels:3,background:{r:160,g:30,b:80}}}).png().toBuffer(),hash=digest(bytes);
 let journal=photoUploadStateSchema.parse({request:{version:1,operationId:randomUUID(),authUserId:ids.claims.sub,metadata:{original_filename:'new-photo.png',mime_type:'image/png',file_size_bytes:bytes.length,sha256_hash:hash},context:{entityType:'employee_dependent',entityId:ids.dependent}},typeId:ids.type,title:'Synthetic dependent photo',expiry:null,creation:null,receipt:null,framing:null});
 const ports={current:()=>true,persist:(v:typeof journal)=>{journal=v;},admit:(r:typeof journal.request)=>admitSingleUpload({...r.metadata,context:r.context??undefined},{operationId:r.operationId,authUserId:r.authUserId}),acknowledge:acknowledgeSingleUpload,create:createNumberedDocumentFromUpload,upload:async(path:string,token:string,mime:string)=>{expect((await s.user.storage.from('dms-temp').uploadToSignedUrl(path,token,new Blob([bytes],{type:mime}),{contentType:mime,upsert:false})).error).toBeNull();}};
 const verifiedPorts={...ports,verify:verifyTemporaryUpload};
 s.lost=true;let failure='';try{await runPhotoUpload(journal,verifiedPorts);}catch(e){failure=String(e);}expect(journal.creation?.input.prepared,failure+' '+s.lastFailure).toBeTruthy();expect(failure).toContain('retained');
 const r=await runPhotoUpload(journal,verifiedPorts).catch(e=>{throw Error(String(e)+' '+s.lastFailure);});expect(r.completed).toBe(true);expect(r.replayed).toBe(true);expect(s.lost).toBe(false);expect((await runPhotoUpload(journal,verifiedPorts)).documentId).toBe(r.documentId);
 const photo=await loadPhotoSource(ids.employee,ids.dependent,r.documentId);expect(photo.source.sha256).toBe(hash);expect(photo.bytes).toEqual(bytes);
 const frame={version:1,source:photo.source,rotation:0,crop:{x:0,y:0,width:100,height:100}};
 uploaded=photoUploadStateSchema.parse({...journal,framing:frame});
 const save=await s.user.rpc('f11_save_dependent',{p_operation:randomUUID(),p_employee:ids.employee,p_id:ids.dependent,p_revision:1,p_kind:'save',p_data:{photo_dms_document_id:r.documentId,photo_framing:frame},p_add:[],p_remove:[]});expect(save.error).toBeNull();
 expect((await currentPhotoState(ids.employee,ids.dependent)).state.documentId).toBe(r.documentId);
});
it('mismatched content hash fails closed instead of delivering substituted original bytes',async()=>{expect((await s.admin.storage.from('dms-documents').update('photo-test/original.png',Buffer.from('tampered'),{contentType:'image/png'})).error).toBeNull();await expect(loadPhotoSource(ids.employee,null,ids.document)).rejects.toThrow();expect((await GET(new NextRequest('http://127.0.0.1/api/hr/subject-photo?employee='+ids.employee))).status).toBe(409);});
it('replacement-version proof retains verified integrity and old framing cannot follow a new source',async()=>{
 const bytes=await sharp({create:{width:120,height:140,channels:3,background:{r:30,g:160,b:80}}}).png().toBuffer(),request={version:1 as const,operationId:randomUUID(),authUserId:ids.claims.sub,metadata:{original_filename:'replacement.png',mime_type:'image/png',file_size_bytes:bytes.length,sha256_hash:digest(bytes)},context:{entityType:'employee' as const,entityId:ids.employee}};
 const a=await admitSingleUpload({...request.metadata,context:request.context},{operationId:request.operationId,authUserId:request.authUserId});expect(a.success,a.error).toBe(true);if(!a.data)throw Error('No admission');expect((await s.user.storage.from('dms-temp').uploadToSignedUrl(a.data.path,a.data.token,new Blob([bytes],{type:'image/png'}),{contentType:'image/png',upsert:false})).error).toBeNull();expect((await verifyTemporaryUpload(a.data.session.id)).success).toBe(true);expect((await acknowledgeSingleUpload(request,a.data.session.id)).success).toBe(true);
 const args={uploadSessionId:a.data.session.id,documentId:ids.document,changeNotes:'Synthetic version test'};
 // A synthetic manually reviewed intake; no AI/provider activation. The
 // fixture has a company-scoped DMS administrator solely for this review.
 expect((await s.admin.from('dms_upload_sessions').update({intake_status:'review_pending'}).eq('id',a.data.session.id)).error).toBeNull();
 const review=await prepareExactIntakeReview({sessionId:a.data.session.id,documentId:ids.document,expiryDate:null});expect(review.success,JSON.stringify(review)+' '+s.lastFailure).toBe(true);if(!review.success)throw Error('Review failed');
 expect((await confirmExactIntakeReview({...review.data,confirmed:true,override:true,reasonText:'Synthetic isolated manually reviewed image replacement.'})).success).toBe(true);
 const denied=await s.user.rpc('f07_finish_attachment',{p_session:a.data.session.id,p_document:ids.document,p_notes:args.changeNotes,p_label:null});expect(denied.error).not.toBeNull();
 const attached=await attachVerifiedDocumentVersion(args);expect(attached.success,JSON.stringify({error:attached.error,native:s.lastFailure})).toBe(true);expect((await attachVerifiedDocumentVersion(args)).data?.versionId).toBe(attached.data?.versionId);
 expect((await loadPhotoSource(ids.employee,null,ids.document)).source.versionId).toBe(attached.data?.versionId);const response=await GET(new NextRequest('http://127.0.0.1/api/hr/subject-photo?employee='+ids.employee));expect(response.status).toBe(409);expect(await response.text()).toContain('source photo changed');
});
it('configured required photo details are completed in-form through native reviewed metadata and exact replay',async()=>{
 const document=(await currentPhotoState(ids.employee,ids.dependent)).state.documentId!;
 const definition=await s.admin.from('dms_metadata_definitions').insert({document_type_id:ids.type,field_code:'SYN_PHOTO_DETAIL',field_label_en:'Synthetic required photo detail',field_type:'text',is_required:true,is_active:true}).select('id').single();expect(definition.error).toBeNull();
 const target={employee:ids.employee,dependent:ids.dependent,document,type:ids.type},read=await readPhotoRequiredDetails(target);expect(read.success,JSON.stringify(read)+' '+s.lastFailure).toBe(true);if(!read.success)throw Error('Details unavailable');
 expect(read.details.definitions.some(d=>d.id===definition.data!.id&&d.is_required)).toBe(true);
 expect((await completePhotoRequiredDetails(target,{requestId:randomUUID(),snapshot:read.details.snapshot,values:[]})).success).toBe(false);
 const request={requestId:randomUUID(),snapshot:read.details.snapshot,values:[{definition_id:definition.data!.id,value_text:'Synthetic approved photo description'}]};
 const saved=await completePhotoRequiredDetails(target,request);expect(saved.success,JSON.stringify(saved)+' '+s.lastFailure).toBe(true);expect((await completePhotoRequiredDetails(target,request)).success).toBe(true);
});
it('durable photo journal survives a new caller and rejects stale or changed upload identities',async()=>{
 const scope=`dependent:${ids.employee}:${ids.dependent}`,operation=randomUUID(),a={scope,operation,revision:null};
 const held=await retainPhotoRecovery(a,{state:uploaded,save:null});expect(held.success,JSON.stringify(held)+' '+s.lastFailure).toBe(true);if(!held.success)throw Error('No journal');
 const stale=await retainPhotoRecovery({...a,revision:held.record.revision-1},{state:{...uploaded,title:'Changed request'},save:null});expect(stale.success).toBe(false);
 const changed=await retainPhotoRecovery({...a,revision:held.record.revision},{state:{...uploaded,request:{...uploaded.request,operationId:randomUUID()}},save:null});expect(changed.success).toBe(false);
 // The response is discovered by scope; no local request/operation is supplied.
 const recovered=await readPhotoRecovery(scope);expect(recovered.success,JSON.stringify(recovered)+' '+s.lastFailure).toBe(true);if(!recovered.success)throw Error('No recovery');expect(recovered.record?.state.request.operationId).toBe(uploaded.request.operationId);expect(recovered.record?.complete).toBe(true);
 expect((await finishPhotoRecovery({...a,revision:held.record.revision})).success).toBe(true);
});
it('durable new-dependent create recovers the original committed person after response loss',async()=>{
 const relationship=await s.user.from('employee_dependents').select('relationship_type_id').eq('id',ids.dependent).single();expect(relationship.error).toBeNull();
 const scope=`dependent:${ids.employee}:new`,operation=randomUUID(),state=photoUploadStateSchema.parse({...uploaded,request:{...uploaded.request,operationId:randomUUID(),context:null},creation:null,receipt:null,metadata:null,metadataDone:false});
 const request={kind:'dependent' as const,input:{employeeId:ids.employee,id:null,kind:'save' as const,revision:null,values:{dependent_name_en:'Synthetic durable photo dependent',relationship_type_id:relationship.data!.relationship_type_id},addDocumentIds:[],removeDocumentIds:[]},contract:{operationId:randomUUID(),revision:null,addDocumentIds:[],removeDocumentIds:[]}};
 s.dropRpc='f11_save_dependent';const first=await saveWithPhotoRecovery({scope,operation,revision:null},{state,save:request});
 expect(first.result.success).toBe(false);expect(first.record?.dependent,JSON.stringify(first)+' '+s.lastFailure).toBeTypeOf('number');
 const restored=await resumePhotoSave(scope);expect(restored.success,JSON.stringify(restored)+' '+s.lastFailure).toBe(true);if(!restored.success)throw Error('Recovery failed');expect(restored.record?.dependent).toBe(first.record!.dependent);expect(restored.record?.savePending).toBe(false);
 const reopened=await readPhotoRecovery(`dependent:${ids.employee}:${restored.record!.dependent}`);expect(reopened.success).toBe(true);if(reopened.success)expect(reopened.record?.operation).toBe(operation);
 const count=await s.user.from('employee_dependents').select('id',{count:'exact'}).eq('employee_id',ids.employee).eq('dependent_name_en','Synthetic durable photo dependent');expect(count.count).toBe(1);
 const moved=await retainPhotoRecovery({scope:`dependent:${ids.employee}:${ids.dependent}`,operation,revision:restored.record!.revision},{state,save:null});expect(moved.success).toBe(false);
});
it('durable journal does not permit direct-table access or a service-role shortcut',async()=>{
 const direct=await s.user.schema('erp_private').from('hr_photo_recovery').select('*');expect(direct.error).not.toBeNull();
 const elevated=await s.admin.rpc('hr_photo_recovery',{p_mode:'read',p_scope:`dependent:${ids.employee}:new`});expect(elevated.error).not.toBeNull();
});
it('a rejected save can be corrected without allowing a delayed retired operation to create a duplicate',async()=>{
 const scope=`dependent:${ids.employee}:new`,held=await s.user.rpc('hr_photo_recovery',{p_mode:'read',p_scope:scope});expect(held.error).toBeNull();
 const r=held.data,save={kind:'dependent',input:{employeeId:ids.employee,id:r.dependent,kind:'save',revision:'1',values:{dependent_name_en:'Synthetic corrected name'},addDocumentIds:[],removeDocumentIds:[]},contract:{operationId:randomUUID(),revision:'1',addDocumentIds:[],removeDocumentIds:[]}};
 const pending=await s.user.rpc('hr_photo_recovery',{p_mode:'write',p_scope:scope,p_operation:r.operation,p_expected:r.revision,p_payload:{state:r.state,save}});expect(pending.error,JSON.stringify(pending.error)).toBeNull();
 const rejected=await s.user.rpc('hr_photo_recovery',{p_mode:'reject',p_scope:scope,p_operation:r.operation});expect(rejected.error).toBeNull();expect(rejected.data.save).toBeNull();
 const delayed=await s.user.rpc('f11_save_dependent',{p_operation:save.contract.operationId,p_employee:ids.employee,p_id:r.dependent,p_revision:1,p_kind:'save',p_data:save.input.values,p_add:[],p_remove:[]});expect(delayed.error?.code).toBe('42501');
 const replacement={...save,contract:{...save.contract,operationId:randomUUID()}};
 const corrected=await saveWithPhotoRecovery({scope,operation:r.operation,revision:rejected.data.revision},{state:r.state,save:replacement});expect(corrected.result.success,JSON.stringify(corrected)+' '+s.lastFailure).toBe(true);expect(corrected.record?.dependent).toBe(r.dependent);
});
it('new employee and actual photo survive lost final assignment with one person and one document',async()=>{
 const category=await s.user.from('employees').select('employee_category_id').eq('id',ids.employee).single();expect(category.error).toBeNull();
 const bytes=await sharp({create:{width:120,height:140,channels:3,background:{r:10,g:20,b:30}}}).png().toBuffer();
 let state=photoUploadStateSchema.parse({...uploaded,request:{...uploaded.request,operationId:randomUUID(),context:null,metadata:{original_filename:'employee-portrait.png',mime_type:'image/png',file_size_bytes:bytes.length,sha256_hash:digest(bytes)}},creation:null,receipt:null,metadata:null,metadataDone:false,framing:{...uploaded.framing!,source:{...uploaded.framing!.source,sha256:digest(bytes)}}});
 const scope='employee:new',operation=randomUUID(),input={full_name_en:'Synthetic durable employee',gender:'male',date_of_birth:'1990-01-01',mobile_number:'000',owner_company_id:ids.company,employee_category_id:category.data!.employee_category_id,joining_date:'2020-01-01',emergency_contact_name:'Synthetic',emergency_contact_mobile:'000'};
 const created=await saveWithPhotoRecovery({scope,operation,revision:null,company:ids.company,branch:null},{state,save:{kind:'employee-create',input,contract:{operationId:randomUUID(),revision:null}}});expect(created.result.success,JSON.stringify(created)+' '+s.lastFailure).toBe(true);let record=created.record!;expect(record.employee).toBeTypeOf('number');
 state={...state,request:{...state.request,context:{entityType:'employee',entityId:record.employee!}}};
 const persist=async(next:typeof state)=>{const r=await retainPhotoRecovery({scope,operation,revision:record.revision},{state:next,save:null});expect(r.success,JSON.stringify(r)+' '+s.lastFailure).toBe(true);if(!r.success)throw Error('Progress failure');record=r.record;state=next;};await persist(state);
 const receipt=await runPhotoUpload(state,{current:()=>true,persist,admit:r=>admitSingleUpload({...r.metadata,context:r.context??undefined},{operationId:r.operationId,authUserId:r.authUserId}),verify:verifyTemporaryUpload,acknowledge:acknowledgeSingleUpload,create:createNumberedDocumentFromUpload,upload:async(path,token,mime)=>{expect((await s.user.storage.from('dms-temp').uploadToSignedUrl(path,token,new Blob([bytes],{type:mime}),{contentType:mime,upsert:false})).error).toBeNull();}});
 const missingFrame={...state.framing!,source:(await loadPhotoSource(record.employee!,null,receipt.documentId)).source};
 const bypass=await s.user.rpc('save_workspace_record',{p_entity:'employees',p_operation:randomUUID(),p_id:record.employee,p_revision:record.personRevision,p_data:{photo_dms_document_id:receipt.documentId,photo_framing:missingFrame}});expect(bypass.error?.code).toBe('22023');expect(bypass.error?.message).toContain('Required metadata');
 const target={employee:record.employee!,dependent:null,document:receipt.documentId,type:ids.type},details=await readPhotoRequiredDetails(target);expect(details.success).toBe(true);if(!details.success)throw Error('Metadata missing');
 const metadata={requestId:randomUUID(),snapshot:details.details.snapshot,values:details.details.definitions.filter(d=>d.is_required).map(d=>({definition_id:d.id,value_text:'Synthetic required detail'}))};await persist({...state,metadata});expect((await completePhotoRequiredDetails(target,metadata)).success).toBe(true);await persist({...state,metadataDone:true});
 const source=(await loadPhotoSource(record.employee!,null,receipt.documentId)).source,frame={...state.framing!,source};
 s.dropRpc='save_workspace_record';const saved=await saveWithPhotoRecovery({scope,operation,revision:record.revision},{state,save:{kind:'employee-update',id:record.employee!,input:{photo_dms_document_id:receipt.documentId,photo_framing:frame},contract:{operationId:randomUUID(),revision:record.personRevision}}});expect(saved.result.success).toBe(false);expect(s.dropRpc,JSON.stringify(saved)+' '+s.lastFailure).toBe('');
 const restored=await readPhotoRecovery('employee:'+record.employee);expect(restored.success,JSON.stringify(restored)+' '+s.lastFailure).toBe(true);if(!restored.success)throw Error('No recovery');expect(restored.record?.complete).toBe(true);expect(restored.record?.state.receipt?.documentId).toBe(receipt.documentId);
 expect((await s.user.from('employees').select('id',{count:'exact'}).eq('full_name_en',input.full_name_en)).count).toBe(1);expect((await currentPhotoState(record.employee!,null)).state.framing).toEqual(frame);
},30000);
it('scope revocation hides retained photo recovery until current authority is restored',async()=>{
 const roles=await s.admin.from('user_roles').select('id').eq('user_profile_id',ids.profile).eq('owner_company_id',ids.company).eq('is_active',true);expect(roles.error).toBeNull();expect(roles.data!.length).toBeGreaterThan(0);const roleIds=roles.data!.map(x=>x.id);
 try{expect((await s.admin.from('user_roles').update({is_active:false}).in('id',roleIds)).error).toBeNull();expect((await readPhotoRecovery(`dependent:${ids.employee}:new`)).success).toBe(false);}
 finally{expect((await s.admin.from('user_roles').update({is_active:true}).in('id',roleIds)).error).toBeNull();}
 expect((await readPhotoRecovery(`dependent:${ids.employee}:new`)).success).toBe(true);
});
it('another currently authorized company actor cannot discover or resume the first actor’s journal',async()=>{
 const scope=`dependent:${ids.employee}:new`,owned=await s.user.rpc('hr_photo_recovery',{p_mode:'read',p_scope:scope});expect(owned.error).toBeNull();expect(owned.data.operation).toBeTruthy();
 const token=process.env.PHOTO_OTHER_TOKEN!,other=createClient(process.env.PHOTO_URL!,token,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:'Bearer '+token}}});
 expect((await other.rpc('f12_subject_photo',{p_employee:ids.employee,p_dependent:ids.dependent})).error).toBeNull();
 for(const operation of [null,owned.data.operation]){const r=await other.rpc('hr_photo_recovery',{p_mode:'read',p_scope:scope,p_operation:operation});expect(r.error).toBeNull();expect(r.data).toBeNull();}
});
it('two concurrent recovery writes admit one unchanged save identity and reject the stale competitor',async()=>{
 const scope=`dependent:${ids.employee}:new`,r=await s.user.rpc('hr_photo_recovery',{p_mode:'read',p_scope:scope});expect(r.error).toBeNull();const current=r.data;
 const writes=await Promise.all(['A','B'].map(async suffix=>{const result=await s.user.rpc('hr_photo_recovery',{p_mode:'write',p_scope:scope,p_operation:current.operation,p_expected:current.revision,p_payload:{state:current.state,save:{kind:'dependent',input:{employeeId:ids.employee,id:current.dependent,kind:'save',revision:current.personRevision,values:{notes:'Synthetic race '+suffix},addDocumentIds:[],removeDocumentIds:[]},contract:{operationId:randomUUID(),revision:current.personRevision,addDocumentIds:[],removeDocumentIds:[]}}}});return result;}));
 expect(writes.filter(x=>x.error===null)).toHaveLength(1);expect(writes.find(x=>x.error)?.error?.code).toBe('PT409');
 expect((await s.user.rpc('hr_photo_recovery',{p_mode:'reject',p_scope:scope,p_operation:current.operation})).error).toBeNull();
});
