import {describe,it,expect} from 'vitest';
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {defaultPhotoCrop,photoPixels,photoFramingSchema,parsePhotoFraming,PHOTO_MAX_BYTES} from '@/lib/hr/photo-framing';
import {inspectPhotoImage,renderFramedPhoto} from '@/server/hr-photo-image';
const source={documentId:10,versionId:11,fileId:12,sha256:'a'.repeat(64),width:120,height:140};
const base={version:1 as const,source,rotation:0 as const,crop:defaultPhotoCrop(source)};
describe('framing contract',()=>{
 it('round-trips the memory-only form recipe',()=>expect(parsePhotoFraming(JSON.stringify(base))).toEqual(base));
 it.each([0,90,180,270] as const)('bounds default crop after rotation %s',rotation=>{const frame=photoFramingSchema.parse({...base,rotation,crop:defaultPhotoCrop(source,rotation)});expect(photoPixels(frame).width).toBeGreaterThan(0);});
 it.each([{},null,{...base,rotation:45},{...base,rotation:0.1},{...base,source:null},{...base,version:'1'},{...base,source:{...source,sha256:'x'}},{...base,source:{...source,documentId:-1}},{...base,source:{...source,width:1e7}},{...base,crop:{x:-1,y:0,width:100,height:100}},{...base,crop:{x:10,y:0,width:100,height:100}},{...base,crop:{x:0,y:0,width:0,height:100}},{...base,crop:{x:0,y:0,width:100,height:10}},{...base,unexpected:true}])('rejects malformed or unsafe framing %#',frame=>expect(photoFramingSchema.safeParse(frame).success).toBe(false));
 it.each(['',null,undefined])('supports explicit empty optional framing %s',v=>expect(parsePhotoFraming(v)).toBeNull());
});
describe('actual image decoding',()=>{
 it.each(['jpeg','png','webp'] as const)('decodes and renders %s; original stays unchanged',async format=>{
  const original=await sharp({create:{width:120,height:140,channels:3,background:'#c02b39'}})[format]().toBuffer(),copy=Buffer.from(original),mime='image/'+format;
  const image=await inspectPhotoImage(original,mime),frame={...base,source:{...source,...image}};
  const rendered=await renderFramedPhoto(original,mime,frame),meta=await sharp(rendered).metadata();
  expect(meta.format).toBe('jpeg');expect(meta.width).toBe(120);expect(meta.height).toBe(140);expect(original.equals(copy)).toBe(true);expect(meta.exif).toBeUndefined();
 });
 it('retains a verified original fingerprint and handles EXIF orientation before framing',async()=>{
  const bytes=await sharp({create:{width:140,height:120,channels:3,background:'green'}}).jpeg().withMetadata({orientation:6}).toBuffer();
  const image=await inspectPhotoImage(bytes,'image/jpeg');expect(image).toEqual({width:120,height:140,sha256:createHash('sha256').update(bytes).digest('hex')});
  const output=await renderFramedPhoto(bytes,'image/jpeg',{...base,source:{...source,...image}});expect((await sharp(output).metadata()).exif).toBeUndefined();
 });
 it.each([90,180,270] as const)('uses the selected rotation %s from original bytes',async rotation=>{const bytes=await sharp({create:{width:240,height:280,channels:3,background:'blue'}}).png().toBuffer(),image=await inspectPhotoImage(bytes,'image/png'),s={...source,...image};const result=await renderFramedPhoto(bytes,'image/png',{...base,source:s,rotation,crop:defaultPhotoCrop(s,rotation)});expect((await sharp(result).metadata()).width).toBeLessThanOrEqual(600);});
 it('rejects spoofed MIME, invalid bytes, truncated image and excessive bytes',async()=>{
  const image=await sharp({create:{width:120,height:140,channels:3,background:'blue'}}).png().toBuffer();
  for(const [bytes,mime]of [[image,'image/jpeg'],[Buffer.from('<svg/>'),'image/png'],[image.subarray(0,35),'image/png'],[Buffer.alloc(PHOTO_MAX_BYTES+1),'image/png']] as const)await expect(inspectPhotoImage(bytes,mime)).rejects.toThrow();
 });
 it('rejects an oversized decoded image independently of compressed byte size',async()=>{const bytes=await sharp({create:{width:6000,height:6000,channels:3,background:'white'}}).png().toBuffer();await expect(inspectPhotoImage(bytes,'image/png')).rejects.toThrow();});
 it('refuses a crop bound to a different source fingerprint or dimensions',async()=>{const bytes=await sharp({create:{width:120,height:140,channels:3,background:'red'}}).png().toBuffer(),actual=await inspectPhotoImage(bytes,'image/png');await expect(renderFramedPhoto(bytes,'image/png',base)).rejects.toThrow('changed');await expect(renderFramedPhoto(bytes,'image/png',{...base,source:{...source,...actual,width:240,height:280}})).rejects.toThrow('changed');});
});
