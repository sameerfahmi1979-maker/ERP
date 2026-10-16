import 'server-only';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {invalidateCommittedBranding} from '@/server/branding-invalidation';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getAuthContext} from '@/lib/rbac/check';
import {brandingPermission,canManageAppBranding,canUploadBrandingAssets,validateScopeAndType} from '@/lib/branding/asset-permissions';
import {BRANDING_STORAGE_BUCKET,MAX_BRANDING_FILE_SIZE_BYTES} from '@/lib/branding/constants';
import type {BrandingAssetType} from '@/lib/branding/types';
import type {BrandingAssetMutationResult,BrandingAssetSaveContract} from '@/lib/branding/asset-save-contract';
import {verifyBrandingImage} from '@/server/branding-image';

const contractSchema=z.object({operationId:z.string().uuid(),assetId:z.number().int().positive().nullable(),revision:z.string().regex(/^[1-9]\d*$/).nullable(),parentRevision:z.string().regex(/^[1-9]\d*$/)}).strict();
const metadataSchema=z.object({assetScope:z.enum(['app','report']),assetType:z.string(),appSettingsId:z.number().int().positive().optional(),brandingProfileId:z.number().int().positive().optional(),ownerCompanyId:z.number().int().positive().nullable().optional()}).strict();
const receiptSchema=z.object({id:z.number().int().positive(),revision:z.string().regex(/^[1-9]\d*$/),parent_revision:z.string().regex(/^[1-9]\d*$/),changed:z.boolean(),replayed:z.boolean(),owner_company_id:z.number().int().positive().nullable()});
const preparedSchema=z.discriminatedUnion('status',[
 z.object({status:z.literal('complete'),receipt:receiptSchema}),
 z.object({status:z.literal('prepared'),path:z.string(),version:z.number().int().positive()}),
]);
function failure(code?:string):BrandingAssetMutationResult{
 if(code==='42501')return {success:false,error:'The branding asset is unavailable or your session/company/signing authority no longer permits this change.'};
 if(code==='PT409')return {success:false,error:'The asset or upload changed. Reopen the current profile and compare before replacing it. Unfinished uploads are retained for reconciliation.'};
 const rollback=(typeof code==='string'&&code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(code)||['40000','40001','40002','40P01'].includes(code)));
 return {success:false,uncertain:!rollback,error:rollback?'Asset change rejected; existing branding and history are preserved.':'Asset save unconfirmed. Retry the same file and operation to recover its result.'};
}
function accepted(raw:unknown,scope:'app'|'report'|'both'):BrandingAssetMutationResult{
 const receipt=receiptSchema.safeParse(raw);
 if(!receipt.success)return {success:false,uncertain:true,error:'Asset response incomplete. Retry the unchanged operation.'};
 // A failed invalidation is not an uncommitted save. The durable receipt can
 // recover the exact result; no compensating deletion is ever attempted.
 try{if(receipt.data.changed)invalidateCommittedBranding(scope,receipt.data.owner_company_id);}catch{/* receipt remains authoritative */}
 return {success:true,data:receipt.data};
}
async function actorFor(meta:z.infer<typeof metadataSchema>){
 const ctx=await getAuthContext();if(!ctx.profile)return null;
 const client=await createClient();
 const parentId=meta.assetScope==='app'?meta.appSettingsId:meta.brandingProfileId;
 if(!parentId||meta.assetScope==='app'&&meta.brandingProfileId||meta.assetScope==='report'&&meta.appSettingsId)return null;
 const parent=await client.from(meta.assetScope==='app'?'erp_app_branding_settings':'erp_report_branding_profiles_safe')
  .select(meta.assetScope==='app'?'id,is_active':'id,owner_company_id,is_active').eq('id',parentId).maybeSingle();
 if(parent.error||!parent.data)return null;
 const row=parent.data as unknown as {id:number;owner_company_id?:number|null};
 const company=meta.assetScope==='app'?null:row.owner_company_id;
 if(company===undefined||meta.ownerCompanyId!==undefined&&meta.ownerCompanyId!==company)return null;
 if(!(meta.assetScope==='app'?canManageAppBranding(ctx):brandingPermission(ctx,'reports.manage',company))||!canUploadBrandingAssets(ctx,company)
  ||['stamp','signature'].includes(meta.assetType)&&!brandingPermission(ctx,'reports.sign',company))return null;
 const claims=await client.auth.getClaims(),session=claims.data?.claims.session_id;
 const valid=await client.rpc('f03_current_session_valid');
 if(claims.error||typeof session!=='string'||valid.error||valid.data!==true)return null;
 return {actor:ctx.profile.id,session,parentId,company};
}

