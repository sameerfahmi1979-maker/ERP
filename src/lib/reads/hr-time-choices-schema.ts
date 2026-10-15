import {z} from "zod";
const id=z.number().int().positive().safe();
export const timeChoiceCriteria=z.object({kind:z.enum(["calendars","shifts","leave-types"]),calendarId:id.nullable().default(null),selectedIds:z.array(id).max(2).default([])}).strict()
 .refine(p=>p.kind==="shifts"||p.calendarId===null,"Calendar filter applies only to shifts");
export const timeChoiceRow=z.object({id,name:z.string(),code:z.string(),is_active:z.boolean(),calendarId:id.nullable()}).strict();
export const timeChoiceResult=z.object({kind:z.enum(["calendars","shifts","leave-types"]),calendarId:id.nullable(),selectedIds:z.array(id).max(2),totalCount:z.number().int().min(0).max(2000),rows:z.array(timeChoiceRow).max(2002)}).strict()
 .refine(p=>new Set(p.rows.map(r=>r.id)).size===p.rows.length&&p.rows.filter(r=>r.is_active).length===p.totalCount&&p.rows.every(r=>r.is_active||p.selectedIds.includes(r.id)),"Incomplete time choices")
 .refine(p=>p.rows.every(r=>p.kind==="shifts"?r.calendarId!==null&&(p.calendarId===null||r.calendarId===p.calendarId):r.calendarId===null),"Time choice parent mismatch");
