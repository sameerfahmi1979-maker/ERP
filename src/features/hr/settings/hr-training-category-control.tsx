"use client";
import {useEffect,useState} from 'react';
import {Select} from '@fluentui/react-components';
import {Label} from '@/components/ui/label';
import {Button} from '@/components/ui/button';
import {listHrTrainingCategories,type HrSettingsRow} from '@/server/actions/hr/settings';
import {loadTrainingCategoryChoices} from '@/lib/hr/training-category-choices';

export function HrTrainingCategoryControl({value,existingId,existingName,disabled,missing,onChange,onReady}:{value:string;existingId?:number|null;existingName?:string;disabled:boolean;missing:boolean;onChange:(value:string)=>void;onReady:(ready:boolean)=>void}){
 const [rows,setRows]=useState<HrSettingsRow[]|null>(null),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let cancelled=false;onReady(missing);if(missing)return;
  loadTrainingCategoryChoices(listHrTrainingCategories).then(data=>{if(!cancelled){setRows(data);setFailed(false);onReady(true);}}).catch(()=>{if(!cancelled){setRows(null);setFailed(true);onReady(false);}});
  return()=>{cancelled=true;};
 },[retry,missing,onReady]);
 const retained=existingId&&!rows?.some(row=>row.id===existingId);
 return <div className="min-w-0">
  <Label htmlFor="hr-training-category" className="text-xs font-medium mb-1 block">Training category</Label>
  <Select id="hr-training-category" name="training_category_id" aria-label="Training category" value={value} disabled={disabled||missing||rows===null} onChange={event=>onChange(event.target.value)} style={{width:'100%'}}>
   <option value="">No category</option>
   {retained&&<option value={String(existingId)} disabled>{existingName??'Existing category'} ({rows===null?'saved selection; checking availability':'retained; not available for new selection'})</option>}
   {rows?.map(row=><option key={row.id} value={String(row.id)}>{row.name_en}</option>)}
  </Select>
  {missing?<p className="text-xs text-muted-foreground">Current category unavailable. It will remain unchanged.</p>:failed?<div role="alert" className="text-sm text-destructive">Training categories could not load. Entries are retained; saving is paused. <Button type="button" variant="outline" onClick={()=>{setFailed(false);setRetry(v=>v+1);}}>Retry categories</Button></div>:rows===null?<p role="status" className="text-xs">Loading training categories…</p>:null}
 </div>;
}