export async function saveBrandingUpload(formData:FormData):Promise<BrandingAssetMutationResult>{
 try{
  let meta:z.infer<typeof metadataSchema>,contract:BrandingAssetSaveContract;
  try{meta=metadataSchema.parse(JSON.parse(String(formData.get('metadata'))));contract=contractSchema.parse(JSON.parse(String(formData.get('contract'))));}
  catch{return {success:false,error:'Reopen the asset and choose the file again; its save contract is invalid.'};}
  if(validateScopeAndType(meta.assetScope,meta.assetType as BrandingAssetType)||((contract.assetId===null)!==(contract.revision===null)))return {success:false,error:'Invalid asset scope or version.'};
  const actor=await actorFor(meta);if(!actor)return failure('42501');
  const file=formData.get('file');if(!(file instanceof File))return {success:false,error:'Choose a PNG, JPEG or WebP file.'};
  let verified:Awaited<ReturnType<typeof verifyBrandingImage>>;
  try{verified=await verifyBrandingImage(file);}catch(error){return {success:false,error:error instanceof Error?error.message:'Image verification failed.'};}
  const admin=createAdminClient();
  const prepared=await admin.rpc('prepare_branding_asset_change',{p_actor:actor.actor,p_session:actor.session,p_scope:meta.assetScope,p_parent:actor.parentId,p_type:meta.assetType,p_operation:contract.operationId,p_expected_asset:contract.assetId,p_revision:contract.revision,p_parent_revision:contract.parentRevision,p_mode:'upload',p_metadata:verified.metadata});
  if(prepared.error)return failure(prepared.error.code);
  const parsed=preparedSchema.safeParse(prepared.data);if(!parsed.success)return failure();
  if(parsed.data.status==='complete')return accepted(parsed.data.receipt,meta.assetScope);
  const prefix=meta.assetScope==='app'?`app/settings-${actor.parentId}`:`report/company-${actor.company??0}/profile-${actor.parentId}`;
  if(parsed.data.path!==`${prefix}/${meta.assetType}/v${parsed.data.version}.png`)return failure();
  const storage=admin.storage.from(BRANDING_STORAGE_BUCKET);
  // Stable reserved path, upsert:false. A retry may find the previous transfer
  // already present. Verify its bytes; never overwrite or delete it blindly.
  const transfer=await storage.upload(parsed.data.path,verified.bytes,{contentType:verified.metadata.mime,upsert:false});
  if(transfer.error){
   const previous=await storage.download(parsed.data.path);
   if(previous.error||!previous.data||previous.data.size>MAX_BRANDING_FILE_SIZE_BYTES)return failure();
   const digest=createHash('sha256').update(Buffer.from(await previous.data.arrayBuffer())).digest('hex');
   if(digest!==verified.metadata.sha256)return {success:false,error:'The staged image requires administrator reconciliation. It was not overwritten.'};
  }
  const committed=await admin.rpc('finalize_branding_asset_change',{p_actor:actor.actor,p_session:actor.session,p_operation:contract.operationId});
  if(committed.error)return failure(committed.error.code);
  return accepted(committed.data,meta.assetScope);
 }catch{return failure();}
}

export async function retireBrandingAsset(assetId:number,mode:'deactivate'|'retire',contract?:BrandingAssetSaveContract):Promise<BrandingAssetMutationResult>{
 try{
  const parsed=contractSchema.safeParse(contract);
  if(!Number.isSafeInteger(assetId)||assetId<1||!parsed.success||parsed.data.assetId!==assetId||!parsed.data.revision)return {success:false,error:'Reopen this asset before changing it. Its revision is missing.'};
  const ctx=await getAuthContext();if(!ctx.profile)return failure('42501');
  const client=await createClient(),claims=await client.auth.getClaims(),session=claims.data?.claims.session_id;
  const valid=await client.rpc('f03_current_session_valid');
  if(claims.error||typeof session!=='string'||valid.error||valid.data!==true)return failure('42501');
  // Actual asset identity and authorization are resolved together in a narrow
  // transaction, including after a previous successful soft retirement.
  const result=await createAdminClient().rpc('retire_branding_asset_change',{p_actor:ctx.profile.id,p_session:session,p_asset:assetId,p_revision:parsed.data.revision,p_parent_revision:parsed.data.parentRevision,p_operation:parsed.data.operationId,p_mode:mode});
  if(result.error)return failure(result.error.code);
  const response=preparedSchema.safeParse(result.data);if(!response.success||response.data.status!=='complete')return failure();
  return accepted(response.data.receipt,'both');
 }catch{return failure();}
}
