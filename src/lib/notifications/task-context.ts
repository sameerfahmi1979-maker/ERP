export type NotificationTaskContext={id:number;label:string;section:string;status:string;path:string;token?:string};
export const notificationTaskSources={
 leave:{table:'employee_leave_requests',label:'Leave request',section:'time',status:'approval_status',deleted:true},
 attendance:{table:'employee_attendance_corrections',label:'Attendance correction',section:'time',status:null,deleted:false},
 salary:{table:'employee_salary_revisions',label:'Salary revision',section:'payroll',status:null,deleted:false},
 'payroll-hold':{table:'employee_payroll_holds',label:'Payroll hold',section:'payroll',status:'is_active',deleted:true},
 'employee-request':{table:'employee_approval_requests',label:'Employee approval request',section:'hr-actions',status:'request_status',deleted:true},
 identity:{table:'employee_identity_documents',label:'Identity expiry',section:'compliance',status:'status',deleted:true},
 insurance:{table:'employee_medical_insurances',label:'Insurance expiry',section:'compliance',status:'status',deleted:true},
 interview:{table:'hr_interviews',label:'Interview',section:'interviews',status:'interview_status',deleted:true},
 offer:{table:'hr_offers',label:'Offer',section:'offers',status:'offer_status',deleted:true},
 onboarding:{table:'hr_onboarding_tasks',label:'Onboarding task',section:'onboarding',status:'task_status',deleted:true},
} as const;
