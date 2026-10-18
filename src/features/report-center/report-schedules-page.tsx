"use client";

import { ERPPageHeader } from "@/components/erp/page-header";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  deleteReportSchedule,
  getReportSchedule,
  runReportScheduleNow,
  type ReportSchedule,
} from "@/server/actions/reports/schedules";
import {useCountedTableRead} from '@/hooks/use-counted-table-read';
import {reportSchedulesCriteriaSchema,reportSchedulesPageSchema,type ReportScheduleListRow} from '@/lib/reads/report-schedules-schema';
import type { ColumnDef } from "@tanstack/react-table";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ReportScheduleForm } from "./report-schedule-form";
import { AlgtDialog } from "@/components/design-system/algt-dialog";
import { canEditSchedule, type ScheduleUiAccess } from "@/lib/report-center/schedule-ui-access";
import {scheduleSaveReceiptSchema} from '@/lib/report-center/schedule-save-contract';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';

const STATUS_CONFIG = {
  success: { label: "Success — not inbox confirmation", icon: CheckCircle2, color: "text-emerald-700 dark:text-emerald-300" },
  failed: { label: "Failed", icon: XCircle, color: "text-red-600" },
  skipped: { label: "Skipped", icon: AlertCircle, color: "text-amber-600" },
  cancelled: { label: "Cancelled", icon: AlertCircle, color: "text-slate-500" },
};

