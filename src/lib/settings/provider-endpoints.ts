/** Pure policy shared by runtime adapters; persisted configuration is untrusted. */
import type {EmailProviderConfig} from '@/lib/email/providers/types';
import type {AiProviderType} from '@/lib/ai/providers/types';

export class ProviderConfigurationError extends Error {}
function reject():never{throw new ProviderConfigurationError('Provider configuration is unsupported. Review the provider type, endpoint and authentication settings.');}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function graphEndpoints(config:EmailProviderConfig){
 if(config.providerType!=='microsoft_graph'||!config.isActive||config.authMode!=='client_credentials'||config.sendMode!=='graph_send_mail'
  ||!uuid.test(config.tenantId??'')||!uuid.test(config.clientId??''))reject();
 const token=`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
 const graph='https://graph.microsoft.com/v1.0';
 if(config.authorityUrl!=null&&config.authorityUrl!==token||config.graphBaseUrl!=null&&config.graphBaseUrl!==graph)reject();
 if(!config.senderEmail||config.senderEmail.length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(config.senderEmail))reject();
 return {token,graph};
}

export function aiEndpoint(type:AiProviderType,value?:string|null):string{
 if(type==='openai'){
  if(value!=null&&!/^https:\/\/api\.openai\.com\/v1\/?$/.test(value))reject();
  return 'https://api.openai.com/v1';
 }
 if(type==='azure_openai'||type==='azure_document_intelligence'){
  const allowed=type==='azure_openai'?/^https:\/\/[a-zA-Z0-9-]+\.openai\.azure\.com\/?$/:/^https:\/\/[a-zA-Z0-9-]+\.cognitiveservices\.azure\.com\/?$/;
  if(!value||!allowed.test(value))reject();
  return value.replace(/\/$/,'');
 }
 if(type==='local_ollama'){
  const endpoint=value??'http://127.0.0.1:11434';
  if(!/^http:\/\/(localhost|127\.0\.0\.1)(:[0-9]{1,5})?\/?$/.test(endpoint))reject();
  try{const url=new URL(endpoint);if(url.port==='0')reject();}catch{reject();}
  return endpoint.replace(/\/$/,'');
 }
 return reject();
}

export function providerApiVersion(value:string|null|undefined,fallback:string):string{
 const version=value??fallback;
 if(!/^\d{4}-\d{2}-\d{2}(-preview)?$/.test(version))reject();
 return version;
}

/** Only messages from our fixed policy errors may leave an adapter. */
export function safeProviderFailure(error:unknown):string{
 return error instanceof ProviderConfigurationError?error.message:'The provider request could not be completed. Review configuration and connectivity, then retry the connection check. External error details are withheld.';
}
