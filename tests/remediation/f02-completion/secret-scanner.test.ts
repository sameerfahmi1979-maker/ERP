import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { findSecrets } = require('../../../tooling/security/scan-secrets.cjs') as {
  findSecrets: (text:string, exact?:Array<{name:string;value:string}>)=>Array<{line:number;category:string}>;
};
describe('publication secret scanner', () => {
  it('detects a nonstandard shared secret without exposing its value', () => {
    const value = ['not-a-real', 'credential-for-negative-test'].join('-');
    const hits = findSecrets('INTERNAL_API_SECRET="'+value+'"');
    expect(hits).toEqual([{line:1,category:'LITERAL_SHARED_SECRET'}]);
    expect(JSON.stringify(hits)).not.toContain(value);
  });
  it('detects the historical vendor key format', () => {
    expect(findSecrets('a'.repeat(32)+'.'+'b'.repeat(20))).toEqual([{line:1,category:'ZHIPU_KEY'}]);
  });
  it('allows environment references and clearly synthetic fixtures', () => {
    expect(findSecrets('INTERNAL_API_SECRET="synthetic-ci-only-key"')).toEqual([]);
    expect(findSecrets('const key = process.env.INTERNAL_API_SECRET;')).toEqual([]);
  });
  it('compares private local values without revealing them', () => {
    const value = ['made-up-exact', 'matching-value'].join('-');
    expect(findSecrets('line1\n'+value,[{name:'PRIVATE_LOCAL_VALUE',value}])).toEqual([{line:2,category:'PRIVATE_LOCAL_VALUE'}]);
  });
});
