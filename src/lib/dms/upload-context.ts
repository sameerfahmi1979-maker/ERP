import {singleUploadContextSchema} from './single-upload-admission';
type Params=Record<string,string|string[]|undefined>;
type Context={entityType:string;entityId:number};
/** Read both existing link formats. An incomplete/conflicting/unsupported
 * subject is never silently converted into an unlinked generic upload. */
export function parseDmsUploadContext(params:Params):{success:true;context:Context|null}|{success:false}{
 const snake=params.entity_type!==undefined||params.entity_id!==undefined;
 const camel=params.entityType!==undefined||params.entityId!==undefined;
 if(!snake&&!camel)return {success:true,context:null};
 function pair(type:unknown,id:unknown){
  if(typeof type!=='string'||typeof id!=='string'||!/^[1-9][0-9]{0,15}$/.test(id))return null;
  const value=singleUploadContextSchema.safeParse({entityType:type,entityId:Number(id)});return value.success?value.data:null;
 }
 const a=snake?pair(params.entity_type,params.entity_id):null,b=camel?pair(params.entityType,params.entityId):null;
 if(snake&&!a||camel&&!b||a&&b&&(a.entityType!==b.entityType||a.entityId!==b.entityId))return {success:false};
 return {success:true,context:a??b};
}
