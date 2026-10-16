import {resolveAiProviderSecret} from '@/lib/settings/resolve-ai-secret';
import {aiEndpoint,providerApiVersion,ProviderConfigurationError,safeProviderFailure} from '@/lib/settings/provider-endpoints';
import type {AiProviderInterface,AiProviderConfig,AiTestConnectionResult} from './types';

export class AzureDocumentIntelligenceProvider implements AiProviderInterface {
 readonly providerType;
 readonly config:AiProviderConfig;
 readonly isEnabled:boolean;
 constructor(config:AiProviderConfig){this.config=config;this.providerType=config.providerType;this.isEnabled=config.isEnabled;}
 async testConnection():Promise<AiTestConnectionResult>{
  const start=Date.now();
  const result=(ok:boolean,message:string):AiTestConnectionResult=>({ok,status:ok?'success':'failed',message,durationMs:Date.now()-start,providerType:this.providerType});
  try{
   if(!this.config.isActive||this.providerType!=='azure_document_intelligence')throw new ProviderConfigurationError('This provider is inactive or unsupported.');
   const endpoint=aiEndpoint(this.providerType,this.config.apiEndpoint);
   const version=providerApiVersion(this.config.apiVersion,'2024-11-30');
   const key=resolveAiProviderSecret(this.config);
   if(!key)return result(false,'Provider credentials are not available. Ask an authorized administrator to review the protected credential configuration.');
   const signal=AbortSignal.timeout(10000);
   for(const path of ['documentintelligence','formrecognizer']){
    const response=await fetch(`${endpoint}/${path}/info?api-version=${version}`,{method:'GET',headers:{'Ocp-Apim-Subscription-Key':key},redirect:'error',signal});
    if(response.status===200){
     const data:unknown=await response.json();
     if(!data||typeof data!=='object'||!('customDocumentModels' in data))return result(false,'The provider returned unexpected resource information. Readiness was not verified.');
     return result(true,'Azure resource authentication verified. OCR processing and the selected model have not been exercised.');
    }
    // Only a missing API path warrants the documented legacy-path fallback.
    if(response.status!==404)return result(false,`Azure resource check failed (HTTP ${response.status}). Review credentials, API version and availability.`);
   }
   return result(false,'Azure resource information was not found. Review the configured resource and supported API version.');
  }catch(error){return result(false,safeProviderFailure(error));}
 }
}
