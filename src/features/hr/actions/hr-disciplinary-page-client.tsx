"use client";
import{useState}from'react';
import{useQueryClient}from'@tanstack/react-query';
import{AlertTriangle,Eye,Pencil,Trash2,CheckCircle}from'lucide-react';
import{toast}from'sonner';
import{ERPChildDialogForm}from'@/components/erp/erp-child-dialog-form';
import{Badge}from'@/components/ui/badge';
import{Button}from'@/components/ui/button';
import{queryKeys}from'@/lib/query/query-keys';
import{hasPermission}from'@/lib/rbac/scope';
import{invalidateHrEmployeeDisciplinary,invalidateHrEmployeeActions}from'@/lib/query/invalidation';
import{useHrActionInquiry,useHrActionInquiryIdentity,type HrActionInquiryProps}from'@/hooks/use-hr-action-inquiry';
import type{HrActionInquiryRowMap,HrDisciplinaryInquiryDetail as DisciplinaryRow}from'@/lib/reads/hr-action-inquiries-schema';
import{HrActionInquiryTable}from'./hr-action-inquiry-table';
import{HrRecordEditor}from'@/features/hr/employees/hr-record-editor';
import{HrChildRecoveryPanel}from'@/features/hr/employees/hr-child-recovery-panel';
type Props=HrActionInquiryProps;
const SEVERITY_BADGE: Record<string, string> = {
  low:      "bg-muted text-muted-foreground border-border",
  medium:   "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
  high:     "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-800",
  critical: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800",
};

const STATUS_BADGE: Record<string, string> = {
  open:         "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800",
  under_review: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800",
  closed:       "bg-muted text-muted-foreground border-border",
  cancelled:    "bg-muted text-muted-foreground border-border",
};

function label(val: string) {
  return val.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}


