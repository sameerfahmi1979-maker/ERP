import {describe, expect, it} from 'vitest';
import {createNumberingRuleSchema, updateNumberingRuleSchema} from '@/features/numbering/numbering-types';

const rule = {rule_code:'F06_TEST',rule_name:'Test',module_code:'TEST',module_name:'Test',
  document_type_code:'F06_TEST',document_type_name:'Test',document_prefix:'F06',format_template:'{DOC}-{SEQ4}'};

describe('numbering rule validation',()=>{
  it.each(['{DOC}-{SEQ4}-{BOGUS}','{DOC}-{SEQ4}-{','{DOC}-{SEQ4}-}','{DOC}-{SEQ2}','{DOC}-{{SEQ4}}'])('rejects unsupported/malformed template %s',format_template=>{
    expect(createNumberingRuleSchema.safeParse({...rule,format_template}).success).toBe(false);
    expect(updateNumberingRuleSchema.safeParse({id:1,format_template}).success).toBe(false);
  });
  it('rejects whitespace-only names',()=>expect(createNumberingRuleSchema.safeParse({...rule,rule_name:'  '}).success).toBe(false));
  it('rejects invalid and reversed effective dates',()=>{
    expect(createNumberingRuleSchema.safeParse({...rule,effective_from:'yesterday'}).success).toBe(false);
    expect(createNumberingRuleSchema.safeParse({...rule,effective_from:'2026-12-31',effective_to:'2026-01-01'}).success).toBe(false);
  });
  it('does not offer reuse of an issued number',()=>expect(createNumberingRuleSchema.safeParse({...rule,cancelled_number_policy:'allow_reuse'}).success).toBe(false));
  it('requires a collision-free year/month in reset formats',()=>{
    expect(createNumberingRuleSchema.safeParse({...rule,reset_policy:'monthly'}).success).toBe(false);
    expect(createNumberingRuleSchema.safeParse({...rule,reset_policy:'yearly',format_template:'{DOC}-{YY}-{SEQ4}'}).success).toBe(false);
    expect(createNumberingRuleSchema.safeParse({...rule,reset_policy:'monthly',format_template:'{DOC}-{YYYY}{MM}-{SEQ4}'}).success).toBe(true);
  });
  it('keeps false and does not apply creation defaults to partial updates',()=>{
    expect(updateNumberingRuleSchema.parse({id:1,is_active:false})).toEqual({id:1,is_active:false});
  });
});
