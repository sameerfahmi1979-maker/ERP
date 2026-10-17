import type {WorkspaceDraftCodec} from '@/hooks/use-workspace-controlled-draft';
import type {GeographyEntity} from '@/lib/master-data/geography-save-contract';
import type {Country,Emirate,City,AreaZone,Port} from './types';
export type GeographyRecord=Country|Emirate|City|AreaZone|Port;
export type GeographyFormState=Record<string,string|boolean>;
export type GeographyField={key:string;label:string;kind?:'boolean'|'number'|'country'|'region'|'city'|'lookup';required?:boolean;immutable?:boolean;max?:number;category?:string;section?:string};
const nameFields:GeographyField[]=[{key:'name_en',label:'English name',required:true,max:255},{key:'name_ar',label:'Arabic name',max:255}];
const statusFields:GeographyField[]=[{key:'sort_order',label:'Sort order',kind:'number'},{key:'is_active',label:'Active',kind:'boolean',section:'status'}];
export const geographyFields:Record<GeographyEntity,GeographyField[]>={
 countries:[{key:'country_code',label:'ISO2 code',required:true,immutable:true,max:2},{key:'iso3_code',label:'ISO3 code',required:true,immutable:true,max:3},...nameFields,
  {key:'nationality_en',label:'Nationality (English)',required:true,max:100,section:'details'},{key:'nationality_ar',label:'Nationality (Arabic)',max:100,section:'details'},
  {key:'phone_code',label:'Phone code',max:10,section:'details'},{key:'default_currency_code',label:'Default currency code',max:3,section:'details'},
  {key:'is_gcc',label:'GCC country',kind:'boolean',section:'details'},{key:'is_uae',label:'UAE',kind:'boolean',section:'details'},...statusFields],
 emirates:[{key:'emirate_code',label:'Region code',required:true,immutable:true,max:3},{key:'country_id',label:'Country',kind:'country'},...nameFields,
  {key:'abbreviation_en',label:'English abbreviation',required:true,max:20},{key:'abbreviation_ar',label:'Arabic abbreviation',max:20},
  {key:'region_type_code',label:'Region type',kind:'lookup',category:'REGION_TYPES'},...statusFields],
 cities:[{key:'city_code',label:'City code',required:true,immutable:true,max:100},{key:'country_id',label:'Country',kind:'country'},
  {key:'emirate_id',label:'Region / Emirate',kind:'region',required:true},...nameFields,...statusFields],
 areas_zones:[{key:'area_code',label:'Area code',required:true,immutable:true,max:100},{key:'city_id',label:'City',kind:'city',required:true},...nameFields,
  {key:'area_type_code',label:'Area type',kind:'lookup',category:'AREA_TYPES'},...statusFields],
 ports:[{key:'port_code',label:'Port code',required:true,immutable:true,max:100},{key:'country_id',label:'Country',kind:'country'},
  {key:'emirate_id',label:'Region / Emirate',kind:'region',required:true},{key:'port_type_code',label:'Port type',kind:'lookup',category:'PORT_TYPES',required:true},...nameFields,
  {key:'iata_code',label:'IATA code',max:3,section:'details'},{key:'icao_code',label:'ICAO code',max:4,section:'details'},...statusFields],
};
export const geographyFormNames:Record<GeographyEntity,{label:string;prefix:string}>={countries:{label:'country',prefix:'country'},emirates:{label:'region',prefix:'emirate'},cities:{label:'city',prefix:'city'},areas_zones:{label:'area / zone',prefix:'area'},ports:{label:'port',prefix:'port'}};
export function geographyFormState(entity:GeographyEntity,row?:GeographyRecord|null):GeographyFormState{
 const source=row as unknown as Record<string,unknown>|undefined;
 return Object.fromEntries(geographyFields[entity].map(f=>[f.key,f.kind==='boolean'?(source?.[f.key]??(f.key==='is_active'))===true:String(source?.[f.key]??(f.kind==='number'?'0':''))]));
}
export const geographyDraftCodec:WorkspaceDraftCodec<GeographyFormState>={
 encode:value=>Object.fromEntries(Object.entries(value).map(([key,v])=>[key,String(v)])),
 restore:(initial,read)=>Object.fromEntries(Object.entries(initial).map(([key,v])=>[key,typeof v==='boolean'?read(key,String(v))==='true':read(key,v)])),
};
export function geographyFormPayload(entity:GeographyEntity,state:GeographyFormState,editing:boolean):Record<string,unknown>{
 return Object.fromEntries(geographyFields[entity].filter(f=>!editing||!f.immutable).map(f=>{
  const raw=state[f.key];let value:unknown=raw;
  if(f.kind==='number')value=String(raw).trim()===''?NaN:Number(raw);
  else if(['country','region','city'].includes(f.kind??''))value=raw===''?(f.kind==='country'?null:NaN):Number(raw);
  else if(typeof raw==='string'){
   value=raw.trim();if(!f.required&&value==='')value=null;
   if(typeof value==='string'&&(f.immutable||['default_currency_code','icao_code','iata_code'].includes(f.key)))value=value.toUpperCase();
  }
  return [f.key,value];
 }));
}
