import {NextRequest,NextResponse} from 'next/server';
import {photoSubjectSchema} from '@/server/hr-photo-source';
import {deliverSubjectPhoto} from '@/server/hr-photo-delivery';
export const runtime='nodejs';
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
export async function GET(request:NextRequest) {
  const q=request.nextUrl.searchParams,mode=q.get('mode')??'preview';
  const p=photoSubjectSchema.safeParse({employee:Number(q.get('employee')),dependent:q.has('dependent')?Number(q.get('dependent')):null});
  if(!p.success||!['preview','download','original'].includes(mode))return NextResponse.json({error:'Invalid photo request.'},{status:400,headers});
  return deliverSubjectPhoto(p.data.employee,p.data.dependent,mode);
}
