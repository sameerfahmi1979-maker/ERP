'use client';
import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {ERPCombobox} from '@/components/erp/combobox';
import {TableCell} from '@/components/ui/table';
import type {EnteredAttendance} from '@/lib/hr/attendance-workbench-contract';
import {changeTimesheetTime,simpleTimesheet,type TimesheetFields} from '@/lib/hr/simple-timesheet';
import {TimesheetSiteSelect} from './timesheet-site-select';
import styles from './attendance-workbench.module.css';

type Scope={company:number;date:string;authority:string;disabled:boolean};
const kinds=['site','office','yard','workshop','remote','on_leave','absent','holiday'] as const;
const fullStamp=(value:string)=>value?value+':00+04:00':'';
export function SimpleTimesheetCells({company,date,authority,disabled,code,value,siteLabel,onChange}:Scope&{code:string;value:EnteredAttendance;siteLabel?:string|null;onChange:(value:EnteredAttendance)=>void}){
 const interval=value.intervals[0],simple=simpleTimesheet(value),works=!['absent','on_leave','holiday'].includes(value.attendance_type);
 const overnight=!!interval?.end&&interval.end.slice(0,10)>date;
 const [nextDay,setNextDay]=useState(overnight);
 const endsNextDay=interval?.end?overnight:nextDay;
 return <>
 <TableCell role="cell"><span className={styles.mobileLabel}>Site / location</span><TimesheetSiteSelect company={company}date={date}authority={authority}value={value.work_site_id??null}label={siteLabel}disabled={disabled}ariaLabel={`Site / location ${code}`}onChange={id=>onChange({...value,work_site_id:id})}/></TableCell>
 <TableCell role="cell"><label className={styles.fieldLabel}>Time in<Input type="time"aria-label={`Time in ${code}`}value={interval?.start.slice(11,16)??''}disabled={disabled||!simple||!works}onChange={e=>onChange(changeTimesheetTime(value,date,'start',e.target.value,false))}/></label>{!simple&&<p className="text-xs text-muted-foreground">Multiple intervals or breaks: edit under More.</p>}</TableCell>
 <TableCell role="cell"><label className={styles.fieldLabel}>Time out<Input type="time"aria-label={`Time out ${code}`}value={interval?.end.slice(11,16)??''}disabled={disabled||!simple||!works}onChange={e=>onChange(changeTimesheetTime(value,date,'end',e.target.value,endsNextDay))}/></label>
 <label className={styles.checkbox}><input type="checkbox"aria-label={`Ends next day ${code}`}checked={endsNextDay}disabled={disabled||!simple||!works}onChange={e=>{setNextDay(e.target.checked);if(interval?.end)onChange(changeTimesheetTime(value,date,'end',interval.end.slice(11,16),e.target.checked));}}/>Ends next day</label>
 {overnight&&<p className="text-xs">Out: {interval.end.slice(0,10)}</p>}
 <details className="mt-2"><summary className="cursor-pointer text-primary">More: breaks, notes, work type</summary><div className={styles.notes}>
 <ERPCombobox ariaLabel={`Attendance type ${code}`}value={value.attendance_type}options={kinds.map(kind=>({value:kind,label:kind.replaceAll('_',' ')}))}disabled={disabled}onValueChange={v=>onChange({...value,attendance_type:v as EnteredAttendance['attendance_type']})}/>
 <label>Notes (optional)<Textarea rows={2}aria-label={`Notes ${code}`}value={value.notes??''}maxLength={500}disabled={disabled}onChange={e=>onChange({...value,notes:e.target.value})}/></label>
 {value.intervals.map((part,i)=><div className={styles.interval}key={i}><span className={styles.intervalHeading}>Interval {i+1}</span>{(['start','end'] as const).map(field=><label key={field}>{field==='start'?'In':'Out'}<Input type="datetime-local"aria-label={`Interval ${i+1} ${field} ${code}`}value={part[field].slice(0,16)}disabled={disabled}onChange={e=>onChange({...value,intervals:value.intervals.map((p,n)=>n===i?{...p,[field]:fullStamp(e.target.value)}:p)})}/></label>)}
 {part.breaks.map((pause,j)=><div className={styles.break}key={j}>{(['start','end'] as const).map(field=><label key={field}>Break {field}<Input type="datetime-local"aria-label={`Break ${j+1} ${field} interval ${i+1} ${code}`}value={pause[field].slice(0,16)}disabled={disabled}onChange={e=>onChange({...value,intervals:value.intervals.map((p,n)=>n===i?{...p,breaks:p.breaks.map((b,k)=>k===j?{...b,[field]:fullStamp(e.target.value)}:b)}:p)})}/></label>)}<Button variant="ghost"disabled={disabled}onClick={()=>onChange({...value,intervals:value.intervals.map((p,n)=>n===i?{...p,breaks:p.breaks.filter((_,k)=>k!==j)}:p)})}>Remove break</Button></div>)}
 <div className={styles.actions}><Button variant="ghost"disabled={disabled||part.breaks.length>=4||!part.start||!part.end}onClick={()=>onChange({...value,intervals:value.intervals.map((p,n)=>n===i?{...p,breaks:[...p.breaks,{start:p.start,end:p.start}]}:p)})}>Add break</Button><Button variant="ghost"disabled={disabled}onClick={()=>onChange({...value,intervals:value.intervals.filter((_,n)=>n!==i)})}>Remove interval</Button></div></div>)}
 <Button variant="outline"disabled={disabled||value.intervals.length>=8}onClick={()=>onChange({...value,intervals:[...value.intervals,{start:'',end:'',breaks:[]}]})}>Add interval</Button>
 </div></details></TableCell>
 </>;
}

export function TimesheetBulkFields({company,date,authority,disabled,selected,total,onApply}:Scope&{selected:number;total:number;onApply:(fields:TimesheetFields,replace:boolean,all:boolean)=>void}){
 const[fields,setFields]=useState<TimesheetFields>({site:null,start:'',end:'',nextDay:false}),[replace,setReplace]=useState(false);
 return <fieldset className={styles.filters}disabled={disabled}><legend className="px-2 font-semibold">Apply site and times</legend>
 <div><span className={styles.fieldLabel}>Site / location</span><TimesheetSiteSelect company={company}date={date}authority={authority}value={fields.site}disabled={disabled}ariaLabel="Bulk site / location"onChange={site=>setFields(f=>({...f,site}))}/></div>
 <label>Time in<Input type="time"aria-label="Bulk time in"value={fields.start}onChange={e=>setFields(f=>({...f,start:e.target.value}))}/></label>
 <label>Time out<Input type="time"aria-label="Bulk time out"value={fields.end}onChange={e=>setFields(f=>({...f,end:e.target.value}))}/></label>
 <label className={styles.checkbox}><input type="checkbox"checked={fields.nextDay}onChange={e=>setFields(f=>({...f,nextDay:e.target.checked}))}/>Ends next day</label>
 <div className={styles.filterActions}><label className={styles.checkbox}><input type="checkbox"checked={replace}onChange={e=>setReplace(e.target.checked)}/>Replace existing site/times (otherwise fill blanks only)</label><p className="text-xs text-muted-foreground">Blank fields leave existing values unchanged. Apply prepares drafts; Save changes commits them.</p>
 <Button variant="outline"disabled={disabled||!selected}onClick={()=>onApply(fields,replace,false)}>Apply to selected ({selected})</Button><Button variant="outline"disabled={disabled||!total}onClick={()=>onApply(fields,replace,true)}>{total>500?'Apply to next batch (up to 500)':'Apply to all matching ('+total+')'}</Button></div></fieldset>;
}
