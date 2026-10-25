'use client';
import {useState} from 'react';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import {Button} from '@/components/ui/button';
import {PHOTO_ASPECT,defaultPhotoCrop,photoFramingSchema,type PhotoFraming,type PhotoSource,type PhotoCrop} from '@/lib/hr/photo-framing';

export default function PhotoFramingEditor({url,source,initial,onApply,onCancel}:{url:string;source:PhotoSource;initial:PhotoFraming|null;onApply:(value:PhotoFraming)=>void;onCancel:()=>void}) {
  const [position,setPosition]=useState({x:0,y:0}),[zoom,setZoom]=useState(1);
  const [rotation,setRotation]=useState<PhotoFraming['rotation']>(initial?.rotation??0);
  const [restore,setRestore]=useState(initial?.crop??defaultPhotoCrop(source));
  const [crop,setCrop]=useState<PhotoCrop>(restore),[generation,setGeneration]=useState(0),[error,setError]=useState('');
  const reset=(angle:PhotoFraming['rotation'])=>{const next=defaultPhotoCrop(source,angle);setRotation(angle);setPosition({x:0,y:0});setZoom(1);setCrop(next);setRestore(next);setGeneration(n=>n+1);setError('');};
  return <div className="w-full max-w-md space-y-3 rounded border border-border bg-card p-3" aria-label="Adjust photo framing">
    <p className="text-sm">Move the photo and adjust the zoom to centre the head.</p>
    <div className="relative h-72 w-full overflow-hidden rounded bg-black" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();onCancel();}}}>
      <Cropper key={generation} image={url} crop={position} zoom={zoom} rotation={rotation} aspect={PHOTO_ASPECT}
        initialCroppedAreaPercentages={restore} onCropChange={setPosition} onZoomChange={setZoom}
        onCropComplete={setCrop} restrictPosition minZoom={1} maxZoom={5} zoomWithScroll={false}
        keyboardStep={4} disableAutomaticStylesInjection cropperProps={{'aria-label':'Move photo with arrow keys'}} />
    </div>
    <label className="block text-sm">Zoom
      <span className="flex items-center gap-2"><Button type="button" variant="outline" aria-label="Zoom out" onClick={()=>setZoom(v=>Math.max(1,v-0.1))}>−</Button>
      <input aria-label="Photo zoom" type="range" min="1" max="5" step="0.01" value={zoom} onChange={e=>setZoom(Number(e.target.value))} className="min-w-0 flex-1 accent-primary"/>
      <Button type="button" variant="outline" aria-label="Zoom in" onClick={()=>setZoom(v=>Math.min(5,v+0.1))}>+</Button></span>
    </label>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={()=>reset(((rotation+90)%360) as PhotoFraming['rotation'])}>Rotate 90°</Button>
      <Button type="button" variant="outline" onClick={()=>reset(0)}>Reset</Button>
      <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      <Button type="button" onClick={()=>{const result=photoFramingSchema.safeParse({version:1,source,rotation,crop});if(result.success)onApply(result.data);else setError(result.error.issues[0].message);}}>Use this framing</Button>
    </div>
  </div>;
}
