import type{TimeChildKind}from'@/lib/hr/time-child-contract';
export const timeValues:Record<TimeChildKind,Record<string,unknown>>={
 'attendance-summary':{attendance_date:'2026-01-01',attendance_type:'site',total_hours:8,overtime_hours:0,late_minutes:0,early_out_minutes:0,is_missing_punch:false,notes:null},
 'attendance-punch':{punch_datetime:'2026-01-01T22:00:00+04:00',punch_type:'in',punch_source:'manual',notes:null},
 'shift-assignment':{work_calendar_id:null,work_shift_id:null,effective_from:'2026-01-01',effective_to:null,overtime_eligible:false,attendance_required:true,weekly_off_day:null,notes:null},
 'leave-request':{leave_type_id:21,start_date:'2026-01-01',end_date:'2026-01-03',reason:null,notes:null},
 'leave-balance':{leave_type_id:21,leave_year:2026,entitled_days:30,used_days:0,carry_forward:0},
 overtime:{overtime_date:'2026-01-01',hours:2,reason:null,notes:null},
};
