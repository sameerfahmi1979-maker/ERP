import {aiEndpoint,safeProviderFailure} from '@/lib/settings/provider-endpoints';
import type {AiProviderInterface,AiProviderConfig,AiTestConnectionResult} from './types';

export class LocalProvider implements AiProviderInterface {
 readonly providerType;
 readonly config:AiProviderConfig;
 readonly isEnabled:boolean;
 constructor(config:AiProviderConfig){this.config=config;this.providerType=config.providerType;this.isEnabled=config.isEnabled;}
 async testConnection():Promise<AiTestConnectionResult>{
  const start=Date.now();
  const result=(ok:boolean,message:string):AiTestConnectionResult=>({ok,status:ok?'success':'failed',message,durationMs:Date.now()-start,providerType:this.providerType});
  if(!this.config.isActive)return result(false,'This provider is inactive.');
  if(this.providerType==='tesseract')return result(false,'Tesseract runtime readiness is not verified by this screen. A configured local library is not proof that OCR processing works.');
  if(this.providerType!=='local_ollama')return result(false,'A connection check is not available for this provider type.');
  try{
   const endpoint=aiEndpoint(this.providerType,this.config.apiEndpoint??process.env.LOCAL_LLM_ENDPOINT);
   const response=await fetch(`${endpoint}/api/tags`,{redirect:'error',signal:AbortSignal.timeout(5000)});
   if(response.status!==200)return result(false,`Local provider catalog check failed (HTTP ${response.status}).`);
   const data:unknown=await response.json();
   const models=data&&typeof data==='object'&&'models' in data?data.models:null;
   if(!Array.isArray(models)||models.some(m=>!m||typeof m!=='object'||typeof m.name!=='string'))return result(false,'The local provider returned an unexpected model catalog.');
   if(this.config.modelId&&!models.some(m=>m.name===this.config.modelId))return result(false,'The selected local model was not listed. Review the installed model before enabling this provider.');
   return result(true,'Local model catalog verified. A complete AI operation has not been performed.');
  }catch(error){return result(false,safeProviderFailure(error));}
 }
}
