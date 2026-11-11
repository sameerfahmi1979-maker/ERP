"use client";
import {useEffect,useId,useState} from 'react';
import {Label} from '@/components/ui/label';
import {Button} from '@/components/ui/button';
import {listHrTrainingCategories,type HrSettingsRow} from '@/server/actions/hr/settings';
import {loadTrainingCategoryChoices} from '@/lib/hr/training-category-choices';

export function HrTrainingCategoryControl({value,existingId,existingName,disabled,missing,required=false,onChange,onReady}:{value:string;existingId?:number|null;existingName?:string;disabled:boolean;missing:boolean;required?:boolean;onChange:(value:string)=>void;onReady:(ready:boolean)=>void}){
 const controlId=useId(),hintId=`${controlId}-hint`;
 const [rows,setRows]=useState<HrSettingsRow[]|null>(null),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let cancelled=false;onReady(missing);if(missing)return;
  loadTrainingCategoryChoices(listHrTrainingCategories).then(data=>{if(!cancelled){setRows(data);setFailed(false);onReady(true);}}).catch(()=>{if(!cancelled){setRows(null);setFailed(true);onReady(false);}});
  return()=>{cancelled=true;};
 },[retry,missing,onReady]);
 const retained=existingId&&!rows?.some(row=>row.id===existingId);
 return <div className="min-w-0">
  <Label htmlFor={controlId} className="text-xs font-medium mb-1 block">Training category {required&&<span className="text-destructive">*</span>}</Label>
  <select id={controlId} name="training_category_id" aria-label="Training category" aria-describedby={hintId} required={required} value={value} disabled={disabled||missing||rows===null} onChange={event=>onChange(event.target.value)}
   className="h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 text-sm text-card-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
   style={{appearance:'auto'}}>
   <option value="">{required?'Choose a training category':'No category (inactive type only)'}</option>
   {retained&&<option value={String(existingId)} disabled>{existingName??'Existing category'} ({rows===null?'saved selection; checking availability':'retained; not available for new selection'})</option>}
   {rows?.map(row=><option key={row.id} value={String(row.id)}>{row.name_en}</option>)}
  </select>
  <p id={hintId} className="text-xs text-muted-foreground mt-1">Choose a category from the list. Employee certificates use the category configured here.</p>
  {missing?<p className="text-xs text-muted-foreground">Current category unavailable. It will remain unchanged.</p>:failed?<div role="alert" className="text-sm text-destructive">Training categories could not load. Entries are retained; saving is paused. <Button type="button" variant="outline" onClick={()=>{setFailed(false);setRetry(v=>v+1);}}>Retry categories</Button></div>:rows===null?<p role="status" className="text-xs">Loading training categories…</p>:null}
 </div>;
}
