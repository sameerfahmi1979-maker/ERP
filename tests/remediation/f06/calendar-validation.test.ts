import {expect,it} from 'vitest';
import {createCalendarSchema,createShiftSchema,updateCalendarSchema,updateShiftSchema} from '@/lib/master-data/calendar-validation';
const calendar={calendar_code:'TEST',calendar_name:'Synthetic',working_days:['mon'],weekend_days:['sat','sun']};
const shift={shift_code:'TEST',shift_name:'Synthetic',calendar_id:1,shift_start_time:'08:00',shift_end_time:'17:00',total_hours:8};
it('partial calendar edits do not reapply creation defaults',()=>{expect(updateCalendarSchema.parse({id:1,notes:'Only notes'})).toEqual({id:1,notes:'Only notes'});});
it('partial shift edits do not reapply active/overnight defaults',()=>{expect(updateShiftSchema.parse({id:1,shift_name:'Renamed'})).toEqual({id:1,shift_name:'Renamed'});});
it('preserves false and trims meaningful calendar identity',()=>{const r=createCalendarSchema.parse({...calendar,calendar_name:' Synthetic ',is_active:false});expect(r.is_active).toBe(false);expect(r.calendar_name).toBe('Synthetic');});
for(const patch of [{working_days:['funday']},{working_days:['mon','mon']},{weekend_days:['mon']},{calendar_name:'   '},{effective_from:'2026-02-30'},{effective_from:'2026-12-31',effective_to:'2026-01-01'}])it(`rejects calendar ${JSON.stringify(patch)}`,()=>{expect(createCalendarSchema.safeParse({...calendar,...patch}).success).toBe(false);});
for(const patch of [{shift_name:'  '},{total_hours:-1},{total_hours:0},{total_hours:10},{shift_start_time:'30:00'},{shift_end_time:'08:00'},{shift_end_time:'06:00'},{is_overnight:true},{break_start_time:'12:00'},{break_start_time:'07:00',break_end_time:'09:00'},{ramadan_start_time:'08:00',ramadan_end_time:'08:00'}])it(`rejects shift ${JSON.stringify(patch)}`,()=>{expect(createShiftSchema.safeParse({...shift,...patch}).success).toBe(false);});
it('accepts a coherent overnight shift and break after midnight',()=>{expect(createShiftSchema.safeParse({...shift,shift_start_time:'22:00',shift_end_time:'06:00',is_overnight:true,break_start_time:'02:00',break_end_time:'02:30',total_hours:7.5}).success).toBe(true);});
it('accepts an ordinary shift with no optional hours',()=>{expect(createShiftSchema.safeParse({...shift,total_hours:null}).success).toBe(true);});
it.each(['ramadan','summer'] as const)('rejects numerically equal %s endpoints with different precision',prefix=>{
 expect(createShiftSchema.safeParse({...shift,[`${prefix}_start_time`]:'08:00',[`${prefix}_end_time`]:'08:00:00.000000'}).success).toBe(false);
});
it.each(['ramadan','summer'] as const)('accepts a coherent overnight %s alternate without inventing season dates',prefix=>{
 expect(createShiftSchema.safeParse({...shift,[`${prefix}_start_time`]:'22:00:00.5',[`${prefix}_end_time`]:'04:00:00.5'}).success).toBe(true);
});
