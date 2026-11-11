"use server";
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {getAuthContext,hasPermission} from '@/lib/rbac/check';
import {checkDocumentConfidentialityAccess} from '@/lib/dms/document-access';
import {DMS_ZIP_MAX_BYTES,DMS_ZIP_MAX_FILES,type DmsZipFile} from '@/lib/dms/selected-download';
export async function getSelectedDmsDownloadFiles(raw:unknown):Promise<{success:true;files:DmsZipFile[]}|{success:false;error:string}>{
 const parsed=z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).min(1).max(25).refine(ids=>new Set(ids).size===ids.length).safeParse(raw);
 if(!parsed.success)return {success:false,error:'Select between 1 and 25 documents.'};
 try{
  const ctx=await getAuthContext();if(!ctx.profile||!ctx.isAccountActive||ctx.profile.must_change_password||(!hasPermission(ctx,'dms.documents.download')&&!hasPermission(ctx,'dms.admin')))return {success:false,error:'Current download access is required.'};
  const db=await createClient();const docs=await db.from('dms_documents').select('id,document_no,current_version_id').in('id',parsed.data).is('deleted_at',null);
  if(docs.error||docs.data?.length!==parsed.data.length)return {success:false,error:'Some selected documents are unavailable. Refresh the selection.'};
  const files:DmsZipFile[]=[];
  for(const doc of docs.data){
   if(!(await checkDocumentConfidentialityAccess(db,doc.id,ctx,'dms.documents.download')).allowed)return {success:false,error:'Download access changed for a selected document.'};
   let query=db.from('dms_document_files').select('id,file_name,file_size_bytes').eq('document_id',doc.id).is('deleted_at',null).in('file_role',['original','attachment']);
   query=doc.current_version_id===null?query.is('version_id',null):query.eq('version_id',doc.current_version_id);
   const result=await query.order('id').limit(DMS_ZIP_MAX_FILES+1);
   if(result.error||!result.data?.length)return {success:false,error:'A selected document has no available current files. Refresh the selection.'};
   for(const f of result.data)files.push({id:f.id,name:f.file_name,size:Number(f.file_size_bytes),folder:doc.document_no});
   if(files.length>DMS_ZIP_MAX_FILES||files.reduce((sum,f)=>sum+f.size,0)>DMS_ZIP_MAX_BYTES)return {success:false,error:'The ZIP limit is 50 files and 100 MB. Select fewer documents.'};
  }
  return {success:true,files};
 }catch{return {success:false,error:'Selected download access could not be verified. Refresh and retry.'};}
}
