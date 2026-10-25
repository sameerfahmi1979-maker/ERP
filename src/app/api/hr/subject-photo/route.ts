export const runtime='nodejs';
import {NextRequest,NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {currentPhotoState,loadPhotoSource,photoSubjectSchema} from '@/server/hr-photo-source';
import {renderFramedPhoto} from '@/server/hr-photo-image';
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
export async function GET(request:NextRequest) {
  const q=request.nextUrl.searchParams,mode=q.get('mode')??'preview';
  const p=photoSubjectSchema.safeParse({employee:Number(q.get('employee')),dependent:q.has('dependent')?Number(q.get('dependent')):null});
  if(!p.success||!['preview','download','original'].includes(mode))return NextResponse.json({error:'Invalid photo request.'},{status:400,headers});
  try{
    const {employee,dependent}=p.data,read=await currentPhotoState(employee,dependent),{state}=read;
    if(!state.documentId||!state.photo||mode!=='preview'&&!state.canDownload)return NextResponse.json({error:'Photo unavailable or restricted.'},{status:403,headers});
    const loaded=await loadPhotoSource(employee,dependent,state.documentId,mode!=='preview');
    if(state.framing&&(state.framing.source.versionId!==loaded.source.versionId||state.framing.source.fileId!==loaded.source.fileId))return NextResponse.json({error:'The source photo changed. Review its framing.'},{status:409,headers});
    const framed=state.framing!==null&&mode!=='original';
    const bytes=framed?await renderFramedPhoto(loaded.bytes,loaded.file.mime_type,state.framing!):loaded.bytes;
    const claims=await loaded.client.auth.getClaims();
    if(claims.error||!claims.data?.claims?.sub||claims.data.claims.sub!==loaded.ctx.profile?.auth_user_id)throw Error('Session changed.');
    const receipt=await loaded.admin.rpc('hr_record_photo_response',{p_employee:employee,p_dependent:dependent,p_binding:loaded.file,p_frame:state.framing,p_claims:{sub:claims.data.claims.sub,session_id:claims.data.claims.session_id},p_action:mode,p_output_sha:createHash('sha256').update(bytes).digest('hex'),p_output_bytes:bytes.length});
    if(receipt.error||!Number.isSafeInteger(receipt.data)||receipt.data<1)throw Error('Response verification failed.');
    const name=framed?`${loaded.label}-photo.jpg`:String(loaded.file.file_name),safe=name.replace(/[\r\n\u0000-\u001f\u007f]/g,'_');
    return new NextResponse(new Uint8Array(bytes),{headers:{...headers,'Content-Type':framed?'image/jpeg':loaded.file.mime_type,
      'Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'self'",
      'Content-Disposition':`${mode==='preview'?'inline':'attachment'}; filename="${safe.replace(/[^\x20-\x7e]|["\\]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(safe).replace(/'/g,'%27')}`}});
  }catch{return NextResponse.json({error:'Photo unavailable or changed. Reopen the current photo before retrying.'},{status:409,headers});}
}
