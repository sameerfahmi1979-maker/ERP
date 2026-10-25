import {expect,it} from 'vitest';
import {photoMetadataValues,photoMetadataRequest,type PhotoDetails} from '@/lib/hr/photo-metadata';
import {mapMetadataDefinitionRow} from '@/lib/dms/metadata/metadata-definition-shared';
const detail=(type='text'):PhotoDetails=>({snapshot:'a'.repeat(64),values:[],definitions:[mapMetadataDefinitionRow({id:1,document_type_id:3,field_label_en:'Photo detail',field_type:type,is_required:true})]});
it('missing required values stay held instead of silently selecting an incomplete photo',()=>expect(()=>photoMetadataValues(detail(),{})).toThrow('required'));
it.each([['number','12','value_number',12],['decimal','12.5','value_number',12.5],['boolean','false','value_boolean',false],['date','2026-10-25','value_date','2026-10-25'],['text','Portrait','value_text','Portrait']])('maps %s through the existing metadata contract',(type,raw,key,value)=>expect(photoMetadataValues(detail(String(type)),{'1':String(raw)})).toEqual([{definition_id:1,[String(key)]:value}]));
it.each([['date','2026-02-30'],['number','NaN'],['json','{invalid'],['boolean','not-an-answer'],['select','unknown']])('holds invalid %s values', (type,value)=>expect(()=>photoMetadataValues(detail(type),{'1':value})).toThrow());
it('requires current configured options',()=>{const d=detail('multiselect');d.definitions[0].options_json={values:['Portrait','Badge']};expect(photoMetadataValues(d,{'1':'["Portrait"]'})).toEqual([{definition_id:1,value_json:['Portrait']}]);expect(()=>photoMetadataValues(d,{'1':'["Foreign"]'})).toThrow();});
it('retained details bind the exact request and snapshot',()=>expect(photoMetadataRequest.safeParse({requestId:'not-id',snapshot:'',values:[]}).success).toBe(false));
