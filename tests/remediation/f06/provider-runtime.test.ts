import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {MicrosoftGraphEmailProvider} from '@/lib/email/providers/microsoft-graph-provider';
import {OpenAiProvider} from '@/lib/ai/providers/openai-provider';
import {AzureDocumentIntelligenceProvider} from '@/lib/ai/providers/azure-document-intelligence-provider';
import {LocalProvider} from '@/lib/ai/providers/local-provider';
import {aiEndpoint,graphEndpoints,providerApiVersion} from '@/lib/settings/provider-endpoints';
import type {EmailProviderConfig} from '@/lib/email/providers/types';
import type {AiProviderConfig} from '@/lib/ai/providers/types';

// All network and secret resolution is doubled. No credential, mailbox or provider is contacted.
const m=vi.hoisted(()=>({fetch:vi.fn(),emailSecret:vi.fn(),aiSecret:vi.fn()}));
vi.mock('@/lib/email/vault',()=>({resolveEmailProviderSecret:m.emailSecret}));
vi.mock('@/lib/settings/resolve-ai-secret',()=>({resolveAiProviderSecret:m.aiSecret}));
const tenant='11111111-1111-4111-8111-111111111111';
const email=(patch:Partial<EmailProviderConfig>={}):EmailProviderConfig=>({id:41,providerCode:'F06_OFFLINE',providerName:'Offline test',providerType:'microsoft_graph',isEnabled:true,isActive:true,isDefault:false,tenantId:tenant,clientId:'22222222-2222-4222-8222-222222222222',secretRef:'F06_FAKE',senderEmail:'sender@example.invalid',authMode:'client_credentials',sendMode:'graph_send_mail',createdAt:'2026-10-03',updatedAt:'2026-10-03',...patch});
const ai=(patch:Partial<AiProviderConfig>={}):AiProviderConfig=>({id:42,configCode:'F06_OFFLINE',providerName:'Offline test',providerType:'openai',purpose:'general',isEnabled:false,isActive:true,isDefault:false,requiresHumanReview:true,confidenceThreshold:0,secretRef:'F06_FAKE',...patch});
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('fetch',m.fetch);m.emailSecret.mockResolvedValue({secret:'synthetic-email-secret',error:null});m.aiSecret.mockReturnValue('synthetic-ai-secret');});
afterEach(()=>vi.unstubAllGlobals());

