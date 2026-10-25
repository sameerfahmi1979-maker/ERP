import 'server-only';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {PHOTO_MAX_BYTES,PHOTO_MAX_PIXELS,photoMime,photoFramingSchema,photoPixels,type PhotoFraming} from '@/lib/hr/photo-framing';

/** All transforms start from verified original bytes, never from a prior crop. */
export async function inspectPhotoImage(bytes:Buffer,mime:string) {
  if(bytes.length===0||bytes.length>PHOTO_MAX_BYTES)throw Error('Choose an image up to 10 MB.');
  const m=await sharp(bytes,{limitInputPixels:PHOTO_MAX_PIXELS,failOn:'warning',animated:false}).metadata();
  const formats:Record<string,string>={jpeg:'image/jpeg',png:'image/png',webp:'image/webp'};
  const actual=formats[m.format??''];
  if(!photoMime.safeParse(mime).success||actual!==mime||(m.pages??1)!==1||!m.width||!m.height)throw Error('Choose one valid JPEG, PNG or WebP photo.');
  const swap=[5,6,7,8].includes(m.orientation??1),width=swap?m.height:m.width,height=swap?m.width:m.height;
  if(width<24||height<28||width>20000||height>20000||width*height>PHOTO_MAX_PIXELS)throw Error('Photo dimensions are outside the supported range.');
  // Force full decoding; a valid header is not proof of valid image bytes.
  await sharp(bytes,{limitInputPixels:PHOTO_MAX_PIXELS,failOn:'warning'}).resize(1,1).raw().toBuffer();
  return {width,height,sha256:createHash('sha256').update(bytes).digest('hex')};
}
export async function renderFramedPhoto(bytes:Buffer,mime:string,raw:PhotoFraming) {
  const frame=photoFramingSchema.parse(raw),source=await inspectPhotoImage(bytes,mime);
  if(source.width!==frame.source.width||source.height!==frame.source.height||source.sha256!==frame.source.sha256)
    throw Error('The original photo changed. Reopen Adjust framing.');
  const oriented=await sharp(bytes,{limitInputPixels:PHOTO_MAX_PIXELS,failOn:'warning'}).autoOrient().png().toBuffer();
  const rotated=frame.rotation?await sharp(oriented,{limitInputPixels:PHOTO_MAX_PIXELS}).rotate(frame.rotation).png().toBuffer():oriented;
  return sharp(rotated,{limitInputPixels:PHOTO_MAX_PIXELS}).extract(photoPixels(frame))
    .resize({width:600,height:700,fit:'inside',withoutEnlargement:true}).jpeg({quality:90,mozjpeg:true}).toBuffer();
}
