import type {DmsMetadataDefinitionBase} from './metadata-definition-shared';

/** Editor feedback only; the database independently validates the entire merged state. */
export function validateMetadataEntry(def:Pick<DmsMetadataDefinitionBase,'field_type'|'is_required'|'options_json'|'validation_json'>,value:unknown):string|null{
 const empty=value==null||value===''||(Array.isArray(value)&&value.length===0);
 if(empty)return def.is_required?'This field is required.':null;
 const cfg=def.validation_json&&typeof def.validation_json==='object'?def.validation_json as Record<string,unknown>:{};
 const t=def.field_type;
 if(['number','currency'].includes(t)){
  if(typeof value!=='number'||!Number.isFinite(value))return 'Enter a valid number.';
  if(typeof cfg.min==='number'&&value<cfg.min)return `Enter ${cfg.min} or more.`;
  if(typeof cfg.max==='number'&&value>cfg.max)return `Enter ${cfg.max} or less.`;
 }else if(t==='boolean'){if(typeof value!=='boolean')return 'Select Yes or No.';}
 else if(t==='date'){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(new Date(value+'T00:00:00Z').getTime())||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)return 'Enter a valid calendar date.';
 }else if(t==='datetime'){
  if(typeof value!=='string'||Number.isNaN(new Date(value).getTime()))return 'Enter a valid date and time.';
 }else if(t!=='json'){
  if(['multi_select','multiselect'].includes(t)){if(!Array.isArray(value)||value.some(v=>typeof v!=='string')||new Set(value).size!==value.length)return 'Choose valid, distinct options.';}
  else if(typeof value!=='string')return 'Enter a text value.';
 }
 if(typeof value==='string'){
  if(!value.trim())return def.is_required?'This field is required.':null;
  const max=typeof cfg.max_length==='number'?cfg.max_length:typeof cfg.maxLength==='number'?cfg.maxLength:16000;
  if(value.length>max)return `Use no more than ${max} characters.`;
  const min=typeof cfg.min_length==='number'?cfg.min_length:typeof cfg.minLength==='number'?cfg.minLength:0;
  if(value.length<min)return `Use at least ${min} characters.`;
  if(t==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))return 'Enter a valid email address.';
  if(t==='url'&&!/^https?:\/\/[^\s]+$/i.test(value))return 'Enter a full http or https address.';
 }
 if(['select','multi_select','multiselect'].includes(t)){
  const opts=def.options_json as {values?:unknown;options?:unknown}|null;
  const choices=Array.isArray(def.options_json)?def.options_json:opts?.values??opts?.options;
  if(!Array.isArray(choices)||(Array.isArray(value)?value:[value]).some(v=>!choices.includes(v)))return 'Choose an available option.';
 }
 return null;
}
