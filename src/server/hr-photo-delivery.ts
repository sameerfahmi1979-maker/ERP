import { mobileAccessToken } from "@/lib/supabase/mobile-request";
import {currentBinding,photoBinding} from '@/server/mobile/hr-photo';
import {NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {currentPhotoState,loadPhotoSource} from '@/server/hr-photo-source';
import {renderFramedPhoto} from '@/server/hr-photo-image';
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
export type PhotoBinding={documentId:number;versionId:number;fileId:number;fingerprint:string};
export async function deliverSubjectPhoto(employee:number,dependent:number|null,mode:string,expected?:PhotoBinding) {
  try{
    const {client,state}=await currentPhotoState(employee,dependent);
    if(!state.documentId||!state.photo||mode!=='preview'&&!state.canDownload)return NextResponse.json({error:'Photo unavailable or restricted.'},{status:403,headers});
    const binding=expected?await currentBinding(client,employee,dependent,state):null;
    if(expected && (!binding || binding.documentId!==expected.documentId || binding.versionId!==expected.versionId || binding.fileId!==expected.fileId || binding.fingerprint!==expected.fingerprint))
      return NextResponse.json({error:'Photo changed.'},{status:409,headers});
    const loaded=await loadPhotoSource(employee,dependent,state.documentId,mode!=='preview');
    if(state.framing&&(state.framing.source.versionId!==loaded.source.versionId||state.framing.source.fileId!==loaded.source.fileId))return NextResponse.json({error:'The source photo changed. Review its framing.'},{status:409,headers});
    const framed=state.framing!==null&&mode!=='original';
    const bytes=framed?await renderFramedPhoto(loaded.bytes,loaded.file.mime_type,state.framing!):loaded.bytes;
    if(expected && (photoBinding(employee,dependent,state,loaded.file.sha256_hash)?.fingerprint!==expected.fingerprint || loaded.source.documentId!==expected.documentId || loaded.source.versionId!==expected.versionId || loaded.source.fileId!==expected.fileId))
      return NextResponse.json({error:'Photo changed.'},{status:409,headers});
    const claims=await loaded.client.auth.getClaims(mobileAccessToken());
    if(claims.error||!claims.data?.claims?.sub||claims.data.claims.sub!==loaded.ctx.profile?.auth_user_id)throw Error('Session changed.');
    const receipt=await loaded.admin.rpc('hr_record_photo_response',{p_employee:employee,p_dependent:dependent,p_binding:loaded.file,p_frame:state.framing,p_claims:{sub:claims.data.claims.sub,session_id:claims.data.claims.session_id},p_action:mode,p_output_sha:createHash('sha256').update(bytes).digest('hex'),p_output_bytes:bytes.length});
    if(receipt.error||!Number.isSafeInteger(receipt.data)||receipt.data<1)throw Error('Response verification failed.');
    const name=framed?`${loaded.label}-photo.jpg`:String(loaded.file.file_name),safe=name.replace(/[\r\n\u0000-\u001f\u007f]/g,'_');
    return new NextResponse(new Uint8Array(bytes),{headers:{...headers,...(expected?{'X-HR-Employee-Id':String(employee),'X-HR-Photo-Fingerprint':expected.fingerprint}:{}),'Content-Type':framed?'image/jpeg':loaded.file.mime_type,
      'Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'self'",
      'Content-Disposition':`${mode==='preview'?'inline':'attachment'}; filename="${safe.replace(/[^\x20-\x7e]|["\\]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(safe).replace(/'/g,'%27')}`}});
  }catch(error){
    const status=expected && error instanceof Error && error.message==='Photo access restricted.'?403:
      expected && error instanceof Error && error.message==='Photo access unavailable.'?503:409;
    return NextResponse.json({error:'Photo unavailable or changed. Reopen the current photo before retrying.'},{status,headers});
  }
}
