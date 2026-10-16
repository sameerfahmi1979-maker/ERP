import {z} from 'zod';
export const calendarTypes=['standard','ramadan','summer','project','custom'] as const;
export const weekdays=['mon','tue','wed','thu','fri','sat','sun'] as const;
const date=z.iso.date().nullable().optional();
const time=z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/,'Enter a valid time.');
const optionalTime=time.nullable().optional();
const calendarFields=z.object({
 calendar_code:z.string().trim().min(1).max(20),calendar_name:z.string().trim().min(1).max(200),
 calendar_type:z.enum(calendarTypes).default('standard'),owner_company_id:z.number().int().positive().nullable().optional(),
 working_days:z.array(z.enum(weekdays)).default(['mon','tue','wed','thu','fri']),weekend_days:z.array(z.enum(weekdays)).default(['sat','sun']),
 has_ramadan_timing:z.boolean().default(false),has_summer_timing:z.boolean().default(false),
 effective_from:date,effective_to:date,is_active:z.boolean().default(true),notes:z.string().max(2000).nullable().optional(),
});
function calendarRules(value:z.infer<typeof calendarFields>,ctx:z.RefinementCtx){
 for(const field of ['working_days','weekend_days'] as const)if(new Set(value[field]).size!==value[field].length)ctx.addIssue({code:'custom',path:[field],message:'Choose each weekday once.'});
 if(value.working_days.some(d=>value.weekend_days.includes(d)))ctx.addIssue({code:'custom',path:['weekend_days'],message:'Working days and weekend days must not overlap.'});
 if(value.effective_from&&value.effective_to&&value.effective_to<value.effective_from)ctx.addIssue({code:'custom',path:['effective_to'],message:'End date must not be before start date.'});
}
export const createCalendarSchema=calendarFields.superRefine(calendarRules);
// A partial request is checked against the persisted merged record at the DB
// boundary; never compare just the submitted half of a date/weekday interval.
export const updateCalendarSchema=calendarFields.extend({
 calendar_type:calendarFields.shape.calendar_type.removeDefault(),
 working_days:calendarFields.shape.working_days.removeDefault(),weekend_days:calendarFields.shape.weekend_days.removeDefault(),
 has_ramadan_timing:calendarFields.shape.has_ramadan_timing.removeDefault(),has_summer_timing:calendarFields.shape.has_summer_timing.removeDefault(),
 is_active:calendarFields.shape.is_active.removeDefault(),
}).partial().extend({id:z.number().int().positive()});
const shiftFields=z.object({
 shift_code:z.string().trim().min(1).max(20),shift_name:z.string().trim().min(1).max(200),calendar_id:z.number().int().positive(),
 shift_start_time:time,shift_end_time:time,break_start_time:optionalTime,break_end_time:optionalTime,
 total_hours:z.number().gt(0).max(24).nullable().optional(),is_overnight:z.boolean().default(false),
 ramadan_start_time:optionalTime,ramadan_end_time:optionalTime,summer_start_time:optionalTime,summer_end_time:optionalTime,is_active:z.boolean().default(true),
});
function minutes(raw:string){const [h,m,s=0]=raw.split(':').map(Number);return h*60+m+s/60;}
export const createShiftSchema=shiftFields.superRefine((v,ctx)=>{
 const start=minutes(v.shift_start_time),end=minutes(v.shift_end_time),span=(end-start+1440)%1440;
 if(!span||v.is_overnight!==(end<start))ctx.addIssue({code:'custom',path:['shift_end_time'],message:'End time and overnight setting must describe a positive shift.'});
 for(const prefix of ['break','ramadan','summer'] as const){
  const a=v[`${prefix}_start_time`],b=v[`${prefix}_end_time`];
  if(Boolean(a)!==Boolean(b))ctx.addIssue({code:'custom',path:[`${prefix}_end_time`],message:'Enter both start and end times, or leave both empty.'});
  if(a&&b){
   if(minutes(a)===minutes(b))ctx.addIssue({code:'custom',path:[`${prefix}_end_time`],message:'Start and end must differ.'});
   if(prefix==='break'){
    const from=(minutes(a)-start+1440)%1440,to=(minutes(b)-start+1440)%1440;
    if(from>=to||to>span)ctx.addIssue({code:'custom',path:['break_end_time'],message:'The break must fall inside the shift.'});
   }
  }
 }
 if(v.total_hours!=null&&v.total_hours>span/60)ctx.addIssue({code:'custom',path:['total_hours'],message:'Total hours cannot exceed the shift duration.'});
});
export const updateShiftSchema=shiftFields.extend({is_overnight:shiftFields.shape.is_overnight.removeDefault(),is_active:shiftFields.shape.is_active.removeDefault()}).partial().extend({id:z.number().int().positive()});
