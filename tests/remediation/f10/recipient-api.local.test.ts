/** Explicit opt-in real local PostgREST, never a browser/provider/live test. */
import {beforeAll,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';import fs from 'node:fs';
import {createClient} from '@supabase/supabase-js';
const s=vi.hoisted(()=>({client:null as ReturnType<typeof createClient>|null,ordinary:null as ReturnType<typeof createClient>|null}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>{if(!s.client)throw Error('Owned API not admitted');return s.client;}}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>{if(!s.ordinary)throw Error('Owned ordinary session not admitted');return s.ordinary;}}));
import {resolveNotificationRecipients,processNotificationEvents,type NotificationEvent} from '@/server/notification-events';
import {getAuthContextForProfileId} from '@/lib/rbac/check';
import {notificationDocumentSubjectsAllowed} from '@/server/notification-document-authority';
import {readNotifications,readUnreadNotificationCount} from '@/server/reads/notifications';
type Actor={profile:number;jwt:string};
let actors:Actor[],fetcher:typeof fetch,url:string,doc:number,company:number;
let native:{sql:(s:string)=>string};
beforeAll(async()=>{
 if(process.env.F10_OWNED_TEST_DB!=='algt_f10_candidate_20261018')throw Error('Exact owned DB opt-in required');
 const transport=await import(pathToFileURL('C:/dev/agt-erp-f10-lab-20261018/api-transport.mjs').href);
 const {intent,apiFetch}=transport;
 native=await import(pathToFileURL('C:/dev/agt-erp-f10-lab-20261018/native.mjs').href);
 url=intent.url;actors=intent.actors;fetcher=apiFetch;s.client=createClient(url,intent.service,{global:{fetch:apiFetch},auth:{persistSession:false,autoRefreshToken:false}});
 s.ordinary=createClient(url,actors[0].jwt,{global:{fetch:apiFetch},auth:{persistSession:false,autoRefreshToken:false}});
 const receipt=JSON.parse(fs.readFileSync('C:/dev/agt-erp-f10-lab-20261018/open-events-05.json','utf8'));
 expect(receipt.database).toBe('algt_f10_candidate_20261018');expect(receipt.state).toBe('PASS');doc=receipt.fixtures.doc;company=receipt.fixtures.company;
});
const event=():NotificationEvent=>({id:1,event_key:'SYNTHETIC_API_NOT_CAPTURED',source_table:'dms_document_events',source_id:1,event_type:'approval_rejected',actor_id:null,lease_token:'b23ec154-aa22-44cc-8fee-2b954e9bf007',source_snapshot:{document_id:doc}});
it('real shared authority resolver builds current scoped roles through isolated PostgREST',async()=>{
 const ctx=await getAuthContextForProfileId(actors[0].profile);expect(ctx.isAccountActive).toBe(true);expect(ctx.permissionCodes).toContain('dms.documents.view');expect(ctx.globalPermissionCodes).not.toContain('dms.documents.view');
});
it('all direct linked-subject evidence projections execute against the actual schema',async()=>{
 const ctx=await getAuthContextForProfileId(actors[0].profile);expect(await notificationDocumentSubjectsAllowed(ctx,doc)).toBe(true);
});
it('actual source and scoped recipient resolver deduplicates creator/owner without guessed recipients',async()=>{
 const considered=new Set<number>();expect(await resolveNotificationRecipients(event(),s.client!,considered)).toEqual([actors[0].profile]);expect([...considered]).toEqual([actors[0].profile]);
});
it('actual ordinary API session authorizes the canonical document independently of machine admission',async()=>{
 const r=await fetcher(url+'/rpc/f10_notification_target',{method:'POST',headers:{authorization:'Bearer '+actors[0].jwt,'content-type':'application/json'},body:JSON.stringify({source_type:'dms_documents',source_id:doc})});expect(r.status).toBe(200);expect(await r.json()).toBe('/dms/documents/record/'+doc);
});
it('actor exclusion is explicit and nonexistent document is an empty source, not a broadcast',async()=>{
 expect(await resolveNotificationRecipients({...event(),actor_id:actors[0].profile},s.client!)).toEqual([]);
 expect(await resolveNotificationRecipients({...event(),source_snapshot:{document_id:900000000000000}},s.client!)).toEqual([]);
});
it('committed future business event runs through actual API routing, frozen roster, audit and F09 queue without a provider',async()=>{
 const marker='F10_API_'+randomUUID();
 const source=Number(native.sql(`insert into public.dms_document_events(document_id,event_type,performed_by,metadata_json) values(${doc},'approval_rejected',${actors[1].profile},'{}') returning id`));
 const id=Number(native.sql(`select id from erp_private.notification_events where event_key='dms-approval-event:${source}'`));
 native.sql(`update erp_private.notification_events set next_attempt_at='1900-01-01' where id=${id}`);
 const path='C:/dev/agt-erp-f10-lab-20261018/'+marker+'.json';
 const tracked:{state:string;database:string;event:number;source:number;elapsedMs?:number;result?:unknown;cleanup:string}={state:'RUNNING',database:'algt_f10_candidate_20261018',event:id,source,cleanup:'RETAINED_TRACKED_SYNTHETIC_ONLY; NO_PROVIDER_ACTIVATED'};
 fs.writeFileSync(path,JSON.stringify(tracked,null,2),{flag:'wx'});
 try{
  const start=performance.now();const result=await processNotificationEvents(1);tracked.elapsedMs=performance.now()-start;tracked.result=result;
  expect(result.results).toEqual([{id,outcome:'complete'}]);
  expect(native.sql(`select count(*) from erp_private.notification_event_recipients where event_id=${id} and profile_id=${actors[0].profile} and state='created'`)).toBe('1');
  expect(native.sql(`select count(*) from erp_private.notification_resolution_decisions where event_id=${id} and eligible`)).toBe('1');
  expect(native.sql(`select count(*) from public.erp_email_queue q join erp_private.notification_event_recipients r on r.email_queue_id=q.id where r.event_id=${id} and q.status='pending' and q.sent_at is null`)).toBe('1');
  tracked.state='PASS';
 }finally{fs.writeFileSync(path,JSON.stringify(tracked,null,2));}
});
it('251 real personal API rows page completely; independent sessions and unread/read counts agree',async()=>{
 const marker='F10_PAGE_'+randomUUID().replaceAll('-','');
 const ctx=await getAuthContextForProfileId(actors[0].profile),other=await getAuthContextForProfileId(actors[1].profile);
 const baseline=await readUnreadNotificationCount(ctx);expect(baseline.success).toBe(true);
 const ids=native.sql(`insert into public.erp_notifications(notification_code,source_module,source_entity_type,source_entity_id,notification_type,title,message,recipient_user_id,channel_in_app,channel_email)
 select '${marker}_'||n,'DMS','dms_documents',${doc},'synthetic','${marker}','Synthetic only',${actors[0].profile},true,false from generate_series(1,251) n returning id`).split('\n').map(Number);
 const path='C:/dev/agt-erp-f10-lab-20261018/'+marker+'.json';fs.writeFileSync(path,JSON.stringify({state:'RUNNING',database:'algt_f10_candidate_20261018',marker,ids,production:false},null,2),{flag:'wx'});
 try{
  const pages=[];for(const page of [1,2,3]){const r=await readNotifications({page,pageSize:100,search:marker},ctx);expect(r.success).toBe(true);if(!r.success)throw Error('Page unconfirmed');expect(r.data.totalCount).toBe(251);pages.push(...r.data.rows);}
  expect(new Set(pages.map(r=>r.id)).size).toBe(251);expect(new Set(pages.map(r=>r.id))).toEqual(new Set(ids));
  const changed=await fetcher(url+'/rpc/f10_transition_my_notification',{method:'POST',headers:{authorization:'Bearer '+actors[0].jwt,'content-type':'application/json'},body:JSON.stringify({notification_id:ids[0],transition:'read'})});expect(changed.status).toBe(200);
  const count=await readUnreadNotificationCount(ctx);expect(count.success).toBe(true);if(baseline.success&&count.success)expect(count.data.count).toBe(baseline.data.count+250);
  const read=await readNotifications({pageSize:100,search:marker,status:'read'},ctx);expect(read.success).toBe(true);if(read.success)expect(read.data.rows.map(r=>r.id)).toEqual([ids[0]]);
  s.ordinary=createClient(url,actors[1].jwt,{global:{fetch:fetcher},auth:{persistSession:false,autoRefreshToken:false}});
  const denied=await readNotifications({pageSize:100,search:marker},other);expect(denied.success).toBe(true);if(denied.success)expect(denied.data.totalCount).toBe(0);
  fs.writeFileSync(path,JSON.stringify({state:'PASS',database:'algt_f10_candidate_20261018',marker,ids,production:false,checks:'THREE_ACTUAL_PAGES_TWO_NATIVE_SESSIONS_COUNTS_AND_PERSONAL_TRANSITION'},null,2));
 }finally{
  s.ordinary=createClient(url,actors[0].jwt,{global:{fetch:fetcher},auth:{persistSession:false,autoRefreshToken:false}});
  native.sql(`delete from public.erp_notifications where notification_code like '${marker}_%' and recipient_user_id=${actors[0].profile}`);
  const receipt=JSON.parse(fs.readFileSync(path,'utf8'));receipt.cleanup='EXACT_251_OWNED_SYNTHETIC_NOTIFICATIONS_REMOVED_NO_EXTERNAL_DELIVERY';fs.writeFileSync(path,JSON.stringify(receipt,null,2));
 }
});
it('all thirteen populated direct HR evidence links require their actual current scoped field permissions',async()=>{
 const marker=('F10_SUBJECT_'+randomUUID().replaceAll('-','')).toUpperCase();
 const path='C:/dev/agt-erp-f10-lab-20261018/'+marker+'.json';
 const tracked:{state:string;database:string;fixtures:Record<string,number>;checks:string[];cleanup?:string}={state:'RUNNING',database:'algt_f10_candidate_20261018',fixtures:{},checks:[]};
 const save=()=>fs.writeFileSync(path,JSON.stringify(tracked,null,2));save();
 const add=(name:string,statement:string)=>{const id=Number(native.sql(statement+' returning id'));tracked.fixtures[name]=id;save();return id;};
 const codes=['hr.employees.view','hr.compliance.view','hr.assignments.view','hr.actions.view','hr.confidential.view','hr.eos.view','hr.medical.view'];
 const role=add('role',`insert into public.roles(role_code,role_name,is_system_role) values('${marker}','Synthetic subject API',false)`);
 const employee=add('employee',`insert into public.employees(employee_code,full_name_en,gender,date_of_birth,mobile_number,owner_company_id,joining_date,emergency_contact_name,emergency_contact_mobile) values('${marker}','Synthetic only','male','1990-01-01','000',${company},'2020-01-01','Synthetic','000')`);
 const masters:Record<string,number>={};
 for(const table of ['hr_access_card_types','hr_identity_document_types','hr_medical_record_types','hr_training_types','hr_relationship_types'])masters[table]=add(table,`insert into public.${table}(code,name_en) values('${marker}','Synthetic only')`);
 native.sql(`insert into public.permissions(permission_code,permission_name,module_code,action_code) select c,'Synthetic subject check','HR','view' from unnest(array[${codes.map(c=>"'"+c+"'").join(',')}]) c on conflict(permission_code) do nothing;
 insert into public.role_permissions(role_id,permission_id) select ${role},id from public.permissions where permission_code=any(array[${codes.map(c=>"'"+c+"'").join(',')}]);
 insert into public.user_roles(user_profile_id,role_id,owner_company_id) values(${actors[0].profile},${role},${company});`);
 const groups:[string,string,string,string,string][]=[
  ['employee_access_cards','dms_document_id','access_type_id',String(masters.hr_access_card_types),'hr.compliance.view'],
  ['employee_assets','dms_document_id','asset_type,asset_description',"'other','Synthetic'",'hr.assignments.view'],
  ['employee_disciplinary_records','dms_document_id','disciplinary_type,subject',"'written_warning','Synthetic'",'hr.confidential.view'],
  ['employee_eos_cases','dms_document_id','eos_type',"'other'",'hr.eos.view'],
  ['employee_hr_actions','dms_document_id','action_type,action_title',"'general','Synthetic'",'hr.actions.view'],
  ['employee_identity_documents','dms_document_id','document_type_id,document_number',`${masters.hr_identity_document_types},'SYNTHETIC'`,'hr.compliance.view'],
  ['employee_medical_insurances','dms_document_id','insurance_provider,policy_number,expiry_date',"'Synthetic','SYNTHETIC','2099-01-01'",'hr.medical.view'],
  ['employee_medical_records','dms_document_id','medical_record_type_id,examination_date,result',`${masters.hr_medical_record_types},'2026-01-01','fit'`,'hr.medical.view'],
  ['employee_performance_records','dms_document_id','review_type',"'other'",'hr.confidential.view'],
  ['employee_ppe_issues','dms_document_id','ppe_item',"'Synthetic'",'hr.assignments.view'],
  ['employee_pro_processes','related_document_id','process_title',"'Synthetic'",'hr.actions.view'],
  ['employee_training_certificates','dms_document_id','training_type_id',String(masters.hr_training_types),'hr.compliance.view'],
  ['employee_dependents','dms_document_id','dependent_name_en,relationship_type_id',`'Synthetic',${masters.hr_relationship_types}`,'hr.compliance.view'],
 ];
 let current:{table:string;id:number}|null=null;
 try{
  for(const [table,column,fields,values,cap]of groups){
   const id=add(table,`insert into public.${table}(employee_id,${column},${fields}) values(${employee},${doc},${values})`);current={table,id};
   expect(await notificationDocumentSubjectsAllowed(await getAuthContextForProfileId(actors[0].profile),doc),table+' positive').toBe(true);
   native.sql(`delete from public.role_permissions where role_id=${role} and permission_id=(select id from public.permissions where permission_code='${cap}')`);
   expect(await notificationDocumentSubjectsAllowed(await getAuthContextForProfileId(actors[0].profile),doc),table+' revoked field').toBe(false);
   native.sql(`insert into public.role_permissions(role_id,permission_id) select ${role},id from public.permissions where permission_code='${cap}'`);
   native.sql(`delete from public.${table} where id=${id} and employee_id=${employee}`);current=null;tracked.checks.push(table+':CURRENT_SCOPE_ALLOW_AND_FIELD_REVOCATION_DENY');save();
  }
  tracked.state='PASS';
 }finally{
  if(current)native.sql(`delete from public.${current.table} where id=${current.id} and employee_id=${employee}`);
  native.sql(`delete from public.user_roles where user_profile_id=${actors[0].profile} and role_id=${role};delete from public.role_permissions where role_id=${role};delete from public.roles where id=${role};delete from public.employees where id=${employee} and employee_code='${marker}';`);
  for(const [table,id]of Object.entries(masters))native.sql(`delete from public.${table} where id=${id} and code='${marker}'`);
  if(tracked.state!=='PASS')tracked.state='FAIL';
  tracked.cleanup='EXACT_SYNTHETIC_EVIDENCE_EMPLOYEE_ROLE_AND_MASTERS_REMOVED_NO_PROVIDER';save();
 }
},180000);
it('current employee and direct-manager routing uses actual links, scoped roles and separate field permissions',async()=>{
 const marker=('F10_HR_'+randomUUID().replaceAll('-','')).toUpperCase(),path='C:/dev/agt-erp-f10-lab-20261018/'+marker+'.json';
 const profiles=actors.slice(0,2).map(a=>a.profile);
 const prior=JSON.parse(native.sql(`select json_agg(json_build_object('id',id,'company',owner_company_id,'branch',branch_id)) from public.user_profiles where id=any(array[${profiles}])`)) as {id:number;company:number|null;branch:number|null}[];
 const fixtures:Record<string,number>={};const tracked:{state:string;database:string;fixtures:Record<string,number>;checks:string[];cleanup?:string}={state:'RUNNING',database:'algt_f10_candidate_20261018',fixtures,checks:[]};
 const save=()=>fs.writeFileSync(path,JSON.stringify(tracked,null,2));save();
 const add=(name:string,statement:string)=>{const id=Number(native.sql(statement+' returning id'));fixtures[name]=id;save();return id;};
 const codes=['hr.employees.view.self','hr.compliance.view.self','hr.employees.view.team','hr.compliance.view.team'];
 const manager=add('manager',`insert into public.employees(employee_code,full_name_en,gender,date_of_birth,mobile_number,owner_company_id,joining_date,emergency_contact_name,emergency_contact_mobile) values('${marker}_M','Synthetic manager','male','1990-01-01','000',${company},'2020-01-01','Synthetic','000')`);
 const employee=add('employee',`insert into public.employees(employee_code,full_name_en,gender,date_of_birth,mobile_number,owner_company_id,joining_date,emergency_contact_name,emergency_contact_mobile,reporting_manager_id) values('${marker}_E','Synthetic employee','male','1990-01-01','000',${company},'2020-01-01','Synthetic','000',${manager})`);
 const type=add('type',`insert into public.hr_identity_document_types(code,name_en) values('${marker}','Synthetic only')`);
 const identity=add('identity',`insert into public.employee_identity_documents(employee_id,document_type_id,document_number,expiry_date) values(${employee},${type},'SYNTHETIC','2099-01-01')`);
 const role=add('role',`insert into public.roles(role_code,role_name,is_system_role) values('${marker}','Synthetic HR API',false)`);
 native.sql(`insert into public.permissions(permission_code,permission_name,module_code,action_code) select c,'Synthetic HR check','HR','view' from unnest(array[${codes.map(c=>"'"+c+"'").join(',')}]) c on conflict(permission_code) do nothing;
 insert into public.role_permissions(role_id,permission_id) select ${role},id from public.permissions where permission_code=any(array[${codes.map(c=>"'"+c+"'").join(',')}]);
 insert into public.user_roles(user_profile_id,role_id,owner_company_id) values(${profiles[0]},${role},${company}),(${profiles[1]},${role},${company});
 update public.user_profiles set owner_company_id=${company},branch_id=null where id=any(array[${profiles}]);
 insert into public.erp_user_employee_links(user_profile_id,employee_id) values(${profiles[0]},${employee}),(${profiles[1]},${manager});`);
 const source:NotificationEvent={...event(),source_table:'employee_identity_documents',source_id:identity,actor_id:profiles[0],source_snapshot:{employee_id:employee,expiry_date:'2099-01-01'}};
 try{
  expect(await resolveNotificationRecipients(source,s.client!)).toEqual(profiles);tracked.checks.push('VERIFIED_OWN_AND_DIRECT_MANAGER_INCLUDING_ACTOR');
  native.sql(`delete from public.role_permissions where role_id=${role} and permission_id=(select id from public.permissions where permission_code='hr.compliance.view.team')`);
  expect(await resolveNotificationRecipients(source,s.client!)).toEqual([profiles[0]]);tracked.checks.push('TEAM_FIELD_REVOKED_DENY_WITH_OWN_ACCESS_RETAINED');
  native.sql(`insert into public.role_permissions(role_id,permission_id) select ${role},id from public.permissions where permission_code='hr.compliance.view.team';update public.user_profiles set owner_company_id=null where id=${profiles[0]}`);
  expect(await resolveNotificationRecipients(source,s.client!)).toEqual([profiles[1]]);tracked.checks.push('STALE_SELF_LINK_AFTER_TRANSFER_DENIED');
  native.sql(`update public.user_profiles set owner_company_id=${company} where id=${profiles[0]};delete from public.erp_user_employee_links where user_profile_id=${profiles[1]} and employee_id=${manager}`);
  await expect(resolveNotificationRecipients(source,s.client!)).rejects.toThrow('missing or ambiguous');tracked.checks.push('MISSING_MANAGER_LINK_HOLDS_WITHOUT_PARTIAL_COMPLETION');
  tracked.state='PASS';
 }finally{
  native.sql(`delete from public.erp_user_employee_links where (user_profile_id=${profiles[0]} and employee_id=${employee}) or (user_profile_id=${profiles[1]} and employee_id=${manager});
 delete from public.user_roles where user_profile_id=any(array[${profiles}]) and role_id=${role};delete from public.role_permissions where role_id=${role};delete from public.roles where id=${role};
 delete from public.employee_identity_documents where id=${identity} and employee_id=${employee};delete from public.employees where id=${employee} and employee_code='${marker}_E';delete from public.employees where id=${manager} and employee_code='${marker}_M';delete from public.hr_identity_document_types where id=${type} and code='${marker}';
 ${prior.map(p=>`update public.user_profiles set owner_company_id=${p.company??'null'},branch_id=${p.branch??'null'} where id=${p.id};`).join('\n')}`);
  if(tracked.state!=='PASS')tracked.state='FAIL';tracked.cleanup='EXACT_SYNTHETIC_HR_LINKS_AND_ROLES_REMOVED_ORIGINAL_TWO_PROFILE_SCOPES_RESTORED';save();
 }
},90000);
it('actual worker makes bounded multi-lease role-group progress and reconciles a lost qualification response',async()=>{
 const marker=('F10_FANOUT_'+randomUUID().replaceAll('-','')).toUpperCase(),path='C:/dev/agt-erp-f10-lab-20261018/'+marker+'.json';
 const before=String(native.sql(`select coalesce(approval_status,'__null__') from public.dms_documents where id=${doc}`));expect(before).toMatch(/^[a-z_]+$/);
 const permission=Number(native.sql("insert into public.permissions(permission_code,permission_name,module_code,action_code) values('dms.documents.approve','Synthetic approval','DMS','approve') on conflict(permission_code) do update set permission_name=permissions.permission_name returning id"));
 const role=Number(native.sql(`insert into public.roles(role_code,role_name,is_system_role) values('${marker}','Synthetic fanout',false) returning id`));
 native.sql(`insert into public.role_permissions(role_id,permission_id) values(${role},${permission});insert into public.user_roles(user_profile_id,role_id,owner_company_id) values(${actors[0].profile},${role},${company});
 insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) select gen_random_uuid(),'${marker.toLowerCase()}-'||n||'@example.invalid','{}','{}' from generate_series(1,24) n;
 update public.user_profiles p set status='active',must_change_password=false from auth.users u where u.id=p.auth_user_id and u.email like '${marker.toLowerCase()}-%@example.invalid';
 insert into public.user_roles(user_profile_id,role_id,owner_company_id) select p.id,${role},${company} from public.user_profiles p join auth.users u on u.id=p.auth_user_id where u.email like '${marker.toLowerCase()}-%@example.invalid';
 update public.dms_documents set approval_status='pending_approval' where id=${doc};`);
 const approval=Number(native.sql(`insert into public.dms_document_approvals(document_id,action,is_current) values(${doc},'submitted',true) returning id`));
 const source=Number(native.sql(`insert into public.dms_document_events(document_id,event_type,performed_by,metadata_json) values(${doc},'approval_submitted',${actors[1].profile},'{"approval_id":${approval}}') returning id`));
 const id=Number(native.sql(`select id from erp_private.notification_events where event_key='dms-approval-event:${source}'`));
 const tracked:{state:string;database:string;event:number;source:number;approval:number;role:number;marker:string;runs:unknown[];cleanup?:string}={state:'RUNNING',database:'algt_f10_candidate_20261018',event:id,source,approval,role,marker,runs:[]};
 const save=()=>fs.writeFileSync(path,JSON.stringify(tracked,null,2));save();let lost=false;
 const dropping:typeof fetch=async(input,init)=>{const response=await fetcher(input,init);if(!lost&&String(input).includes('/rpc/f10_qualify_notification_candidate')&&response.ok){lost=true;throw Error('SYNTHETIC_POST_COMMIT_RESPONSE_LOSS');}return response;};
 s.client=createClient(url,JSON.parse(fs.readFileSync('C:/dev/agt-erp-f10-lab-20261018/api-intent-private.json','utf8')).service,{global:{fetch:dropping},auth:{persistSession:false,autoRefreshToken:false}});
 try{
  let done=false;
  for(let tick=0;tick<16;tick++){
   native.sql(`update erp_private.notification_events set next_attempt_at='1800-01-01' where id=${id}`);
   const start=performance.now(),result=await processNotificationEvents(1);
   expect(result.results[0]?.id).toBe(id);
   const qualified=Number(native.sql(`select count(*) from erp_private.notification_routing_candidates where event_id=${id} and eligible is not null`));
   const pending=Number(native.sql(`select count(*) from erp_private.notification_routing_candidates where event_id=${id} and eligible is null`));
   tracked.runs.push({elapsedMs:performance.now()-start,result,qualified,pending});save();
   if(result.results[0].outcome==='complete'){done=true;break;}
   expect(['pending','retry']).toContain(result.results[0].outcome);
  }
  expect(lost).toBe(true);expect(done).toBe(true);expect(tracked.runs.length).toBeGreaterThan(2);
  expect(native.sql(`select count(*) from erp_private.notification_event_recipients where event_id=${id} and profile_id=${actors[0].profile} and state='created'`)).toBe('1');
  expect(native.sql(`select count(*) from erp_private.notification_event_recipients where event_id=${id}`)).toBe('1');
  expect(native.sql(`select count(*) from erp_private.notification_routing_candidates where event_id=${id} and eligible is null`)).toBe('0');
  expect(native.sql(`select count(*) from public.erp_email_queue q join erp_private.notification_event_recipients r on r.email_queue_id=q.id where r.event_id=${id} and q.status='pending' and q.sent_at is null`)).toBe('1');
  tracked.state='PASS';
 }finally{
  native.sql(`update public.user_roles set is_active=false where role_id=${role};update public.dms_document_approvals set is_current=false where id=${approval} and document_id=${doc};update public.dms_documents set approval_status=${before==='__null__'?'null':"'"+before+"'"} where id=${doc}`);
  // IDs are retained because routing/history receipts reference them. No user
  // session or provider was created; these are NOT live ERP accounts.
  if(tracked.state!=='PASS')tracked.state='FAIL';tracked.cleanup='OWNED_LOCAL_ROLE_REVOKED_DOC_STATUS_RESTORED_ALL_HISTORY_TRACKED_NO_PROVIDER';save();
  const intent=JSON.parse(fs.readFileSync('C:/dev/agt-erp-f10-lab-20261018/api-intent-private.json','utf8'));
  s.client=createClient(url,intent.service,{global:{fetch:fetcher},auth:{persistSession:false,autoRefreshToken:false}});
 }
},180000);
it('populated recruitment and offer evidence never borrows payroll authority from another company role',async()=>{
 const marker=('F10_RECRUIT_'+randomUUID().replaceAll('-','')).toUpperCase(),path='C:/dev/agt-erp-f10-lab-20261018/'+marker+'.json';
 const f:Record<string,number>={},checks:string[]=[];let state='RUNNING';
 const save=(cleanup?:string)=>fs.writeFileSync(path,JSON.stringify({state,database:'algt_f10_candidate_20261018',fixtures:f,checks,cleanup,production:false},null,2));save();
 const add=(name:string,q:string)=>{f[name]=Number(native.sql(q+' returning id'));save();return f[name];};
 add('company',`insert into public.owner_companies(company_code,legal_name_en) values('${marker}','Synthetic only')`);
 add('role',`insert into public.roles(role_code,role_name,is_system_role) values('${marker}','Synthetic recruitment',false)`);
 add('sideRole',`insert into public.roles(role_code,role_name,is_system_role) values('${marker}_SIDE','Synthetic payroll other company',false)`);
 add('requisition',`insert into public.hr_job_requisitions(requisition_title,owner_company_id) values('Synthetic',${company})`);
 add('candidate',`insert into public.hr_candidates(full_name_en,requisition_id) values('Synthetic',${f.requisition})`);
 native.sql(`insert into public.permissions(permission_code,permission_name,module_code,action_code) values('hr.recruitment.view','Synthetic','HR','view'),('hr.payroll.view','Synthetic','HR','view') on conflict(permission_code) do nothing;
 insert into public.role_permissions(role_id,permission_id) select ${f.role},id from public.permissions where permission_code in ('hr.recruitment.view','hr.payroll.view');
 insert into public.role_permissions(role_id,permission_id) select ${f.sideRole},id from public.permissions where permission_code='hr.payroll.view';
 insert into public.user_roles(user_profile_id,role_id,owner_company_id) values(${actors[0].profile},${f.role},${company}),(${actors[0].profile},${f.sideRole},${f.company});`);
 try{
  add('offer',`insert into public.hr_offers(candidate_id,requisition_id,owner_company_id,offer_document_id) values(${f.candidate},${f.requisition},${company},${doc})`);
  expect(await notificationDocumentSubjectsAllowed(await getAuthContextForProfileId(actors[0].profile),doc)).toBe(true);checks.push('ACTUAL_OFFER_RECRUITMENT_AND_PAYROLL_SCOPE_ALLOW');save();
  native.sql(`delete from public.role_permissions where role_id=${f.role} and permission_id=(select id from public.permissions where permission_code='hr.payroll.view')`);
  expect(await notificationDocumentSubjectsAllowed(await getAuthContextForProfileId(actors[0].profile),doc)).toBe(false);checks.push('COMBINED_ROLE_PAYROLL_IN_OTHER_COMPANY_CANNOT_WIDEN_OFFER_ACCESS');save();
  native.sql(`update public.hr_offers set offer_document_id=null where id=${f.offer}`);
  add('candidateDocument',`insert into public.hr_candidate_documents(candidate_id,dms_document_id) values(${f.candidate},${doc})`);
  expect(await notificationDocumentSubjectsAllowed(await getAuthContextForProfileId(actors[0].profile),doc)).toBe(true);checks.push('ORDINARY_CANDIDATE_EVIDENCE_DOES_NOT_INVENT_PAYROLL_REQUIREMENT');save();
  native.sql(`update public.user_roles set owner_company_id=${f.company} where user_profile_id=${actors[0].profile} and role_id=${f.role}`);
  expect(await notificationDocumentSubjectsAllowed(await getAuthContextForProfileId(actors[0].profile),doc)).toBe(false);checks.push('MOVED_RECRUITMENT_ASSIGNMENT_DENIES_ORIGINAL_COMPANY');save();state='PASS';
 }finally{
  // These exact synthetic producer events were never claimed. Preserve any
  // unexpected receipt instead of deleting a possibly delivered event.
  native.sql(`do $$begin if exists(select 1 from erp_private.notification_events e join erp_private.notification_event_recipients r on r.event_id=e.id where e.source_table='hr_offers' and e.source_id=${f.offer??0}) then raise exception 'Unexpected receipt; retain fixture for reconciliation';end if;end $$;
 delete from erp_private.notification_events where source_table='hr_offers' and source_id=${f.offer??0};
 delete from public.hr_candidate_documents where id=${f.candidateDocument??0} and candidate_id=${f.candidate};delete from public.hr_offers where id=${f.offer??0} and candidate_id=${f.candidate};
 delete from public.hr_candidates where id=${f.candidate};delete from public.hr_job_requisitions where id=${f.requisition};
 delete from public.user_roles where user_profile_id=${actors[0].profile} and role_id in (${f.role},${f.sideRole});delete from public.role_permissions where role_id in (${f.role},${f.sideRole});delete from public.roles where id in (${f.role},${f.sideRole});delete from public.owner_companies where id=${f.company} and company_code='${marker}';`);
  if(state!=='PASS')state='FAIL';save('EXACT_SYNTHETIC_RECRUITMENT_COMPANY_ROLES_AND_UNCLAIMED_EVENTS_REMOVED');
 }
},90000);
