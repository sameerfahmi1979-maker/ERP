import type {WorkCalendarRow} from '@/server/actions/common-master-data/work-calendars';
import type {WorkspaceDraftCodec} from '@/hooks/use-workspace-controlled-draft';
import {weekdays} from './calendar-validation';

export function calendarFormState(calendar?: WorkCalendarRow | null) {
  return {
    calendar_code:calendar?.calendar_code??'',calendar_name:calendar?.calendar_name??'',
    calendar_type:calendar?.calendar_type??'standard',owner_company_id:String(calendar?.owner_company_id??''),
    working_days:calendar?.working_days??['mon','tue','wed','thu','fri'],
    effective_from:calendar?.effective_from??'',effective_to:calendar?.effective_to??'',
    has_ramadan_timing:calendar?.has_ramadan_timing??false,has_summer_timing:calendar?.has_summer_timing??false,
    is_active:calendar?.is_active??true,notes:calendar?.notes??'',
  };
}
export type CalendarFormState=ReturnType<typeof calendarFormState>;
export const calendarDraftCodec:WorkspaceDraftCodec<CalendarFormState>={
  encode:value=>Object.fromEntries(Object.entries(value).map(([key,v])=>[key,Array.isArray(v)?v.join(','):String(v)])),
  restore:(initial,read)=>Object.fromEntries(Object.entries(initial).map(([key,value])=>[key,
    Array.isArray(value)?read(key,value.join(',')).split(',').filter(d=>weekdays.some(day=>day===d)):
    typeof value==='boolean'?read(key,String(value))==='true':read(key,value),
  ])) as CalendarFormState,
};
