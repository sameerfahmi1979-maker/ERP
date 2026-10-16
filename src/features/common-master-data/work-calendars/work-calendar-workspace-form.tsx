"use client";
import { ValidatedTaskForm } from "@/components/workspace/validated-task-form";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import type { ColumnDef } from "@tanstack/react-table";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Calendar, Clock, PlusCircle, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {AlertDialog,AlertDialogAction,AlertDialogCancel,AlertDialogContent,AlertDialogDescription,AlertDialogFooter,AlertDialogHeader,AlertDialogTitle} from "@/components/ui/alert-dialog";

import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspaceFormNavigation as useWorkspace } from "@/hooks/use-workspace-form-navigation";
import { useWorkspaceFormSection } from "@/hooks/use-workspace-form-section";
import { useWorkspaceControlledDraft } from "@/hooks/use-workspace-controlled-draft";
import {useWorkspaceSaveSession} from "@/hooks/use-workspace-save-session";
import {createSaveAdmission} from "@/lib/workspace/save-admission";
import {calendarFormState,calendarDraftCodec,type CalendarFormState} from "@/lib/master-data/calendar-form-state";
import {createCalendarSchema,createShiftSchema} from "@/lib/master-data/calendar-validation";
import {calendarSaveReceiptSchema} from '@/lib/master-data/calendar-save-receipt';
import {canManageCalendar,canOpenCalendarEditor} from '@/lib/master-data/calendar-permissions';
import {workspaceValidationFailure,reportWorkspaceFieldErrors} from "@/lib/workspace/field-errors";
import {DraftRestoredNotice} from "@/components/workspace/draft-restored-notice";
import {useRouter} from "next/navigation";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";
import { RequiredLabel } from "@/components/erp/required-label";
import {MasterArchivePanel} from '@/features/common-master-data/master-archive-panel';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import {createWorkspaceSaveAttempt} from "@/lib/workspace/save-contract";
import type { WorkCalendarRow } from "@/server/actions/common-master-data/work-calendars";
import { createWorkCalendar, updateWorkCalendar, createWorkShift, updateWorkShift, softDeleteWorkShift, getWorkCalendarById } from "@/server/actions/common-master-data/work-calendars";

const DAYS = ['mon','tue','wed','thu','fri','sat','sun'];
const CAL_TYPES = ['standard','ramadan','summer','project','custom'];

type Props = {
  calendar?: WorkCalendarRow | null;
  mode: "add" | "edit" | "view";
  authContext: AuthContext;
  companies?: { id: number; legal_name_en: string; company_code: string }[];
};

const FORM_ID = "work-calendar-workspace-form";

