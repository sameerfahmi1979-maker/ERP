import type {AttendanceRosterRow,EnteredAttendance} from './attendance-workbench-contract';

export type TimesheetFields={site:number|null;start:string;end:string;nextDay:boolean};
export function nextTimesheetDate(date:string){return new Date(Date.parse(date+'T00:00:00Z')+86_400_000).toISOString().slice(0,10);}
export function timesheetStamp(date:string,time:string,nextDay=false){
 if(!time)return '';
 if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Choose a time in hours and minutes.');
 return `${nextDay?nextTimesheetDate(date):date}T${time}:00+04:00`;
}
export function simpleTimesheet(value:EnteredAttendance){return value.intervals.length<=1&&!value.intervals[0]?.breaks.length;}
export function canEditTimesheetRow(row:AttendanceRosterRow){return row.eligible&&!row.approved_leave&&!['approved','locked'].includes(row.approval_status??'');}
export function changeTimesheetTime(value:EnteredAttendance,date:string,field:'start'|'end',time:string,nextDay:boolean):EnteredAttendance{
 if(!simpleTimesheet(value))throw Error('Use More to edit multiple intervals or breaks.');
 const interval=value.intervals[0]??{start:'',end:'',breaks:[]};
 return {...value,intervals:[{...interval,[field]:timesheetStamp(date,time,field==='end'&&nextDay)}]};
}
/** Blank bulk fields never clear data. Existing values change only after the
 * timekeeper selects Replace. Complex intervals remain intact. */
export function applyTimesheetFields(value:EnteredAttendance,date:string,fields:TimesheetFields,replace:boolean):{value:EnteredAttendance;changed:boolean;skippedTimes:boolean}{
 let result=structuredClone(value);let skippedTimes=false;
 if(fields.site!==null&&(replace||result.work_site_id==null))result.work_site_id=fields.site;
 if(fields.start||fields.end){
  if(!simpleTimesheet(value)||['absent','on_leave','holiday'].includes(value.attendance_type))skippedTimes=true;
  else{
   if(fields.start&&(replace||!result.intervals[0]?.start))result=changeTimesheetTime(result,date,'start',fields.start,false);
   if(fields.end&&(replace||!result.intervals[0]?.end))result=changeTimesheetTime(result,date,'end',fields.end,fields.nextDay);
  }
 }
 return{value:result,changed:JSON.stringify(result)!==JSON.stringify(value),skippedTimes};
}
