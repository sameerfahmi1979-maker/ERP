import {expect,it} from 'vitest';
import {effectiveTimeInput,effectiveTimeValue} from '@/lib/numbering/effective-time';
import {updateNumberingRuleSchema} from '@/features/numbering/numbering-types';
it('displays the stored instant in UTC regardless of its source offset',()=>{
 expect(effectiveTimeInput('2026-10-03T09:30:15+04:00')).toBe('2026-10-03T05:30:15.000');
});
it('preserves stored precision for an unchanged visible instant',()=>{
 const original='2026-10-03T09:30:15.123456+04:00';
 expect(effectiveTimeValue(effectiveTimeInput(original),original)).toBe(original);
});
it('submits a changed minute or second as explicit UTC',()=>{
 expect(effectiveTimeValue('2026-10-03T12:30')).toBe('2026-10-03T12:30:00Z');
 expect(effectiveTimeValue('2026-10-03T12:30:05.125')).toBe('2026-10-03T12:30:05.125Z');
});
it('clears an optional boundary without restoring its old value',()=>{
 expect(effectiveTimeInput(null)).toBe('');expect(effectiveTimeValue('','2026-01-01')).toBe(null);
});
it('does not normalize an impossible calendar date into a different day',()=>{
 const value=effectiveTimeValue('2026-02-30T12:30');
 expect(updateNumberingRuleSchema.safeParse({id:1,effective_from:value}).success).toBe(false);
});
