"use client";
import {readJson} from "./client";
import {timeChoiceResult} from "./hr-time-choices-schema";
type Options={selectedIds?:number[];signal?:AbortSignal};
async function choices(kind:"calendars"|"shifts"|"leave-types",p:Options={},calendarId:number|null=null){
 const selectedIds=p.selectedIds??[],response=await readJson<{success:true;data:unknown}>("hr-time-choices",{kind,calendarId,selectedIds},p.signal),data=timeChoiceResult.parse(response.data);
 if(data.kind!==kind||data.calendarId!==calendarId||JSON.stringify(data.selectedIds)!==JSON.stringify(selectedIds))throw Error("Time choices subject mismatch");return data.rows;
}
export async function getWorkCalendarComboboxOptions(p?:Options){return {success:true as const,data:(await choices("calendars",p)).map(r=>({value:String(r.id),label:`${r.name} (${r.code})`}))};}
export async function listWorkShiftsForTimeTab(calendarId?:number,p?:Options){return {success:true as const,data:(await choices("shifts",p,calendarId??null)).map(r=>({id:r.id,shift_name:r.name,shift_code:r.code,calendar_id:r.calendarId}))};}
export async function listActiveLeaveTypesForForm(p?:Options){return {success:true as const,data:{data:(await choices("leave-types",p)).map(r=>({id:r.id,name_en:r.name,code:r.code}))}};}
