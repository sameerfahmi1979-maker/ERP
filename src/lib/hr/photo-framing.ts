import { z } from 'zod';

export const PHOTO_ASPECT = 6 / 7;
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_MAX_PIXELS = 30_000_000;
export const photoMime = z.enum(['image/jpeg', 'image/png', 'image/webp']);
const id = z.number().int().positive().safe();
export const photoSourceSchema = z.object({
  documentId: id, versionId: id, fileId: id, sha256: z.string().regex(/^[a-f0-9]{64}$/),
  width: id.max(20000), height: id.max(20000),
}).strict().refine(v => v.width * v.height <= PHOTO_MAX_PIXELS, 'Image is too large to frame.');
export const photoCropSchema = z.object({
  x: z.number().finite().min(0).max(100), y: z.number().finite().min(0).max(100),
  width: z.number().finite().positive().max(100), height: z.number().finite().positive().max(100),
}).strict().refine(c => c.x + c.width <= 100.00001 && c.y + c.height <= 100.00001, 'Keep the frame inside the photo.');
export const photoFramingSchema = z.object({
  version: z.literal(1), source: photoSourceSchema,
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]), crop: photoCropSchema,
}).strict().superRefine((v, ctx) => {
  const size = rotatedPhotoSize(v.source, v.rotation);
  const width = size.width * v.crop.width / 100, height = size.height * v.crop.height / 100;
  if (width < 24 || height < 28 || Math.abs(width / height - PHOTO_ASPECT) > 0.005)
    ctx.addIssue({code:'custom', message:'Choose a clear portrait frame inside the photo.'});
});
export type PhotoSource = z.infer<typeof photoSourceSchema>;
export type PhotoCrop = z.infer<typeof photoCropSchema>;
export type PhotoFraming = z.infer<typeof photoFramingSchema>;
export function rotatedPhotoSize(source: {width:number; height:number}, rotation:number) {
  return rotation % 180 === 0 ? {width:source.width,height:source.height} : {width:source.height,height:source.width};
}
export function defaultPhotoCrop(source:{width:number;height:number}, rotation=0):PhotoCrop {
  const s=rotatedPhotoSize(source,rotation), width=Math.min(s.width,s.height*PHOTO_ASPECT),height=width/PHOTO_ASPECT;
  return {x:(s.width-width)/s.width*50,y:(s.height-height)/s.height*50,width:width/s.width*100,height:height/s.height*100};
}
export function photoPixels(frame:PhotoFraming) {
  const f=photoFramingSchema.parse(frame),s=rotatedPhotoSize(f.source,f.rotation);
  const left=Math.max(0,Math.round(s.width*f.crop.x/100)),top=Math.max(0,Math.round(s.height*f.crop.y/100));
  return {left,top,width:Math.min(s.width-left,Math.round(s.width*f.crop.width/100)),height:Math.min(s.height-top,Math.round(s.height*f.crop.height/100))};
}
export function parsePhotoFraming(value:unknown):PhotoFraming|null {
  if(value===null||value===undefined||value==='')return null;
  return photoFramingSchema.parse(typeof value==='string'?JSON.parse(value):value);
}
export const photoFramingInput=z.preprocess(value=>{try{return parsePhotoFraming(value);}catch{return value;}},photoFramingSchema.nullable());
