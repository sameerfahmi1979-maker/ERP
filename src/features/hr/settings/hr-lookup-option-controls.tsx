"use client";

import {Select as FluentSelect} from '@fluentui/react-components';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Switch} from '@/components/ui/switch';
import type {HrLookupTable} from '@/lib/hr/settings-save-contract';
import {hrLookupOptionFields,type HrLookupOptionState} from '@/lib/hr/lookup-option-fields';
import {HrTrainingCategoryControl} from './hr-training-category-control';

export function HrLookupOptionControls({entity,values,onChange,disabled,existingTrainingCategoryId,existingTrainingCategoryName,onReferenceReady}:{
 entity:HrLookupTable;values:HrLookupOptionState;onChange:(key:string,value:string|boolean)=>void;disabled:boolean;
 existingTrainingCategoryId?:number|null;existingTrainingCategoryName?:string;onReferenceReady:(ready:boolean)=>void;
}) {
 const fields=hrLookupOptionFields[entity]??[];
 if(!fields.length)return null;
 return <div className="col-span-12 border-t pt-4">
  <h3 className="text-sm font-semibold mb-3">Configuration</h3>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
   {fields.map(field=>{
    const id=`hr-option-${field.key}`,missing=!Object.hasOwn(values,field.key);
    if(field.kind==='reference')return <HrTrainingCategoryControl key={field.key} value={String(values[field.key]??'')} existingId={existingTrainingCategoryId} existingName={existingTrainingCategoryName} disabled={disabled} missing={missing} onChange={value=>onChange(field.key,value)} onReady={onReferenceReady}/>;
    return <div key={field.key} className="min-w-0">
     {field.kind==='flag'?<div className="flex items-center gap-3">
      <Switch id={id} name={field.key} checked={values[field.key]===true} disabled={disabled||missing} onCheckedChange={v=>onChange(field.key,v)}/>
      <Label htmlFor={id} className="text-sm cursor-pointer">{field.label}</Label>
     </div>:<>
      <Label htmlFor={id} className="text-xs font-medium mb-1 block">{field.label}{field.kind==='number'&&field.optional?' (optional)':''}</Label>
      {field.kind==='number'?<Input id={id} aria-label={field.label} aria-describedby={field.step===0.1?`${id}-precision`:undefined} name={field.key} type="number" min={field.min} max={field.max} step={field.step} required={!field.optional} disabled={disabled||missing} value={String(values[field.key]??'')} onChange={e=>onChange(field.key,e.target.value)}/>:<FluentSelect id={id} aria-label={field.label} name={field.key} required value={String(values[field.key]??'')} disabled={disabled||missing} onChange={e=>onChange(field.key,e.target.value)} style={{width:'100%'}}>
       {!field.options.some(([key])=>key===values[field.key])&&<option value="" disabled>Choose an option</option>}
       {field.options.map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </FluentSelect>}
      {field.kind==='number'&&field.step===0.1&&<p id={`${id}-precision`} className="text-xs text-muted-foreground mt-1">Use up to one decimal place.</p>}
     </>}
     {missing&&<p className="text-xs text-muted-foreground mt-1">Value unavailable. Reopen the record to edit this setting; it will remain unchanged.</p>}
    </div>;
   })}
  </div>
 </div>;
}