export function ReportSchedulesPage({ access,identity }: { access: ScheduleUiAccess;identity:string }) {
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ReportSchedule | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReportScheduleListRow | null>(null);
  const [editingId,setEditingId]=useState<number|null>(null);
  const deleting = useRef(false);
  const removal=useRef<{id:number;contract:WorkspaceSaveContract;unknown:boolean}|null>(null);
  const [removalUnknown,setRemovalUnknown]=useState(false);
  const owner=useRef(false),editingFlight=useRef(false);
  useLayoutEffect(()=>{owner.current=true;return()=>{owner.current=false;};},[]);

  const read=useCountedTableRead({resource:'report-schedules',prefix:['reports','schedules'],identity,allowed:access.profileId!==null,
    defaultSort:[{id:'schedule_name',desc:false}],parseCriteria:input=>{const p=reportSchedulesCriteriaSchema.safeParse(input);return p.success?p.data:null;},parsePage:input=>reportSchedulesPageSchema.parse(input),
    filters:[{id:'frequency',label:'Frequency',type:'select',options:['daily','weekly','monthly'].map(value=>({value,label:value}))},
      {id:'isActive',label:'Active state',type:'select',options:[{value:'active',label:'Active'},{value:'inactive',label:'Inactive'}]},
      {id:'lastStatus',label:'Latest outcome',type:'select',options:[{value:'success',label:'Recorded success (not inbox receipt)'},{value:'failed',label:'Failed'},{value:'skipped',label:'Skipped'},{value:'cancelled',label:'Cancelled'}]}],
  });
  const schedules=read.rows,isLoading=read.busy||editingId!==null,error=read.failed||read.denied;
  const load = read.refresh;
  useEffect(() => { if (error) toast.error("Schedules could not be refreshed. Actions are disabled until a successful refresh."); }, [error]);

  async function handleEdit(row:ReportScheduleListRow){
    if(!owner.current||editingFlight.current||!read.canAct()||!canEditSchedule(access,row))return;
    editingFlight.current=true;setEditingId(row.id);
    try{const r=await getReportSchedule(row.id);if(!owner.current)return;if(!r.success||!r.data||r.data.id!==row.id||!canEditSchedule(access,r.data)){toast.error('The selected schedule could not be verified. Refresh before editing.');return;}setEditingSchedule(r.data);setShowForm(true);}
    catch{if(owner.current)toast.error('Schedule details could not be loaded. No edits were discarded.');}
    finally{editingFlight.current=false;if(owner.current)setEditingId(null);}
  }

  const requestKeys = useRef(new Map<number, string>());
  const runningRequests = useRef(new Set<number>());
  const handleRunNow = async (id: number) => {
    const row = schedules.find(row => row.id === id);
    if (!owner.current || !read.canAct() || error || isLoading || !row || !canEditSchedule(access, row) || runningRequests.current.has(id)) return;
    runningRequests.current.add(id);
    const requestKey = requestKeys.current.get(id) ?? crypto.randomUUID();
    requestKeys.current.set(id, requestKey);
    setRunningId(id);
    try {
      const result = await runReportScheduleNow(id, requestKey);
      if(!owner.current)return;
      if (result.success) {
        requestKeys.current.delete(id);
        toast.success("Report queued. Delivery permissions will be checked before sending.");
      }
      else toast.error(result.error ?? "Run failed.");
    } catch {
      if(owner.current)toast.error("Queue response unavailable. Retry this run to check the same request; do not create a duplicate.");
    } finally {
      runningRequests.current.delete(id);
      if(owner.current){setRunningId(null);load();}
    }
  };

  const handleDelete = async (id: number) => {
    const row = schedules.find(row => row.id === id);
    const recovering=removal.current?.id===id;
    if(!owner.current||deleting.current||(!recovering&&(!read.canAct()||error||isLoading||!row||!canEditSchedule(access,row))))return;
    if(!removal.current){
      const version=row?.workspace_revision,revision=typeof version==='number'?Number.isSafeInteger(version)&&version>0?String(version):null:typeof version==='string'&&/^[1-9]\d*$/.test(version)?version:null;
      if(!revision){toast.error('Refresh the schedule revision before removing it.');return;}
      removal.current={id,contract:{operationId:crypto.randomUUID(),revision},unknown:false};
    }
    const request=removal.current;if(request.id!==id)return;
    deleting.current = true;
    setDeletingId(id);
    try {
      const result = await deleteReportSchedule(id,request.contract);
      if(!owner.current)return;
      const receipt=scheduleSaveReceiptSchema.safeParse(result.data);
      if(result.success&&receipt.success&&receipt.data.id===id){removal.current=null;setRemovalUnknown(false);setDeleteTarget(null);toast.success('Schedule removed. Delivery history is retained.');load();}
      else{request.unknown ||= result.uncertain===true||result.success;setRemovalUnknown(request.unknown);if(!request.unknown)removal.current=null;toast.error(result.error??'Removal receipt incomplete. Retry the unchanged request.');}
    } catch {
      if(owner.current){request.unknown=true;setRemovalUnknown(true);toast.error('Removal unconfirmed. Retry this original operation; it cannot remove another schedule.');}
    } finally {
      if(owner.current)setDeletingId(null);
      deleting.current = false;
    }
  };

  const columns: ColumnDef<ReportScheduleListRow>[] = [
    {
      id: "schedule_name",
      accessorKey: "schedule_name",
      header: "Schedule",
      size: 220,
      cell: ({ row }) => {
        const sched = row.original;
        return (
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">{sched.schedule_name}</div>
            {sched.recipient_to.length > 0 && (
              <div className="text-[10px] text-muted-foreground truncate">
                To: {sched.recipient_to.join(", ")}
              </div>
            )}
          </div>
        );
      },
      meta: { exportValue: (row) => row.schedule_name },
    },
    {
      id: "report",
      enableSorting:false,
      header: "Report",
      size: 170,
      accessorFn: (row) => (row.report as { report_name_en?: string } | undefined)?.report_name_en ?? "",
      cell: ({ row }) => {
        const report = row.original.report as { report_name_en?: string } | undefined;
        return (
          <span className="text-xs text-muted-foreground truncate block">
            {report?.report_name_en ?? "—"}
          </span>
        );
      },
      meta: { exportValue: (row) => (row.report as { report_name_en?: string } | undefined)?.report_name_en ?? "" },
    },
    {
      id: "frequency",
      accessorKey: "frequency",
      header: "Frequency",
      size: 100,
      cell: ({ row }) => (
        <Badge variant="outline" className="text-[10px] font-semibold px-1.5 py-0.5 capitalize">
          {row.original.frequency}
        </Badge>
      ),
      meta: { exportValue: (row) => row.frequency },
    },
    {
      id: "output_format",
      accessorKey: "output_format",
      header: "Format",
      size: 80,
      cell: ({ row }) => (
        <Badge variant="secondary" className="text-[10px] font-mono uppercase px-1.5 py-0.5">
          {row.original.output_format}
        </Badge>
      ),
      meta: { exportValue: (row) => row.output_format },
    },
    {
      id: "next_run_at",
      accessorKey: "next_run_at",
      header: "Next Run",
      size: 130,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.next_run_at
            ? formatDistanceToNow(new Date(row.original.next_run_at), { addSuffix: true })
            : "—"}
        </span>
      ),
      meta: { exportValue: (row) => row.next_run_at ? format(new Date(row.next_run_at), "dd MMM yyyy HH:mm") : "" },
    },
    {
      id: "last_run_at",
      accessorKey: "last_run_at",
      header: "Last Run",
      size: 110,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.last_run_at
            ? format(new Date(row.original.last_run_at), "dd MMM HH:mm")
            : "—"}
        </span>
      ),
      meta: { exportValue: (row) => row.last_run_at ? format(new Date(row.last_run_at), "dd MMM yyyy HH:mm") : "" },
    },
    {
      id: "last_status",
      accessorKey: "last_status",
      header: "Last Status",
      size: 110,
      cell: ({ row }) => {
        const statusCfg = row.original.last_status
          ? STATUS_CONFIG[row.original.last_status as keyof typeof STATUS_CONFIG]
          : null;
        return statusCfg ? (
          <div className={cn("flex items-center gap-1.5 text-xs", statusCfg.color)}>
            <statusCfg.icon className="h-3.5 w-3.5 shrink-0" />
            {statusCfg.label}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Never run
          </span>
        );
      },
      meta: { exportValue: (row) => row.last_status ?? "Never run" },
    },
    {
      id: "is_active",
      accessorKey: "is_active",
      header: "Active",
      size: 80,
      cell: ({ row }) => (
        <Badge
          variant={row.original.is_active ? "default" : "secondary"}
          className="text-[10px] font-semibold px-1.5 py-0.5"
        >
          {row.original.is_active ? "Active" : "Paused"}
        </Badge>
      ),
      meta: { exportValue: (row) => (row.is_active ? "Active" : "Paused") },
    },
    {
      id: "actions",
      header: "",
      size: 100,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const sched = row.original;
        if (!canEditSchedule(access, sched)) return <span className="text-xs text-muted-foreground">View only</span>;
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => handleRunNow(sched.id)}
              disabled={!!error || isLoading || runningId !== null || deletingId !== null}
              title="Run Now"
              aria-label={`Queue ${sched.schedule_name} now`}
            >
              {runningId === sched.id ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => void handleEdit(sched)}
              title="Edit"
              aria-label={`Edit ${sched.schedule_name}`}
              disabled={!!error || isLoading || deletingId !== null || runningId !== null}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => setDeleteTarget(sched)}
              disabled={!!error || isLoading || deletingId !== null || runningId !== null}
              title="Delete"
              aria-label={`Remove ${sched.schedule_name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      },
      meta: { exportable: false },
    },
  ];

  return (
    <>
      <ERPPageHeader
        title="Report Schedules"
        description="Configure automated report delivery on a recurring schedule"
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin" },
          { label: "Report Center", href: "/admin/reports" },
          { label: "Report Schedules" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">{read.totalCount??'—'} permitted schedules</Badge>
            <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", isLoading && "animate-spin")} />
              Refresh
            </Button>
            {(access.globalDelivery || access.deliveryCompanyIds.length > 0) && <Button size="sm" disabled={!!error || isLoading} onClick={() => { setEditingSchedule(null); setShowForm(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Schedule
            </Button>}
          </div>
        }
      />

      <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 border border-border">
        Run now queues a request; it does not confirm inbox delivery. Automatic delivery requires the enabled backend service.
        Times in the list use your browser timezone; each schedule retains its configured timezone.
        Search by schedule name or code and filters cover all permitted records, with server paging. Full wording and filters are loaded only when you open a schedule to edit.
      </div>
      {error && <div role="alert" className="border border-destructive rounded-sm p-3 text-sm">Schedules could not be refreshed. Previously loaded records may be outdated. Use Refresh before taking an action.</div>}

      <div className="rounded-md border border-border overflow-hidden">
        <ERPDataTable presentation="worklist"
          tableId="admin.reports.schedules"
          columns={columns}
          data={schedules}
          serverRead={read.serverRead}
          isLoading={read.busy||error}
          searchPlaceholder="Search schedules..."
          emptyMessage={isLoading ? "Loading schedules..." : "No report schedules configured yet."}
          enableSorting
          enableColumnResizing
          enableRowSelection={false}
          enableColumnVisibility
          enablePreferences
          enableGlobalFilter
          initialPageSize={25}
          pageSizeOptions={[10, 25, 50, 100]}
        />
      </div>

      <ReportScheduleForm
        open={showForm}
        onOpenChange={(open) => { setShowForm(open); if (!open) setEditingSchedule(null); }}
        editing={editingSchedule}
        onSaved={load}
      />
      <AlgtDialog open={!!deleteTarget} onOpenChange={open => { if (!open && !deleting.current&&!removalUnknown) setDeleteTarget(null); }} title="Remove schedule?"
        actions={<><Button variant="outline" disabled={deletingId !== null||removalUnknown} onClick={() => {removal.current=null;setDeleteTarget(null);}}>Keep schedule</Button>
          <Button variant="destructive" disabled={deletingId !== null || (!removalUnknown&&(!!error || isLoading))} onClick={() => { if (deleteTarget) void handleDelete(deleteTarget.id); }}>{removalUnknown?'Reconcile original removal':'Remove schedule'}</Button></>}>
        <p>Remove “{deleteTarget?.schedule_name}” from active schedules? Its delivery history will remain. This does not recall messages already sent or accepted by the provider.</p>
      </AlgtDialog>
    </>
  );
}
