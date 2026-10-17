import {describe,it,expect} from 'vitest';
import {validateMetadataEntry as validate} from '@/lib/dms/metadata/review-validation';
const def=(field_type:string,is_required=false,validation_json:unknown=null)=>({field_type,is_required,validation_json,options_json:{values:['Alpha','Beta']}});
describe('metadata feedback before any server call',()=>{
 it.each([null,undefined,'','  ',[]])('required rejects empty %j',v=>expect(validate(def('text',true),v)).toBeTruthy());
 it.each([false,0])('required preserves false/zero %j',v=>expect(validate(def(typeof v==='boolean'?'boolean':'number',true),v)).toBeNull());
 it.each(['2026-02-30','2026-13-01','2026-1-01','not a date'])('invalid date %s',v=>expect(validate(def('date'),v)).toBeTruthy());
 it.each(['2028-02-29','2026-10-17'])('real date %s',v=>expect(validate(def('date'),v)).toBeNull());
 it.each([NaN,Infinity,'10oops'])('bad number %j',v=>expect(validate(def('number'),v)).toBeTruthy());
 it('checks configured numeric bounds',()=>{expect(validate(def('number',false,{min:0,max:10}),11)).toBeTruthy();expect(validate(def('number',false,{min:0,max:10}),0)).toBeNull();});
 it('checks configured text length',()=>{expect(validate(def('text',false,{max_length:3}),'long')).toBeTruthy();expect(validate(def('textarea'),'العربية '.repeat(400))).toBeNull();});
 it.each([['select','Gamma'],['multiselect',['Alpha','Gamma']],['multi_select',['Alpha','Alpha']]])('invalid selection %s', (t,v)=>expect(validate(def(t as string),v)).toBeTruthy());
 it.each([['select','Alpha'],['multiselect',['Alpha','Beta']],['multi_select',['Beta']]])('valid selection %s',(t,v)=>expect(validate(def(t as string),v)).toBeNull());
 it.each([['email','not-an-email'],['url','javascript:evil']])('invalid format %s',(t,v)=>expect(validate(def(t as string),v)).toBeTruthy());
 it('preserves actual JSON data',()=>expect(validate(def('json',true),{notes:'العربية',flag:false,amount:0})).toBeNull());
});