describe('runtime destination and truthful connection boundary',()=>{
 it('rejects a persisted Graph credential destination before reading secrets or fetching',async()=>{
  const result=await new MicrosoftGraphEmailProvider(email({authorityUrl:'https://attacker.example.invalid/token'})).testConnection();
  expect(result.ok).toBe(false);expect(m.emailSecret).not.toHaveBeenCalled();expect(m.fetch).not.toHaveBeenCalled();
 });
 it('does not call a missing sender mailbox a successful connection',async()=>{
  m.fetch.mockResolvedValueOnce(response({access_token:'synthetic-token'})).mockResolvedValueOnce(response({error:'private'},404));
  const result=await new MicrosoftGraphEmailProvider(email()).testConnection();expect(result.ok).toBe(false);expect(result.message).not.toContain('private');
 });
 it('withholds response bodies and transport exceptions from Graph results',async()=>{
  m.fetch.mockResolvedValue(response({error:'synthetic-secret-marker'},401));
  const denied=await new MicrosoftGraphEmailProvider(email()).testConnection();expect(denied.ok).toBe(false);expect(denied.message).not.toContain('synthetic-secret-marker');
  m.fetch.mockRejectedValue(new Error('synthetic-secret-marker'));
  expect((await new MicrosoftGraphEmailProvider(email()).testConnection()).message).not.toContain('synthetic-secret-marker');
 });
 it('uses the Azure resource API and api-key header, never public OpenAI for Azure keys',async()=>{
  m.fetch.mockResolvedValue(response({data:[]}));
  const result=await new OpenAiProvider(ai({providerType:'azure_openai',apiEndpoint:'https://f06test.openai.azure.com'})).testConnection();
  expect(result.ok).toBe(true);expect(m.fetch).toHaveBeenCalledWith('https://f06test.openai.azure.com/openai/models?api-version=2024-10-21',expect.objectContaining({headers:expect.objectContaining({'api-key':'synthetic-ai-secret'}),redirect:'error',signal:expect.any(AbortSignal)}));
  expect(m.fetch.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
 });
 it('rejects an unapproved OpenAI host before reading credentials',async()=>{
  const result=await new OpenAiProvider(ai({apiEndpoint:'https://api.openai.com.attacker.invalid/v1'})).testConnection();
  expect(result.ok).toBe(false);expect(m.aiSecret).not.toHaveBeenCalled();expect(m.fetch).not.toHaveBeenCalled();
 });
 it('does not claim readiness when an explicitly selected OpenAI model is missing',async()=>{
  m.fetch.mockResolvedValue(response({data:[{id:'available'}]}));
  expect((await new OpenAiProvider(ai({modelId:'missing'})).testConnection()).ok).toBe(false);
 });
 it('rejects non-loopback Ollama and unsupported URLs without issuing a request',async()=>{
  const result=await new LocalProvider(ai({providerType:'local_ollama',apiEndpoint:'http://169.254.169.254'})).testConnection();
  expect(result.ok).toBe(false);expect(m.fetch).not.toHaveBeenCalled();
 });
 it('does not advertise an unexecuted Tesseract check as success',async()=>{
  const result=await new LocalProvider(ai({providerType:'tesseract'})).testConnection();expect(result.ok).toBe(false);expect(result.message).toMatch(/not verified|not available/i);expect(m.fetch).not.toHaveBeenCalled();
 });
 it('disables redirects on Azure health requests and does not retry server failures on another path',async()=>{
  m.fetch.mockResolvedValue(response({error:'private-provider-detail'},500));
  const result=await new AzureDocumentIntelligenceProvider(ai({providerType:'azure_document_intelligence',apiEndpoint:'https://f06test.cognitiveservices.azure.com'})).testConnection();
  expect(result.ok).toBe(false);expect(m.fetch).toHaveBeenCalledTimes(1);expect(m.fetch.mock.calls[0][1].redirect).toBe('error');expect(result.message).not.toContain('private-provider-detail');
 });
});

describe('provider boundary matrix',()=>{
 it.each(['https://api.openai.com@attacker.invalid/v1','http://api.openai.com/v1','https://api.openai.com/v1?key=private','https://api.openai.com:444/v1','https://api.openai.com/v1/../other','https://api.openai.com/v1#private'])('rejects noncanonical OpenAI URL %s',value=>expect(()=>aiEndpoint('openai',value)).toThrow());
 it.each(['http://127.0.0.1:65536','http://127.0.0.1:0','http://127.0.0.1.attacker.invalid:11434','http://2130706433:11434','http://localhost:11434/private'])('rejects unsupported local URL %s',value=>expect(()=>aiEndpoint('local_ollama',value)).toThrow());
 it('accepts only supported canonical destinations and versions',()=>{
  expect(aiEndpoint('openai',null)).toBe('https://api.openai.com/v1');expect(aiEndpoint('local_ollama','http://127.0.0.1:11434/')).toBe('http://127.0.0.1:11434');
  expect(aiEndpoint('azure_document_intelligence','https://f06test.cognitiveservices.azure.com/')).toBe('https://f06test.cognitiveservices.azure.com');
  expect(providerApiVersion('2024-10-21','2024-11-30')).toBe('2024-10-21');expect(()=>providerApiVersion('2024-10-21&key=private','2024-11-30')).toThrow();
  expect(()=>graphEndpoints(email({tenantId:'common'}))).toThrow();expect(()=>graphEndpoints(email({graphBaseUrl:'https://graph.microsoft.com/v1.0/../beta'}))).toThrow();
 });
 it.each([403,404,429,500])('Graph mailbox HTTP %s is not full connection success',async status=>{
  m.fetch.mockResolvedValueOnce(response({access_token:'synthetic-token'})).mockResolvedValueOnce(response({error:'private'},status));
  expect((await new MicrosoftGraphEmailProvider(email()).testConnection()).ok).toBe(false);expect(m.fetch).toHaveBeenCalledTimes(2);
 });
 it('Graph connection success checks response shape and sends no mail',async()=>{
  m.fetch.mockResolvedValueOnce(response({access_token:'synthetic-token'})).mockResolvedValueOnce(response({id:'synthetic-user'}));
  const result=await new MicrosoftGraphEmailProvider(email({isEnabled:false})).testConnection();expect(result.ok).toBe(true);expect(result.message).toMatch(/delivery have not been tested/);
  for(const [,options] of m.fetch.mock.calls){expect(options.redirect).toBe('error');expect(options.signal).toBeInstanceOf(AbortSignal);}
  expect(m.fetch.mock.calls.some(([url])=>url.includes('sendMail'))).toBe(false);
 });
 it('Graph rejects a malformed token before mailbox access',async()=>{
  m.fetch.mockResolvedValue(response({access_token:''}));expect((await new MicrosoftGraphEmailProvider(email()).testConnection()).ok).toBe(false);expect(m.fetch).toHaveBeenCalledTimes(1);
 });
 it('Graph accepts exactly HTTP 202 and never calls it inbox delivery',async()=>{
  m.fetch.mockResolvedValueOnce(response({access_token:'synthetic-token'})).mockResolvedValueOnce(new Response(null,{status:202}));
  const result=await new MicrosoftGraphEmailProvider(email()).sendEmail({to:['recipient@example.invalid'],subject:'offline only',textBody:'synthetic'});
  expect(result.ok).toBe(true);expect(result.status).toBe('sent');expect(result.message).toMatch(/Inbox delivery is not confirmed/);expect(m.fetch).toHaveBeenCalledTimes(2);
 });
 it('Graph interrupted submission never retries or leaks the transport exception',async()=>{
  m.fetch.mockResolvedValueOnce(response({access_token:'synthetic-token'})).mockRejectedValueOnce(new Error('synthetic-secret-marker'));
  const result=await new MicrosoftGraphEmailProvider(email()).sendEmail({to:['recipient@example.invalid'],subject:'offline only',textBody:'synthetic'});
  expect(result.ok).toBe(false);expect(result.message).toMatch(/does not prove the email was unsent/);expect(result.message).not.toContain('synthetic-secret-marker');expect(m.fetch).toHaveBeenCalledTimes(2);
 });
 it('Graph disabled provider cannot send or access secrets',async()=>{
  expect((await new MicrosoftGraphEmailProvider(email({isEnabled:false})).sendEmail({to:[],subject:'offline'})).ok).toBe(false);expect(m.emailSecret).not.toHaveBeenCalled();expect(m.fetch).not.toHaveBeenCalled();
 });
 it('OpenAI malformed JSON and provider response bodies remain safe',async()=>{
  m.fetch.mockResolvedValueOnce(new Response('private-not-json')).mockResolvedValueOnce(response({private:'synthetic-secret-marker'},401));
  expect((await new OpenAiProvider(ai()).testConnection()).message).not.toContain('private-not-json');expect((await new OpenAiProvider(ai()).testConnection()).message).not.toContain('synthetic-secret-marker');
 });
 it('Azure uses a legacy info path only for a 404 and a shared deadline',async()=>{
  m.fetch.mockResolvedValueOnce(response({},404)).mockResolvedValueOnce(response({customDocumentModels:{count:0,limit:10}}));
  const result=await new AzureDocumentIntelligenceProvider(ai({providerType:'azure_document_intelligence',apiEndpoint:'https://f06test.cognitiveservices.azure.com'})).testConnection();
  expect(result.ok).toBe(true);expect(m.fetch.mock.calls[1][0]).toContain('/formrecognizer/info');expect(m.fetch.mock.calls[0][1].signal).toBe(m.fetch.mock.calls[1][1].signal);
 });
 it('local model catalog must contain an explicitly selected model',async()=>{
  m.fetch.mockResolvedValue(response({models:[{name:'test:latest'}]}));
  expect((await new LocalProvider(ai({providerType:'local_ollama',modelId:'test:latest'})).testConnection()).ok).toBe(true);
  expect((await new LocalProvider(ai({providerType:'local_ollama',modelId:'missing'})).testConnection()).ok).toBe(false);
 });
});
