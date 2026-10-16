import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {OpenAiDmsAdapter} from '@/lib/dms/ai/openai-dms-adapter';
import {AzureDocumentIntelligenceAdapter} from '@/lib/dms/ai/azure-document-intelligence-adapter';
import type {AiProviderConfig} from '@/lib/ai/providers/types';
const m=vi.hoisted(()=>({fetch:vi.fn(),secret:vi.fn()}));
vi.mock('@/lib/settings/resolve-ai-secret',()=>({resolveAiProviderSecret:m.secret}));
const config=(patch:Partial<AiProviderConfig>={}):AiProviderConfig=>({id:43,providerType:'openai',providerName:'F06 offline',configCode:'F06_OFFLINE',purpose:'dms',isEnabled:true,isActive:true,isDefault:false,requiresHumanReview:true,confidenceThreshold:0,secretRef:'F06_FAKE',modelId:'ConfiguredCase',...patch});
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('fetch',m.fetch);m.secret.mockReturnValue('synthetic-only-key');});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it.each(['https://attacker.invalid','http://169.254.169.254'])('DMS configuration rejects %s before credentials',async endpoint=>{
 const adapter=new OpenAiDmsAdapter(config({apiEndpoint:endpoint}));expect(adapter.isConfigured()).toBe(false);
 await expect(adapter.summarize('synthetic','synthetic')).rejects.toThrow(/unsupported/);expect(m.secret).not.toHaveBeenCalled();expect(m.fetch).not.toHaveBeenCalled();
});
it.each(['analyze','summarize','callStructuredCompletion','embedText'] as const)('direct %s cannot bypass disabled configuration',async method=>{
 const adapter=new OpenAiDmsAdapter(config({isEnabled:false}));
 const invoke=()=>method==='analyze'?adapter.analyze({ocrText:'synthetic',typeCandidates:[],metadataFields:[]}):method==='embedText'?adapter.embedText('synthetic'):adapter[method]('synthetic','synthetic');
 await expect(invoke()).rejects.toThrow(/disabled/);expect(m.secret).not.toHaveBeenCalled();expect(m.fetch).not.toHaveBeenCalled();
});
it('OpenAI DMS preserves configured model case and blocks redirects',async()=>{
 m.fetch.mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'Synthetic summary'}}]})));
 const result=await new OpenAiDmsAdapter(config()).summarize('synthetic','synthetic');expect(result.summary).toBe('Synthetic summary');
 const [url,request]=m.fetch.mock.calls[0];expect(url).toBe('https://api.openai.com/v1/chat/completions');expect(request.redirect).toBe('error');expect(JSON.parse(request.body).model).toBe('ConfiguredCase');
});
it('Azure DMS uses the configured deployment, resource and API-key header',async()=>{
 m.fetch.mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'{}'}}]})));
 await new OpenAiDmsAdapter(config({providerType:'azure_openai',apiEndpoint:'https://f06test.openai.azure.com'})).callStructuredCompletion('synthetic','synthetic');
 const [url,request]=m.fetch.mock.calls[0];expect(url).toBe('https://f06test.openai.azure.com/openai/deployments/ConfiguredCase/chat/completions?api-version=2024-10-21');expect(request.headers['api-key']).toBe('synthetic-only-key');expect(request.headers).not.toHaveProperty('Authorization');
});
it('Azure DMS never invents a deployment when none is configured',async()=>{
 const adapter=new OpenAiDmsAdapter(config({providerType:'azure_openai',apiEndpoint:'https://f06test.openai.azure.com',modelId:null}));
 expect(adapter.isConfigured()).toBe(false);await expect(adapter.embedText('synthetic')).rejects.toThrow(/explicit Azure deployment/);expect(m.fetch).not.toHaveBeenCalled();expect(m.secret).not.toHaveBeenCalled();
});
it('DMS response bodies and transport errors do not escape in failure messages',async()=>{
 m.fetch.mockResolvedValueOnce(new Response('synthetic-secret-marker',{status:401})).mockRejectedValueOnce(new Error('synthetic-secret-marker'));
 const adapter=new OpenAiDmsAdapter(config());
 for(let i=0;i<2;i++)await expect(adapter.summarize('synthetic','synthetic')).rejects.not.toThrow('synthetic-secret-marker');
});
it('Azure OCR rejects host suffix spoofing before secret resolution',async()=>{
 const adapter=new AzureDocumentIntelligenceAdapter(config({providerType:'azure_document_intelligence',apiEndpoint:'https://test.cognitiveservices.azure.com.attacker.invalid'}));
 expect(adapter.isConfigured()).toBe(false);expect((await adapter.analyzeWithAzureOcr('U3ludGhldGlj','application/pdf')).success).toBe(false);expect(m.secret).not.toHaveBeenCalled();expect(m.fetch).not.toHaveBeenCalled();
});
it('Azure OCR refuses a cross-origin polling URL without forwarding its key',async()=>{
 m.fetch.mockResolvedValueOnce(new Response(null,{status:202,headers:{'Operation-Location':'https://attacker.invalid/results'}}));
 const result=await new AzureDocumentIntelligenceAdapter(config({providerType:'azure_document_intelligence',apiEndpoint:'https://f06test.cognitiveservices.azure.com',modelId:'prebuilt-read'})).analyzeWithAzureOcr('U3ludGhldGlj','application/pdf');
 expect(result.success).toBe(false);expect(result.error).toMatch(/unsupported polling destination/);expect(m.fetch).toHaveBeenCalledTimes(1);
});
it('Azure OCR only polls the same resource/model with redirects blocked',async()=>{
 vi.useFakeTimers();const root='https://f06test.cognitiveservices.azure.com';
 m.fetch.mockResolvedValueOnce(new Response(null,{status:202,headers:{'Operation-Location':`${root}/documentintelligence/documentModels/prebuilt-read/analyzeResults/f06-test?api-version=2024-11-30`}}))
  .mockResolvedValueOnce(new Response(JSON.stringify({status:'succeeded',analyzeResult:{paragraphs:[{content:'Synthetic text'}]}})));
 const pending=new AzureDocumentIntelligenceAdapter(config({providerType:'azure_document_intelligence',apiEndpoint:root,modelId:'prebuilt-read'})).analyzeWithAzureOcr('U3ludGhldGlj','application/pdf');
 await vi.advanceTimersByTimeAsync(1001);expect(await pending).toEqual({success:true,text:'Synthetic text'});expect(m.fetch).toHaveBeenCalledTimes(2);
 expect(m.fetch.mock.calls.every(([,request])=>request.redirect==='error')).toBe(true);
});
