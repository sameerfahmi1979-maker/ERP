import 'server-only';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {MAX_BRANDING_FILE_SIZE_BYTES} from '@/lib/branding/constants';

/** New assets are decoded raster images, never browser-declared active content.
 * Re-encoding also removes embedded metadata and trailing/polyglot payloads.
 * Historical SVG/ICO bytes are not rewritten; convert new ones to PNG first. */
export async function verifyBrandingImage(file:File){
 if(!file.size||file.size>MAX_BRANDING_FILE_SIZE_BYTES)throw Error('Choose a non-empty image no larger than 10 MB.');
 const mime=file.type==='image/jpg'?'image/jpeg':file.type;
 if(!['image/png','image/jpeg','image/webp'].includes(mime))throw Error('Choose PNG, JPEG or WebP. Convert SVG and ICO images to PNG before uploading.');
 try{
  const bytes=Buffer.from(await file.arrayBuffer());
  const signature=bytes.subarray(0,12);
  const isExpected= mime==='image/png' ? signature.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
   : mime==='image/jpeg' ? signature[0]===255&&signature[1]===216&&signature[2]===255
   : signature.toString('ascii',0,4)==='RIFF'&&signature.toString('ascii',8,12)==='WEBP';
  if(!isExpected)throw Error('Invalid image');
  const image=sharp(bytes,{limitInputPixels:32_000_000,failOn:'warning',animated:false}).timeout({seconds:10});
  const meta=await image.metadata();
  const supported:Record<string,string>={png:'image/png',jpeg:'image/jpeg',webp:'image/webp'};
  const expected=supported[meta.format??''];
  if(expected!==mime||!meta.width||!meta.height||(meta.pages??1)!==1||meta.width*meta.height>32_000_000)throw Error('Invalid image');
  const {data,info}=await image.rotate().png().toBuffer({resolveWithObject:true});
  if(!data.length||data.length>MAX_BRANDING_FILE_SIZE_BYTES)throw Error('Invalid image');
  const name=file.name.replace(/[\u0000-\u001f\u007f/\\]/g,'_').replace(/\.[^.]*$/,'').slice(0,190)||'branding-image';
  return {bytes:data,metadata:{sha256:createHash('sha256').update(data).digest('hex'),filename:name+'.png',mime:'image/png',size:data.length,width:info.width,height:info.height}};
 }catch{throw Error('The file could not be verified as a single safe image within the size and pixel limits. Choose another PNG, JPEG or WebP.');}
}
