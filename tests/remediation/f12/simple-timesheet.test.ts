import {describe,it,expect} from 'vitest';
import {applyTimesheetFields,changeTimesheetTime,timesheetStamp,canEditTimesheetRow} from '@/lib/hr/simple-timesheet';
import {attendanceRowRequest,type EnteredAttendance,type AttendanceRosterRow} from '@/lib/hr/attendance-workbench-contract';
const date='2026-10-25',blank:EnteredAttendance={attendance_type:'site',intervals:[]};
const fields={site:3,start:'08:00',end:'17:00',nextDay:false};
const current:EnteredAttendance={attendance_type:'office',work_site_id:4,intervals:[{start:timesheetStamp(date,'09:00'),end:timesheetStamp(date,'18:00'),breaks:[]}],notes:'Keep this note'};
describe('simple actual-time entries',()=>{
 it('prepares a blank row with site and times without a reason',()=>{const value=applyTimesheetFields(blank,date,fields,false).value;expect(value.work_site_id).toBe(3);expect(value.intervals[0].start).toContain('08:00:00+04:00');expect(attendanceRowRequest.safeParse({employeeId:1,date,id:null,revision:null,fingerprint:'a'.repeat(64),operation:'11111111-1111-4111-8111-111111111111',values:value}).success).toBe(true);});
 it('fill blanks never replaces existing entries and explicit replace preserves notes',()=>{expect(applyTimesheetFields(current,date,fields,false)).toMatchObject({value:current,changed:false});const r=applyTimesheetFields(current,date,fields,true);expect(r.value.work_site_id).toBe(3);expect(r.value.notes).toBe(current.notes);expect(r.value.intervals[0].end).toContain('17:00:00');expect(current.work_site_id).toBe(4);});
 it('blank bulk fields cannot erase values even with Replace',()=>{expect(applyTimesheetFields(current,date,{site:null,start:'',end:'',nextDay:false},true).value).toEqual(current);});
 it('supports explicit next-day across month/year boundaries',()=>{expect(timesheetStamp('2026-12-31','06:00',true)).toBe('2027-01-01T06:00:00+04:00');});
 it('does not infer overnight time or midnight from an incomplete entry',()=>{const r=changeTimesheetTime(blank,date,'start','22:00',false);expect(r.intervals[0].end).toBe('');expect(changeTimesheetTime(r,date,'end','06:00',false).intervals[0].end.slice(0,10)).toBe(date);});
 it.each(['24:00','08:60','8:00','bad'])('rejects invalid bulk time %s',time=>{expect(()=>timesheetStamp(date,time)).toThrow();});
 it('never flattens multiple intervals or breaks in bulk replacement',()=>{const complex={...current,intervals:[{...current.intervals[0],breaks:[{start:timesheetStamp(date,'12:00'),end:timesheetStamp(date,'13:00')}]}]};const r=applyTimesheetFields(complex,date,fields,true);expect(r.skippedTimes).toBe(true);expect(r.value.intervals).toEqual(complex.intervals);expect(()=>changeTimesheetTime(complex,date,'end','19:00',false)).toThrow();});
 it('does not convert an absence to worked attendance through bulk times',()=>{expect(applyTimesheetFields({...blank,attendance_type:'absent'},date,fields,true)).toMatchObject({skippedTimes:true,value:{attendance_type:'absent',intervals:[]}});});
 it.each([{eligible:false},{approved_leave:true},{approval_status:'locked'},{approval_status:'approved'}])('keeps protected row held %j',override=>{expect(canEditTimesheetRow({eligible:true,approved_leave:false,approval_status:null,...override}as AttendanceRosterRow)).toBe(false);});
});
