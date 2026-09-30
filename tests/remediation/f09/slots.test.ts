import { expect,it,vi } from 'vitest';
import { reserveScheduleSlots, type DueScheduleSlot } from '@/lib/report-center/schedule-slots';
const slot:DueScheduleSlot={id:1,frequency:'daily',day_of_week:null,day_of_month:null,time_of_day:'07:00',timezone:'UTC',next_run_at:'2026-09-01T07:00:00Z',updated_at:'2026-09-01T00:00:00Z'};
it('continues past poison schedule and pointer write failure',async()=>{
  const reserve=vi.fn().mockRejectedValueOnce(Error('write failed')).mockResolvedValue(1);
  const result=await reserveScheduleSlots([{...slot,timezone:'invalid-zone'},slot,slot],'one-slot-at-a-time',reserve,new Date('2026-09-30T00:00:00Z'));
  expect(result).toEqual({reserved:1,conflicted:0,invalid:2});
});
it.each([['one-slot-at-a-time','2026-09-02T07:00:00.000Z'],['skip-missed-after-current','2026-09-30T07:00:00.000Z']] as const)('requires explicit catch-up policy %s',async(policy,want)=>{
  const reserve=vi.fn().mockResolvedValue(1);await reserveScheduleSlots([slot],policy,reserve,new Date('2026-09-30T00:00:00Z'));
  expect(reserve.mock.calls[0][1]).toBe(want);
});
it('counts optimistic conflict separately and ignores not-yet-due slots',async()=>{
  const reserve=vi.fn().mockResolvedValue(null);
  expect(await reserveScheduleSlots([slot,{...slot,next_run_at:'2099-01-01T00:00:00Z'}],'one-slot-at-a-time',reserve)).toEqual({reserved:0,conflicted:2,invalid:0});
  expect(reserve).toHaveBeenCalledTimes(1);
});
