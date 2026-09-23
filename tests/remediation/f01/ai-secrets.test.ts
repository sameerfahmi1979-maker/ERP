import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isAllowedAiSecretReference } from '@/lib/settings/ai-secret-policy';
import { writeAiProviderSecret } from '@/lib/settings/env-file-secrets';
let dir:string;
const root=path.resolve('test-results/remediation/secret-fixtures');
const input={providerType:'openai',providerId:9901,secretRef:'ERP_AI_PROVIDER_9901_KEY',secretValue:'synthetic-key-not-a-provider-credential'};
beforeEach(()=>{
 fs.mkdirSync(root,{recursive:true});
 dir=fs.mkdtempSync(path.join(root,'fixture-env-'));
 vi.spyOn(process,'cwd').mockReturnValue(dir);
 vi.stubEnv('AI_SECRET_FILE_WRITES_ENABLED','true');
 vi.stubEnv(input.secretRef,'synthetic-old');
 fs.writeFileSync(path.join(dir,'.env.local'),'KEEP_SETTING=unchanged\nERP_AI_PROVIDER_9901_KEY=synthetic-old\n');
});
afterEach(()=>{
 vi.restoreAllMocks();vi.unstubAllEnvs();
 // Only files this test generated, under a verified dedicated fixture directory.
 if(path.dirname(dir)!==root||!path.basename(dir).startsWith('fixture-env-'))throw Error('Unsafe fixture cleanup');
 for(const file of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,file));
 fs.rmdirSync(dir);
});
it.each(['INTERNAL_API_SECRET','PDF_PRINT_TOKEN_SECRET','NODE_OPTIONS','SUPABASE_SERVICE_ROLE_KEY','ERP_AI_PROVIDER_9902_KEY'])('rejects out-of-scope key %s before effects',async secretRef=>{
 const before=fs.readFileSync(path.join(dir,'.env.local'),'utf8');const persist=vi.fn();
 expect((await writeAiProviderSecret({...input,secretRef},persist)).success).toBe(false);
 expect(persist).not.toHaveBeenCalled();expect(fs.readFileSync(path.join(dir,'.env.local'),'utf8')).toBe(before);
});
it('allows canonical and provider-specific approved references only',()=>{expect(isAllowedAiSecretReference('openai',9901,'OPENAI_API_KEY')).toBe(true);expect(isAllowedAiSecretReference('tesseract',9901,'OPENAI_API_KEY')).toBe(false);expect(isAllowedAiSecretReference('openai',0,'OPENAI_API_KEY')).toBe(false);});
it.each(['false',undefined])('requires explicit single-process file-write opt-in %s',async setting=>{vi.stubEnv('AI_SECRET_FILE_WRITES_ENABLED',setting);const persist=vi.fn();expect((await writeAiProviderSecret(input,persist)).success).toBe(false);expect(persist).not.toHaveBeenCalled();});
it('valid rotation publishes after metadata success and preserves unrelated settings',async()=>{const result=await writeAiProviderSecret(input,async()=>{expect(process.env[input.secretRef]).toBe('synthetic-old');return true;});expect(result.success).toBe(true);expect(process.env[input.secretRef]).toBe(input.secretValue);expect(fs.readFileSync(path.join(dir,'.env.local'),'utf8')).toContain('KEEP_SETTING=unchanged');});
it.each([false,'throw'])('metadata failure %s restores file and leaves runtime key unchanged',async failure=>{const before=fs.readFileSync(path.join(dir,'.env.local'),'utf8');const r=await writeAiProviderSecret(input,async()=>{if(failure==='throw')throw Error('synthetic transport failure');return false;});expect(r.success).toBe(false);expect(fs.readFileSync(path.join(dir,'.env.local'),'utf8')).toBe(before);expect(process.env[input.secretRef]).toBe('synthetic-old');});
it('concurrent attempt cannot race the file or change metadata',async()=>{fs.writeFileSync(path.join(dir,'.env.local.ai-secret.lock'),'');const persist=vi.fn();expect((await writeAiProviderSecret(input,persist)).success).toBe(false);expect(persist).not.toHaveBeenCalled();});
it.each(['x\nINJECTED=true','https://example.invalid/key','x\rvalue','x\0value','synthetic$OTHER','synthetic"quote','synthetic\\escape'])('rejects malformed secret input',async secretValue=>{const persist=vi.fn();expect((await writeAiProviderSecret({...input,secretValue},persist)).success).toBe(false);expect(persist).not.toHaveBeenCalled();});