export function WorkCalendarWorkspaceForm(props:Props){
  return <CalendarFormSession key={`${props.authContext.profile?.id??'none'}:${props.calendar?.id??'new'}:${props.mode}`} {...props}/>;
}
function CalendarFormSession({ calendar, mode, authContext, companies = [] }: Props) {
  const { closeTab, activeTab, markDirty, updateTabRoute, isTabActive } = useWorkspace();
  const router=useRouter();
  const [admission]=useState(createSaveAdmission);
  const saveSession=useWorkspaceSaveSession(FORM_ID,calendar?.id??null,calendar?.workspace_revision);
  const recordId=useRef(saveSession.id);
  const immutableCode=useRef(calendar?.calendar_code??null);
  const [savedId,setSavedId]=useState(saveSession.id);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveUnconfirmed,setSaveUnconfirmed]=useState(false);
  const sections = [
    { id: "basic", label: "Calendar Info", icon: Calendar },
    { id: "shifts", label: "Shifts", icon: Clock },
  ];
  const [activeSection, setActiveSection] = useWorkspaceFormSection(FORM_ID, "basic", sections.map(section => section.id));
  const [shiftDialog, setShiftDialog] = useState<{ open: boolean; editing: Record<string, unknown> | null }>({ open: false, editing: null });
  const [shiftSaving, setShiftSaving] = useState(false);
  const [shiftError, setShiftError] = useState<string | null>(null);
  const [shiftRefreshFailure,setShiftRefreshFailure]=useState(false);
  const [shiftUnconfirmed,setShiftUnconfirmed]=useState(false);
  const shiftAttempt=useRef(createWorkspaceSaveAttempt());
  const shiftPending=useRef<Parameters<typeof createWorkShift>[0]|null>(null);
  const shiftFlight=useRef(false);
  const [removingShift, setRemovingShift] = useState(false);
  const [removeTarget,setRemoveTarget]=useState<number|null>(null);
  const [removeUnconfirmed,setRemoveUnconfirmed]=useState(false);
  const [archiveTaskOpen,setArchiveTaskOpen]=useState(false);
  const [archiveRefreshVersion,setArchiveRefreshVersion]=useState(0);
  const removeFlight = useRef(false);
  const removeAttempts=useRef(new Map<number,{revision:string;attempt:ReturnType<typeof createWorkspaceSaveAttempt>}>());
  const isEditing = savedId !== null;
  const isViewing = mode === "view"||!canOpenCalendarEditor(authContext)||(!!calendar&&!canManageCalendar(authContext,calendar.owner_company_id));
  const disabled = isViewing||isSubmitting||saveUnconfirmed;
  const calendarId = savedId ?? 0;

  const {value:form,setValue:setForm,isDirty,acceptSaved,getCurrent,restoredFromDraft}=useWorkspaceControlledDraft({formId:FORM_ID,initialValue:calendarFormState(calendar),codec:calendarDraftCodec,enabled:!isViewing});
  const field=<K extends keyof CalendarFormState>(key:K,value:CalendarFormState[K])=>setForm(old=>({...old,[key]:value}));
  const workingDays=form.working_days;
  useEffect(() => { if (activeTab?.id) markDirty(activeTab.id, isDirty); }, [isDirty, activeTab?.id, markDirty]);
  const queryClient = useQueryClient();

  const { data: shifts, error: shiftsLoadError, isFetching: shiftsLoading, refetch: reloadShifts } = useQuery({
    queryKey: queryKeys.commonMd.workShifts(calendarId),
    queryFn: async () => {
      if (!calendarId) return [];
      const result = await getWorkCalendarById(calendarId);
      if (!result.success || !result.data) throw new Error("Work shifts could not be loaded.");
      return result.data.shifts ?? [];
    },
    enabled: !!calendarId && activeSection === "shifts",
    initialData: calendar?.shifts,
  });
  const refreshShifts=async()=>{
    try{await queryClient.invalidateQueries({queryKey:queryKeys.commonMd.workShifts(calendarId)});setShiftRefreshFailure(false);}
    catch{setShiftRefreshFailure(true);}
  };


  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (closeAfter=false): Promise<boolean> => {
    if (isViewing || shiftDialog.open || removeTarget!==null || archiveTaskOpen || !admission.enter()) return false;
    setIsSubmitting(true);
    const element=document.getElementById(FORM_ID) as HTMLFormElement|null;
    const submitted=getCurrent();
    let dispatched=false;
    try {
      const parsed=createCalendarSchema.safeParse({...submitted,calendar_code:immutableCode.current??submitted.calendar_code,
        owner_company_id:submitted.owner_company_id?Number(submitted.owner_company_id):null,
        weekend_days:DAYS.filter(d=>!submitted.working_days.includes(d)),
        effective_from:submitted.effective_from||null,effective_to:submitted.effective_to||null,notes:submitted.notes||null});
      if(!parsed.success){setActiveSection('basic');const failure=workspaceValidationFailure(parsed.error.issues);reportWorkspaceFieldErrors(element,failure.fieldErrors);toast.error(failure.error);return false;}
      if(!canManageCalendar(authContext,parsed.data.owner_company_id??null)){
        setActiveSection('basic');reportWorkspaceFieldErrors(element,{owner_company_id:'Choose an organization you are allowed to manage. All Organizations requires global calendar authority.'});
        toast.error('You do not have permission to manage calendars for this organization.');return false;
      }
      const wasNew=recordId.current===null;
      const contract=saveSession.begin(parsed.data);dispatched=true;
      const result=recordId.current!==null
        ?await updateWorkCalendar({...parsed.data,id:recordId.current},contract)
        :await createWorkCalendar(parsed.data,contract);
      if(!result.success&&!result.uncertain)saveSession.rejected();
      if(result.success){
        const receipt=calendarSaveReceiptSchema.safeParse(result.data);
        if(!receipt.success||(recordId.current!==null&&receipt.data.id!==recordId.current)||receipt.data.calendar_id!==null||receipt.data.owner_company_id!==(parsed.data.owner_company_id??null)){
          setSaveUnconfirmed(true);toast.error('Save unconfirmed. Retry the same values to recover its result.');return false;
        }
        const saved=receipt.data;
        saveSession.accept(saved);recordId.current=saved.id;immutableCode.current=parsed.data.calendar_code;setSavedId(saved.id);setSaveUnconfirmed(false);
        const unchanged=acceptSaved(submitted);
        const route=`/admin/common-master-data/work-calendars/record/${saved.id}?mode=edit`;
        try{toast.success(saved.changed===false?'No changes to save':wasNew?'Calendar created':'Calendar updated');}catch{/* Notification failure cannot revoke the acknowledged save. */}
        try{
          await queryClient.invalidateQueries({queryKey:queryKeys.commonMd.workCalendars()});
          if(activeTab){markDirty(activeTab.id,!unchanged);updateTabRoute(activeTab.id,route,saved.id,'edit');}
          if(closeAfter&&unchanged&&activeTab)closeTab(activeTab.id,{force:true});
          else if(wasNew&&activeTab&&isTabActive(activeTab.id))router.replace(route);
        }catch{try{toast.error('Calendar saved, but its display could not refresh. Reopen the list before continuing.');}catch{/* The save remains confirmed even if its warning cannot display. */}}
        return true;
      }
      setSaveUnconfirmed(result.uncertain===true);
      reportWorkspaceFieldErrors(element,result.fieldErrors);
      toast.error(result.error ?? "Failed to save"); return false;
    } catch { if(dispatched)setSaveUnconfirmed(true);toast.error("Save unconfirmed. Retry its unchanged values or reopen the record to reconcile it before saving different data."); return false; }
    finally { admission.leave();setIsSubmitting(false); }
  };

  const handleSaveAndClose = () => handleSave(true);

  const handleSaveShift = async (fd: FormData) => {
    if (!calendarId || isViewing || shiftFlight.current) throw new Error("Shift changes are unavailable.");
    shiftFlight.current=true;
    setShiftError(null);
    setShiftSaving(true);
    const childForm=document.getElementById('work-shift-task-form');
    try {
      const data = shiftPending.current??{
        calendar_id: calendarId,
        shift_code: (shiftDialog.editing?.shift_code as string | undefined) ?? fd.get("shift_code") as string,
        shift_name: fd.get("shift_name") as string,
        shift_start_time: fd.get("shift_start_time") as string,
        shift_end_time: fd.get("shift_end_time") as string,
        break_start_time: (fd.get("break_start_time") as string) || null,
        break_end_time: (fd.get("break_end_time") as string) || null,
        total_hours: fd.get("total_hours") ? Number(fd.get("total_hours")) : null,
        is_overnight: fd.get("is_overnight") === "on",
        ...Object.fromEntries(['ramadan_start_time','ramadan_end_time','summer_start_time','summer_end_time']
          .filter(key=>!shiftDialog.editing||Object.hasOwn(shiftDialog.editing,key))
          .map(key=>[key,(fd.get(key) as string)||null])),
        is_active: fd.get('is_active')==='on',
      };
      if(!shiftPending.current){
        const parsed=createShiftSchema.safeParse(data);
        if(!parsed.success){
          const failure=workspaceValidationFailure(parsed.error.issues);
          // Custom issues in this local schema are fixed, value-free explanations.
          // Retain generic safe feedback for all other validator/server failures.
          for(const issue of parsed.error.issues)if(issue.code==='custom'&&typeof issue.path[0]==='string')failure.fieldErrors[issue.path[0]]=issue.message;
          reportWorkspaceFieldErrors(childForm,failure.fieldErrors);setShiftError(failure.error);return;
        }
      }
      shiftPending.current=data;
      const contract=shiftAttempt.current.begin(data,shiftDialog.editing?String(shiftDialog.editing.workspace_revision):null);
      const result = shiftDialog.editing
        ? await updateWorkShift({ ...data, id: Number(shiftDialog.editing.id) },contract)
        : await createWorkShift(data,contract);
      if(!result.success&&!result.uncertain){shiftAttempt.current.resolved();shiftPending.current=null;}
      const receipt=calendarSaveReceiptSchema.safeParse(result.data);
      if (!result.success || !receipt.success || receipt.data.calendar_id!==calendarId || (shiftDialog.editing&&receipt.data.id!==Number(shiftDialog.editing.id))) {
        setShiftUnconfirmed(result.uncertain===true||result.success);
        reportWorkspaceFieldErrors(childForm,result.fieldErrors);
        setShiftError(result.error??'The shift was not saved. Keep your entries and try again.');return;
      }
      setShiftUnconfirmed(false);
      shiftAttempt.current.resolved();
      shiftPending.current=null;
      try{toast.success(receipt.data.changed===false?'No changes to save':"Shift saved");}catch{/* Continue closing and refreshing the confirmed child task. */}
      setShiftDialog({ open: false, editing: null });
      await refreshShifts();
    } catch {
      setShiftUnconfirmed(true);setShiftError('Save unconfirmed. Retry the same values.');
    } finally { shiftFlight.current=false;setShiftSaving(false); }
  };

  const handleRemoveShift = async (id: number) => {
    if (isViewing || removeFlight.current) return;
    removeFlight.current = true;
    setRemovingShift(true);
    setShiftError(null);
    try {
      let pending=removeAttempts.current.get(id);
      if(!pending){
        const row=shifts?.find(s=>s.id===id);
        pending={revision:String(row?.workspace_revision),attempt:createWorkspaceSaveAttempt()};removeAttempts.current.set(id,pending);
      }
      const result = await softDeleteWorkShift(id, calendarId,pending.attempt.begin({id,archived:true},pending.revision));
      if(result.success||!result.uncertain)removeAttempts.current.delete(id);
      setRemoveUnconfirmed(result.uncertain===true);
      if (!result.success) { setShiftError(result.error??"The shift was not removed. Check your access and try again."); return; }
      setRemoveTarget(null);
      setArchiveRefreshVersion(value=>value+1);
      try{toast.success(result.changed===false?'Shift already archived':'Shift archived; history retained');}catch{/* The removal receipt is already acknowledged. */}
      await refreshShifts();
    } catch { setRemoveUnconfirmed(true);setShiftError("Removal could not be confirmed. Retry the same removal to recover its result safely."); }
    finally { removeFlight.current = false; setRemovingShift(false); }
  };

  const shiftColumns: ColumnDef<NonNullable<WorkCalendarRow["shifts"]>[number]>[] = [
{accessorKey:"shift_name",header:"Shift"},{accessorKey:"shift_code",header:"Code"}, {accessorKey:"shift_start_time",header:"Start"}, {accessorKey:"shift_end_time",header:"End"}, {accessorKey:"is_overnight",header:"Overnight"}, {accessorKey:"is_active",header:"Active"},
{id:"actions",header:"Actions",enableSorting:false,enableHiding:false,cell:({row})=>disabled?null:<div className="flex"><Button type="button" disabled={removingShift || shiftSaving || shiftDialog.open || removeUnconfirmed} aria-label="Edit shift" variant="ghost" onClick={()=>{setShiftError(null);setShiftDialog({open:true,editing:row.original as unknown as Record<string,unknown>});}}><Pencil className="h-4 w-4"/></Button><Button type="button" disabled={removingShift || shiftSaving || shiftDialog.open || removeUnconfirmed} aria-label="Remove shift" variant="ghost" onClick={()=>{setShiftError(null);setRemoveTarget(row.original.id);}}><Trash2 className="h-4 w-4"/></Button></div>}];

  const toggleDay = (day: string) => {
    field('working_days',workingDays.includes(day)?workingDays.filter(d=>d!==day):[...workingDays,day]);
  };

  return (
    <><ERPRecordWorkspaceForm
      mode={isViewing?'view':isEditing?'edit':'add'}
      title={isViewing ? "View Work Calendar" : isEditing ? "Edit Work Calendar" : "New Work Calendar"}
      subtitle={calendar ? `${calendar.calendar_name} (${calendar.calendar_code})` : "Create a new work calendar"}
      recordCode={calendar?.calendar_code}
      headerActions={mode==='view'&&calendar&&canManageCalendar(authContext,calendar.owner_company_id)?<Button type="button" size="sm" onClick={()=>{
        const route=`/admin/common-master-data/work-calendars/record/${calendar.id}?mode=edit`;
        if(activeTab)updateTabRoute(activeTab.id,route,calendar.id,'edit');router.replace(route);
      }}>Edit calendar</Button>:undefined}
      sections={sections}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      isDirty={isDirty}
      onSave={isViewing ? undefined : () => handleSave()}
      onSaveAndClose={isViewing ? undefined : handleSaveAndClose}
      onRequestClose={handleRequestClose}
      isSubmitting={isSubmitting}
      isInlineTaskOpen={shiftDialog.open||shiftSaving}
      isChildDialogOpen={removeTarget!==null||archiveTaskOpen}
    >
      <form id={FORM_ID} onSubmit={(e) => { e.preventDefault(); void handleSave(); }}>
        <DraftRestoredNotice visible={!isViewing&&restoredFromDraft}/>
        {saveUnconfirmed&&<p role="status" className="mb-4 text-sm text-muted-foreground">The last calendar save is unconfirmed. Click Save again to recover its result without creating another record.</p>}
        <ERPRecordSectionPanel id="basic" activeId={activeSection} title="Calendar Details">
          {isEditing&&<p className="mb-4 text-sm text-muted-foreground">Once employees have been assigned to this calendar or one of its shifts, schedule rules are retained for history. Create a new calendar for different rules; names and notes can still be corrected.</p>}
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 sm:col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="calendar_code">Calendar Code</RequiredLabel>
              <Input id="calendar_code" name="calendar_code" className="uppercase" value={form.calendar_code} onChange={e=>field('calendar_code',e.target.value)} disabled={disabled || isEditing || isSubmitting} required maxLength={20}/>
            </div>
            <div className="col-span-12 sm:col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="calendar_name">Calendar Name</RequiredLabel>
              <Input id="calendar_name" name="calendar_name" value={form.calendar_name} onChange={e=>field('calendar_name',e.target.value)} disabled={disabled} required maxLength={200}/>
            </div>
            <div className="col-span-12 sm:col-span-6 space-y-1.5">
              <Label htmlFor="calendar_type" className="text-muted-foreground text-xs">Calendar Type</Label>
              <select id="calendar_type" name="calendar_type" value={form.calendar_type} onChange={e=>field('calendar_type',e.target.value)} disabled={disabled} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                {CAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-12 sm:col-span-6 space-y-1.5">
              <Label htmlFor="owner_company_id" className="text-muted-foreground text-xs">Organization</Label>
              <select id="owner_company_id" name="owner_company_id" value={form.owner_company_id} onChange={e=>field('owner_company_id',e.target.value)} disabled={disabled||isEditing||isSubmitting} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                <option value="" disabled={!canManageCalendar(authContext,null)}>All Organizations</option>
                {companies.map(c => <option key={c.id} value={c.id} disabled={!canManageCalendar(authContext,c.id)}>{c.legal_name_en}</option>)}
                {calendar?.owner_company_id&&!companies.some(c=>c.id===calendar.owner_company_id)&&<option value={calendar.owner_company_id} disabled>{calendar.owner_company?.legal_name_en??'Unavailable organization'} (retained selection)</option>}
              </select>
            </div>
            <div className="col-span-12 space-y-2">
              <Label className="text-muted-foreground text-xs">Working Days</Label>
              <div className="flex gap-2 flex-wrap">
                {DAYS.map(day => (
                  <button key={day} type="button" aria-pressed={workingDays.includes(day)} disabled={disabled} onClick={() => !disabled && toggleDay(day)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${workingDays.includes(day) ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-input"} ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}>
                    {day.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="col-span-12 sm:col-span-6 space-y-1.5">
              <Label htmlFor="effective_from" className="text-muted-foreground text-xs">Effective From</Label>
              <Input type="date" id="effective_from" name="effective_from" value={form.effective_from} onChange={e=>field('effective_from',e.target.value)} disabled={disabled} />
            </div>
            <div className="col-span-12 sm:col-span-6 space-y-1.5">
              <Label htmlFor="effective_to" className="text-muted-foreground text-xs">Effective To</Label>
              <Input type="date" id="effective_to" name="effective_to" value={form.effective_to} onChange={e=>field('effective_to',e.target.value)} disabled={disabled} />
            </div>
            <div className="col-span-12 grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { id: "has_ramadan_timing" as const, label: "Has Ramadan Timing" },
                { id: "has_summer_timing" as const, label: "Has Summer Timing" },
                { id: "is_active" as const, label: "Active" },
              ].map(f => (
                <div key={f.id} className="flex items-center space-x-2">
                  <Checkbox id={f.id} name={f.id} checked={form[f.id]} onCheckedChange={checked=>field(f.id,checked===true)} disabled={disabled} />
                  <Label htmlFor={f.id} className="text-xs cursor-pointer">{f.label}</Label>
                </div>
              ))}
            </div>
            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="notes" className="text-muted-foreground text-xs">Notes</Label>
              <Textarea id="notes" name="notes" value={form.notes} onChange={e=>field('notes',e.target.value)} rows={3} maxLength={2000} disabled={disabled} />
            </div>
          </div>
        </ERPRecordSectionPanel>
      </form>

      <ERPRecordSectionPanel id="shifts" activeId={activeSection} title="Work Shifts">
        {!calendarId ? (
          <p className="text-sm text-muted-foreground">Save the calendar first to manage shifts.</p>
        ) : (
          <div className="space-y-3">
            {!disabled && (
              <div className="flex justify-end">
                <Button size="sm" variant="outline" disabled={shiftDialog.open||removingShift||removeUnconfirmed} onClick={() => {setShiftError(null);setShiftDialog({ open: true, editing: null });}}>
                  <PlusCircle className="h-4 w-4 mr-1" /> Add Shift
                </Button>
              </div>
            )}
            {(shiftsLoadError||shiftRefreshFailure) && <div role="alert" className="text-sm text-destructive">Work shifts could not be refreshed. Previously loaded rows may be out of date. <Button type="button" variant="outline" size="sm" disabled={shiftsLoading} onClick={()=>void reloadShifts().then(result=>{if(!result.error)setShiftRefreshFailure(false);})}>Retry shifts</Button></div>}
            {shiftError && removeTarget===null && <p role="alert" className="text-sm text-destructive">{shiftError}</p>}
            <ERPDataTable tableId={`calendar.shifts:${calendarId}`} resultsLabel="Work shifts" data={(shifts ?? []).filter(s=>!s.deleted_at)} columns={shiftColumns} enableRowSelection={false}/>
            {!isViewing&&<MasterArchivePanel key={`${authContext.profile?.id}:${calendarId}`} entity="work_shifts" calendarId={calendarId} title="Archived shifts" disabled={disabled||isDirty||shiftDialog.open||removingShift||removeUnconfirmed} onRestored={refreshShifts} onTaskOpenChange={setArchiveTaskOpen} refreshVersion={archiveRefreshVersion}/>}
            {shiftDialog.open && (
              <ValidatedTaskForm id="work-shift-task-form" key={String(shiftDialog.editing?.id ?? "new")} onSubmit={handleSaveShift} className="mt-4 border rounded-md p-4 space-y-3 bg-muted/30">
                <p className="text-sm font-medium">{shiftDialog.editing ? "Edit Shift" : "Add Shift"}</p>
                <p className="text-sm text-muted-foreground">Finish or cancel this shift before leaving the calendar. Unsaved shift entries are not retained after a page reload.</p>
                <fieldset disabled={shiftSaving||shiftUnconfirmed} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1"><Label htmlFor="s_code" className="text-xs">Shift Code *</Label><Input id="s_code" name="shift_code" defaultValue={(shiftDialog.editing?.shift_code as string) ?? ""} disabled={!!shiftDialog.editing} required maxLength={20}/></div>
                  <div className="space-y-1"><Label htmlFor="s_name" className="text-xs">Shift Name *</Label><Input id="s_name" name="shift_name" defaultValue={(shiftDialog.editing?.shift_name as string) ?? ""} required /></div>
                  <div className="space-y-1"><Label htmlFor="s_start" className="text-xs">Start Time *</Label><Input type="time" step="any" id="s_start" name="shift_start_time" defaultValue={(shiftDialog.editing?.shift_start_time as string) ?? ""} required /></div>
                  <div className="space-y-1"><Label htmlFor="s_end" className="text-xs">End Time *</Label><Input type="time" step="any" id="s_end" name="shift_end_time" defaultValue={(shiftDialog.editing?.shift_end_time as string) ?? ""} required /></div>
                  <div className="space-y-1"><Label htmlFor="s_brk_start" className="text-xs">Break Start</Label><Input type="time" step="any" id="s_brk_start" name="break_start_time" defaultValue={(shiftDialog.editing?.break_start_time as string) ?? ""} /></div>
                  <div className="space-y-1"><Label htmlFor="s_brk_end" className="text-xs">Break End</Label><Input type="time" step="any" id="s_brk_end" name="break_end_time" defaultValue={(shiftDialog.editing?.break_end_time as string) ?? ""} /></div>
                  <div className="space-y-1"><Label htmlFor="s_hours" className="text-xs">Total Hours</Label><Input type="number" step="any" min="0" max="24" id="s_hours" name="total_hours" defaultValue={(shiftDialog.editing?.total_hours as string) ?? ""} /></div>
                  <div className="flex items-center gap-2 pt-4"><Checkbox id="s_overnight" name="is_overnight" defaultChecked={(shiftDialog.editing?.is_overnight as boolean) ?? false} /><Label htmlFor="s_overnight" className="text-xs">Overnight Shift</Label></div>
                  <div className="flex items-center gap-2"><Checkbox id="s_active" name="is_active" defaultChecked={(shiftDialog.editing?.is_active as boolean)??true}/><Label htmlFor="s_active" className="text-xs">Shift active</Label></div>
                  <p className="sm:col-span-2 text-sm text-muted-foreground">Optional seasonal timings: enter both endpoints or leave both empty. End before start means overnight. These settings do not define season dates or automatically recalculate historical attendance.</p>
                  {shiftDialog.editing&&<p className="sm:col-span-2 text-sm text-muted-foreground">If this shift has employee assignment history, create a new shift to change its working times. Existing assignments and attendance will remain unchanged.</p>}
                  {(['ramadan','summer'] as const).flatMap(season=>(['start','end'] as const).map(endpoint=>{
                    const key=`${season}_${endpoint}_time`,id=`s_${key}`,missing=!!shiftDialog.editing&&!Object.hasOwn(shiftDialog.editing,key);
                    return <div key={key} className="space-y-1"><Label htmlFor={id} className="text-xs">{season==='ramadan'?'Ramadan':'Summer'} {endpoint}</Label><Input type="time" step="any" id={id} name={key} defaultValue={(shiftDialog.editing?.[key] as string)??''} disabled={missing}/>{missing&&<p className="text-xs text-muted-foreground">Current value unavailable. It will remain unchanged.</p>}</div>;
                  }))}
                </fieldset>
                <div className="flex justify-end gap-2">
                  <Button type="button" size="sm" variant="ghost" disabled={shiftSaving||shiftUnconfirmed} onClick={() => {shiftAttempt.current.resolved();shiftPending.current=null;setShiftError(null);setShiftDialog({ open: false, editing: null });}}>Cancel</Button>
                  <Button type="submit" size="sm" disabled={shiftSaving}>{shiftSaving ? "Saving..." : "Save Shift"}</Button>
                </div>
              </ValidatedTaskForm>
            )}
          </div>
        )}
      </ERPRecordSectionPanel>
    </ERPRecordWorkspaceForm>
    <AlertDialog open={removeTarget!==null} onOpenChange={open=>{if(!open&&!removingShift&&!removeUnconfirmed)setRemoveTarget(null);}}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Archive work shift</AlertDialogTitle><AlertDialogDescription>
          Archive {shifts?.find(shift=>shift.id===removeTarget)?.shift_name??'this shift'}? Its history is retained. Referenced shifts cannot be archived until their linked records are resolved.
        </AlertDialogDescription></AlertDialogHeader>
        {shiftError&&<p role="alert" className="text-sm text-destructive">{shiftError}</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={removingShift||removeUnconfirmed}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={removingShift} onClick={event=>{event.preventDefault();if(removeTarget!==null)void handleRemoveShift(removeTarget);}}>{removingShift?'Archiving…':'Archive shift'}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog></>
  );
}
