import {resolveAiProviderSecret} from '@/lib/settings/resolve-ai-secret';
import {aiEndpoint,providerApiVersion,ProviderConfigurationError,safeProviderFailure} from '@/lib/settings/provider-endpoints';
import type {AiProviderInterface,AiProviderConfig,AiTestConnectionResult} from './types';

export class OpenAiProvider implements AiProviderInterface {
 readonly providerType;
 readonly config:AiProviderConfig;
 readonly isEnabled:boolean;
 constructor(config:AiProviderConfig){this.config=config;this.providerType=config.providerType;this.isEnabled=config.isEnabled;}

 async testConnection():Promise<AiTestConnectionResult>{
  const start=Date.now();
  const result=(ok:boolean,message:string):AiTestConnectionResult=>({ok,status:ok?'success':'failed',message,durationMs:Date.now()-start,providerType:this.providerType,modelId:this.config.modelId});
  try{
   if(!this.config.isActive||!['openai','azure_openai'].includes(this.providerType))throw new ProviderConfigurationError('This provider is inactive or unsupported.');
   // Validate the destination before resolving credentials, including legacy rows.
   const endpoint=aiEndpoint(this.providerType,this.config.apiEndpoint);
   const azure=this.providerType==='azure_openai';
   const url=azure?`${endpoint}/openai/models?api-version=${providerApiVersion(this.config.apiVersion,'2024-10-21')}`:`${endpoint}/models`;
   const key=resolveAiProviderSecret(this.config);
   if(!key)return result(false,'Provider credentials are not available. Ask an authorized administrator to review the protected credential configuration.');
   const headers:Record<string,string>=azure?{'api-key':key}:{Authorization:`Bearer ${key}`};
   const response=await fetch(url,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(10000)});
   if(response.status!==200)return result(false,`Provider authentication/catalog check failed (HTTP ${response.status}). No model operation was performed.`);
   const data:unknown=await response.json();
   const models=data&&typeof data==='object'&&'data' in data?data.data:null;
   if(!Array.isArray(models)||models.some(m=>!m||typeof m!=='object'||typeof m.id!=='string'))return result(false,'The provider returned an unexpected model catalog. Readiness was not verified.');
   if(!azure&&this.config.modelId&&!models.some(m=>m.id===this.config.modelId))return result(false,'Credentials were accepted, but the selected model was not listed. Review the selected model before enabling this provider.');
   return result(true,azure?'Azure credentials and model catalog verified. This does not verify a deployment or a complete AI operation.':'Credentials and model catalog verified. This does not verify a complete AI operation.');
  }catch(error){return result(false,safeProviderFailure(error));}
 }
}
