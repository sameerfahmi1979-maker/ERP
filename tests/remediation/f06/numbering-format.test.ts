import {describe,expect,it} from 'vitest';
import {formatReference,illustrativeReference} from '@/lib/numbering/format';
const rule={document_prefix:'TEST',format_template:'{DOC}-{SEQ3}',sequence_length:4,padding_character:'0'};
const at=new Date('2026-12-31T23:59:59Z');
describe('canonical numbering formatter',()=>{
  it('grows rather than truncating overflow',()=>expect(formatReference(rule,1000,at)).toBe('TEST-1000'));
  it('uses configured padding for fixed-width tokens',()=>expect(formatReference({...rule,padding_character:'X'},7,at)).toBe('TEST-XX7'));
  it('replaces every repeated supported token',()=>expect(formatReference({...rule,format_template:'{DOC}-{DOC}-{SEQ4}-{SEQ4}'},7,at)).toBe('TEST-TEST-0007-0007'));
  it('shares explicit UTC year/month/day values',()=>{
    const r={...rule,format_template:'{DOC}-{YYYY}{YY}{MM}{DD}-{SEQ}'};
    expect(formatReference(r,1,at)).toBe('TEST-2026261231-0001');
    expect(formatReference(r,1,new Date('2027-01-01T00:00:00Z'))).toBe('TEST-2027270101-0001');
  });
  it.each([0,-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])('rejects unsafe sequence %s',seq=>expect(()=>formatReference(rule,seq,at)).toThrow());
  it('supports bigint without precision loss',()=>expect(formatReference(rule,9007199254740993n,at)).toBe('TEST-9007199254740993'));
  it('reports unavailable instead of exposing unresolved placeholders',()=>expect(illustrativeReference({...rule,format_template:'{BOGUS}',next_sequence_number:1},at)).toMatch(/unavailable/));
});