function DetailDialog({record,open,canManage,onClose,onEdit}:{record:DisciplinaryRow|null;open:boolean;canManage:boolean;onClose:()=>void;onEdit:()=>void}){
 if(!record)return null;
 const employeeName=record.employee?.full_name_en??`Employee #${record.employee_id}`,employeeCode=record.employee?.employee_code??'';
 return <ERPChildDialogForm open={open} onOpenChange={o=>{if(!o)onClose();}} title="Disciplinary Record Details" subtitle={`${employeeName}${employeeCode?` · ${employeeCode}`:''}`} icon={<AlertTriangle className="h-5 w-5"/>} mode="view" size="lg">
 <div className="space-y-6">
          {/* Header badges */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`text-[11px] font-semibold px-2 py-0.5 border ${SEVERITY_BADGE[record.severity]}`}>
              {label(record.severity)}
            </Badge>
            <Badge variant="outline" className={`text-[11px] font-semibold px-2 py-0.5 border ${STATUS_BADGE[record.status]}`}>
              {label(record.status)}
            </Badge>
            <Badge variant="outline" className="text-[11px] font-semibold px-2 py-0.5 border bg-muted text-foreground border-border">
              {label(record.disciplinary_type)}
            </Badge>
            {record.acknowledged_by_employee && (
              <Badge variant="outline" className="text-[11px] font-semibold px-2 py-0.5 border bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-800">
                Acknowledged
              </Badge>
            )}
            {record.creates_operational_block && (
              <Badge variant="outline" className="text-[11px] font-semibold px-2 py-0.5 border bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800">
                Operational Block
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Subject</p>
              <p className="text-sm font-medium">{record.subject}</p>
            </div>

            <div className="col-span-6">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Record Date</p>
              <p className="text-sm">{record.record_date}</p>
            </div>
            <div className="col-span-6">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Incident Date</p>
              <p className="text-sm">{record.incident_date ?? "—"}</p>
            </div>

            {record.issued_by_profile && (
              <div className="col-span-6">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Issued By</p>
                <p className="text-sm">{record.issued_by_profile.display_name}</p>
              </div>
            )}

            {record.acknowledged_at && (
              <div className="col-span-6">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Acknowledged At</p>
                <p className="text-sm">{new Date(record.acknowledged_at).toLocaleString()}</p>
              </div>
            )}

            {record.description && (
              <div className="col-span-12">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/40 p-3">{record.description}</p>
              </div>
            )}

            {record.action_taken && (
              <div className="col-span-12">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Action Taken</p>
                <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/40 p-3">{record.action_taken}</p>
              </div>
            )}
          </div>

          {canManage && (
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={onEdit} className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" />
                Edit Record
              </Button>
            </div>
          )}
        </div>
 </ERPChildDialogForm>;
}
export function HrDisciplinaryPageClient(props:Props){
 const identity=useHrActionInquiryIdentity('disciplinary',props.authContext);
 return <DisciplinarySession key={identity}{...props} identity={identity}/>;
}
function DisciplinarySession(props:Props&{identity:string}){
 const {authContext}=props,qc=useQueryClient(),read=useHrActionInquiry('disciplinary',props,props.identity);
 const [selectedRecord,setSelectedRecord]=useState<DisciplinaryRow|null>(null),[dialogOpen,setDialogOpen]=useState(false),[mutationDenied,setMutationDenied]=useState(false);
 const [editor,setEditor]=useState<{employeeId:number;id:number;action:'update'|'archive'|'acknowledge'|'correct-acknowledgement'}|null>(null);
 const [selectedCriteria,setSelectedCriteria]=useState(read.criteriaIdentity);
 const ready=!read.busy&&!read.isError&&!read.invalid&&!read.denied&&!mutationDenied;
 if(selectedCriteria!==read.criteriaIdentity){setSelectedCriteria(read.criteriaIdentity);setSelectedRecord(null);setDialogOpen(false);}
 else if(ready&&selectedRecord&&!read.data.some(row=>row.id===selectedRecord.id)){setSelectedRecord(null);setDialogOpen(false);}
 const canManage=!!authContext.profile&&authContext.isAccountActive&&!authContext.profile.must_change_password&&['hr.actions.view','hr.actions.manage','hr.confidential.view','hr.confidential.manage'].every(code=>hasPermission(authContext,code));
 const openRecord=async(record:HrActionInquiryRowMap['disciplinary'])=>{const full=await read.loadDetail(record.id,record.employee_id);if(full){setSelectedRecord(full);setDialogOpen(true);}};
 const openEditor=(record:{id:number;employee_id:number},action:'update'|'archive'|'acknowledge'|'correct-acknowledgement')=>{if(!ready||!canManage)return;setDialogOpen(false);setSelectedRecord(null);setEditor({employeeId:record.employee_id,id:record.id,action});};
 const onDenied=()=>{setMutationDenied(true);const predicate=(q:{queryKey:readonly unknown[]})=>q.queryKey[0]==='hr'&&(q.queryKey[1]==='f11-disciplinary-opening'||q.queryKey[1]==='actions'&&q.queryKey[2]==='global-disciplinary'&&q.queryKey[3]===props.identity);void qc.cancelQueries({predicate});qc.removeQueries({predicate});};
 if(read.denied||mutationDenied)return <p role="alert">HR records are unavailable for this session. Sign in again or refresh after permitted access is restored.</p>;
 return <div className="p-6 space-y-4">
  <div className="flex flex-wrap gap-2 items-center justify-between"><div className="flex items-center gap-3"><AlertTriangle className="h-5 w-5 text-primary"/><div><h1 className="text-xl font-bold tracking-tight">Disciplinary &amp; Warnings</h1><p className="text-muted-foreground text-xs">All employee disciplinary records and warnings.</p></div></div></div>
    <HrActionInquiryTable kind="disciplinary" identity={props.identity} read={read} columns={[
      {id: "employee_name", header: "Employee", accessorFn: item => item.employee?.full_name_en ?? item.employee?.full_name_ar ?? "", enableHiding: false, size: 240,
        cell: ({row: {original: item}}) => <><p className="font-medium truncate">{item.employee?.full_name_en ?? `Employee #${item.employee_id}`}</p><p className="text-muted-foreground truncate font-mono text-[10px]">{item.employee?.employee_code ?? ""}</p></>},
      {id: "subject", header: "Subject", accessorKey: "subject", size: 200},
      {id: "disciplinary_type", header: "Type", accessorFn: item => label(item.disciplinary_type), size: 160},
      {id: "severity", header: "Severity", accessorKey: "severity", size: 160, cell: ({row}) => <Badge variant="outline" className={`text-[10px] font-semibold px-1.5 py-0.5 border ${SEVERITY_BADGE[row.original.severity] ?? "bg-muted text-muted-foreground border-border"}`}>{label(row.original.severity)}</Badge>},
      {id: "status", header: "Status", accessorKey: "status", size: 160, cell: ({row}) => <Badge variant="outline" className={`text-[10px] font-semibold px-1.5 py-0.5 border ${STATUS_BADGE[row.original.status] ?? "bg-muted text-muted-foreground border-border"}`}>{label(row.original.status)}</Badge>},
      {id: "record_date", header: "Date", accessorKey: "record_date", size: 160},
      {id: "actions", header: "Actions", enableSorting: false, size: 200, meta: {exportable: false}, cell: ({row: {original: item}}) => <div className="flex items-center gap-1 justify-end">
        <Button aria-label="View details" size="icon" variant="ghost" className="h-6 w-6" title="View details" disabled={read.detailPending} onClick={() => void openRecord(item)}><Eye className="h-3 w-3" /></Button>
        {canManage && <>{item.acknowledged_by_employee&&<Button aria-label="Correct acknowledgement" size="icon" variant="ghost" className="h-6 w-6" onClick={()=>openEditor(item,"correct-acknowledgement")}><CheckCircle className="h-3 w-3"/></Button>}{!item.acknowledged_by_employee&&<Button aria-label="Record acknowledgement" size="icon" variant="ghost" className="h-6 w-6" onClick={()=>openEditor(item,"acknowledge")}><CheckCircle className="h-3 w-3"/></Button>}<Button aria-label="Edit" size="icon" variant="ghost" className="h-6 w-6" title="Edit" disabled={read.detailPending} onClick={() => openEditor(item, "update")}><Pencil className="h-3 w-3" /></Button>
          <Button aria-label="Archive" size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" title="Archive" onClick={() => openEditor(item, "archive")}><Trash2 className="h-3 w-3" /></Button></>}
      </div>},
    ]} />

 <DetailDialog record={selectedRecord} open={dialogOpen&&ready} canManage={canManage} onClose={()=>{setDialogOpen(false);setSelectedRecord(null);}} onEdit={()=>{if(selectedRecord)openEditor(selectedRecord,'update');}}/>
 {editor&&<HrRecordEditor kind="disciplinary" employeeId={editor.employeeId} authContext={authContext} target={{id:editor.id,action:editor.action}} canDispatch={()=>ready&&canManage} admission={{message:read.isError?'The current inquiry could not be verified. Your draft is retained; retry the list before saving.':'Current list checks are still pending or invalid. Your draft is retained; restore the list before saving.',...(read.isError?{retry:()=>{void read.refetch();}}:{})}} onDenied={onDenied} onClose={()=>setEditor(null)} onSaved={(_receipt,action)=>{
  toast.success(action==='archive'?'Disciplinary record archived':action==='acknowledge'?'Acknowledgement recorded':action==='correct-acknowledgement'?'Acknowledgement corrected':'Disciplinary record saved');
  void qc.invalidateQueries({queryKey:queryKeys.hr.actions.globalDisciplinary()});invalidateHrEmployeeDisciplinary(qc,editor.employeeId);invalidateHrEmployeeActions(qc,editor.employeeId);
 }}/>}
 <HrChildRecoveryPanel authContext={authContext}/>
 </div>;
}
