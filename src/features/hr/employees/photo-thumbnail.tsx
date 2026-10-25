'use client';
import {useEffect,useState} from 'react';
import Image from 'next/image';
import {photoPixels,type PhotoFraming} from '@/lib/hr/photo-framing';
export function PhotoThumbnail({url,frame,label,onError}:{url:string;frame:PhotoFraming|null;label:string;onError:()=>void}) {
  const [preview,setPreview]=useState<{key:string;url:string}|null>(null),key=JSON.stringify([url,frame]);
  useEffect(()=>{
    if(!frame)return;
    const controller=new AbortController();let owned:string|undefined;
    void(async()=>{
      const response=await fetch(url,{cache:'no-store',credentials:'same-origin',signal:controller.signal});if(!response.ok)throw Error('Photo unavailable');
      const image=await createImageBitmap(await response.blob(),{imageOrientation:'from-image'});
      try{
        const rotated=document.createElement('canvas'),swap=frame.rotation%180!==0;
        rotated.width=swap?image.height:image.width;rotated.height=swap?image.width:image.height;
        const ctx=rotated.getContext('2d');if(!ctx)throw Error('Photo preview unavailable');
        ctx.translate(rotated.width/2,rotated.height/2);ctx.rotate(frame.rotation*Math.PI/180);ctx.drawImage(image,-image.width/2,-image.height/2);
        const {left,top,width,height}=photoPixels(frame),output=document.createElement('canvas');output.width=192;output.height=224;
        const out=output.getContext('2d');if(!out)throw Error('Photo preview unavailable');out.drawImage(rotated,left,top,width,height,0,0,192,224);
        const blob=await new Promise<Blob>((resolve,reject)=>output.toBlob(b=>b?resolve(b):reject(Error('Photo preview unavailable')),'image/png'));
        if(!controller.signal.aborted){owned=URL.createObjectURL(blob);setPreview({key,url:owned});}
      }finally{image.close();}
    })().catch(()=>{if(!controller.signal.aborted)onError();});
    return()=>{controller.abort();if(owned)URL.revokeObjectURL(owned);};
  },[url,frame,key,onError]);
  const source=frame?(preview?.key===key?preview.url:null):url;
  return source?<Image unoptimized src={source} alt={label} width={96} height={112} className="h-28 w-24 rounded border border-border object-contain" referrerPolicy="no-referrer" onError={onError}/>:<span className="flex h-28 w-24 items-center justify-center text-xs">Preparing preview…</span>;
}
