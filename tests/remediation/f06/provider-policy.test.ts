import {expect,it} from 'vitest';
import {aiProviderCreateSchema,aiProviderUpdateSchema} from '@/lib/settings/provider-configuration';
import {aiEndpoint} from '@/lib/settings/provider-endpoints';
const base={config_code:'F06_POLICY',provider_name:'Synthetic',purpose:'general',provider_type:'openai',is_enabled:false};
for(const [type,url,valid] of [
 ['openai','https://api.openai.com/v1',true],['openai','https://api.openai.com/v1/',true],['openai','https://api.openai.com.attacker.invalid/v1',false],
 ['azure_openai','https://f06.openai.azure.com/',true],['azure_document_intelligence','https://f06.cognitiveservices.azure.com',true],
 ['azure_openai','https://f06.openai.azure.com/openai/deployments/test',false],['azure_openai','https://secret@f06.openai.azure.com',false],
 ['local_ollama','http://127.0.0.1:65535',true],['local_ollama','http://localhost:1/',true],['local_ollama','http://127.0.0.1:0',false],
 ['local_ollama','http://127.0.0.1:65536',false],['local_ollama','http://127.0.0.1:99999',false],['local_ollama','http://169.254.169.254',false],
] as const)it(`${type}: save and runtime agree on ${url}`,()=>{
 expect(aiProviderCreateSchema.safeParse({...base,provider_type:type,api_endpoint:url}).success).toBe(valid);
 if(valid)expect(()=>aiEndpoint(type,url)).not.toThrow();else expect(()=>aiEndpoint(type,url)).toThrow();
});
for(const version of ['2024-10-21','2025-01-01-preview',null])it(`allows version ${version}`,()=>expect(aiProviderCreateSchema.safeParse({...base,api_version:version}).success).toBe(true));
for(const version of ['latest','2024-1-1','2024-10-21&private=value',''])it(`rejects malformed version ${version} on create and partial edit`,()=>{
 expect(aiProviderCreateSchema.safeParse({...base,api_version:version}).success).toBe(false);expect(aiProviderUpdateSchema.safeParse({id:1,api_version:version}).success).toBe(false);
});
it('allows an incomplete disabled Azure draft but requires endpoint before enabling',()=>{
 expect(aiProviderCreateSchema.safeParse({...base,provider_type:'azure_openai',api_endpoint:null}).success).toBe(true);
 expect(aiProviderCreateSchema.safeParse({...base,provider_type:'azure_openai',is_enabled:true}).success).toBe(false);
});
it('unimplemented adapters may be stored disabled but not advertised as enabled',()=>{
 for(const provider_type of ['google_document_ai','aws_textract','local_custom']){
  expect(aiProviderCreateSchema.safeParse({...base,provider_type}).success).toBe(true);
  expect(aiProviderCreateSchema.safeParse({...base,provider_type,is_enabled:true}).success).toBe(false);
 }
});
