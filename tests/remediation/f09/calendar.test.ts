import { describe, it, expect } from 'vitest';
import { calculateNextRunAt as next } from '@/lib/report-center/schedule-calendar';
describe('F09 calendar', () => {
  it.each([
    ['daily', null, null, '00:05', 'Asia/Dubai', '2026-09-30T19:55:00Z', '2026-09-30T20:05:00.000Z'],
    ['daily', null, null, '00:05', 'Asia/Dubai', '2026-09-30T20:05:00Z', '2026-10-01T20:05:00.000Z'],
    ['weekly', 3, null, '10:00', 'Asia/Dubai', '2026-09-30T05:59:00Z', '2026-09-30T06:00:00.000Z'],
    ['weekly', 3, null, '10:00', 'Asia/Dubai', '2026-09-30T06:00:00Z', '2026-10-07T06:00:00.000Z'],
    ['monthly', null, 31, '09:00', 'UTC', '2027-02-01T00:00:00Z', '2027-02-28T09:00:00.000Z'],
    ['monthly', null, 31, '09:00', 'UTC', '2028-02-01T00:00:00Z', '2028-02-29T09:00:00.000Z'],
    ['monthly', null, 31, '09:00', 'UTC', '2026-12-31T10:00:00Z', '2027-01-31T09:00:00.000Z'],
    ['daily', null, null, '02:30', 'America/New_York', '2026-03-08T00:00:00Z', '2026-03-09T06:30:00.000Z'],
    ['daily', null, null, '01:30', 'America/New_York', '2026-11-01T00:00:00Z', '2026-11-01T05:30:00.000Z'],
    ['daily', null, null, '01:30', 'America/New_York', '2026-11-01T05:30:00Z', '2026-11-02T06:30:00.000Z'],
    ['daily', null, null, '00:15', 'Pacific/Kiritimati', '2026-09-30T10:00:00Z', '2026-09-30T10:15:00.000Z'],
    ['daily', null, null, '07:00', 'Asia/Kathmandu', '2026-09-30T00:00:00Z', '2026-09-30T01:15:00.000Z'],
  ] as const)('%s %s %s %s %s after %s', (f,w,d,t,z,after,want) => {
    expect(next(f,w,d,t,z,new Date(after))).toBe(want);
  });
  it.each(['25:00','12:70','x','07:00:23','-1:00'])('rejects malformed time %s', time => {
    expect(() => next('daily',null,null,time,'UTC')).toThrow();
  });
  it('rejects bad weekday/monthday/zone/reference', () => {
    expect(() => next('weekly',7,null,'09:00','UTC')).toThrow();
    expect(() => next('monthly',null,0,'09:00','UTC')).toThrow();
    expect(() => next('daily',null,null,'09:00','Not/A_Zone')).toThrow();
    expect(() => next('daily',null,null,'09:00','UTC',new Date('bad'))).toThrow();
  });
});
