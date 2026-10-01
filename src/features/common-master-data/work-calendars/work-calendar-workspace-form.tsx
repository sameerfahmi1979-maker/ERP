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

import type { AuthContext } from "@/lib/rbac/check";
import { useWorkspaceFormNavigation as useWorkspace } from "@/hooks/use-workspace-form-navigation";
import { useWorkspaceFormSection } from "@/hooks/use-workspace-form-section";
import { useWorkspaceFormDirty as useFormDirty } from "@/hooks/use-workspace-form-dirty";
import { useWorkspaceFormDraft } from "@/hooks/use-workspace-form-draft";
import { ERPRecordWorkspaceForm, ERPRecordSectionPanel } from "@/components/workspace/erp-record-workspace-form";
import { RequiredLabel } from "@/components/erp/required-label";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
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

export function WorkCalendarWorkspaceForm({ calendar, mode, companies = [] }: Props) {
  const { closeTab, activeTab, markDirty, forceCloseActiveTab } = useWorkspace();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sections = [
    { id: "basic", label: "Calendar Info", icon: Calendar },
    { id: "shifts", label: "Shifts", icon: Clock },
  ];
  const [activeSection, setActiveSection] = useWorkspaceFormSection(FORM_ID, "basic", sections.map(section => section.id));
  const [workingDays, setWorkingDays] = useState<string[]>(calendar?.working_days ?? ['mon','tue','wed','thu','fri']);
  const [shiftDialog, setShiftDialog] = useState<{ open: boolean; editing: Record<string, unknown> | null }>({ open: false, editing: null });
  const [shiftSaving, setShiftSaving] = useState(false);
  const [shiftError, setShiftError] = useState<string | null>(null);
  const [removingShift, setRemovingShift] = useState(false);
  const removeFlight = useRef(false);
  const isEditing = mode === "edit";
  const isViewing = mode === "view";
  const disabled = isViewing;
  const calendarId = calendar?.id ?? 0;

  const { isDirty, resetDirty } = useFormDirty({ formId: FORM_ID, enabled: !isViewing });
  useEffect(() => { if (activeTab?.id) markDirty(activeTab.id, isDirty); }, [isDirty, activeTab?.id, markDirty]);
  const { getDraftDefault, syncDraft, clearDraft } = useWorkspaceFormDraft({ formId: FORM_ID, enabled: !isViewing });
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


  const handleRequestClose = () => closeTab(activeTab?.id ?? "");

  const handleSave = async (): Promise<boolean> => {
    if (isViewing) return false;
    setIsSubmitting(true);
    const form = document.getElementById(FORM_ID) as HTMLFormElement;
    const fd = new FormData(form);
    const data = {
      calendar_code: fd.get("calendar_code") as string,
      calendar_name: fd.get("calendar_name") as string,
      calendar_type: (fd.get("calendar_type") as "standard" | "ramadan" | "summer" | "project" | "custom") || "standard",
      owner_company_id: fd.get("owner_company_id") ? parseInt(fd.get("owner_company_id") as string) : null,
      working_days: workingDays,
      weekend_days: DAYS.filter(d => !workingDays.includes(d)),
      has_ramadan_timing: fd.get("has_ramadan_timing") === "on",
      has_summer_timing: fd.get("has_summer_timing") === "on",
      effective_from: (fd.get("effective_from") as string) || null,
      effective_to: (fd.get("effective_to") as string) || null,
      is_active: fd.get("is_active") !== "off",
      notes: (fd.get("notes") as string) || null,
    };
    try {
      const result = isEditing && calendar
        ? await updateWorkCalendar({ ...data, id: calendar.id })
        : await createWorkCalendar(data);
      if (result.success) { toast.success(isEditing ? "Calendar updated" : "Calendar created"); clearDraft(); resetDirty(); if (activeTab?.id) markDirty(activeTab.id, false); return true; }
      toast.error(result.error ?? "Failed to save"); return false;
    } catch { toast.error("An unexpected error occurred"); return false; }
    finally { setIsSubmitting(false); }
  };

  const handleSaveAndClose = async () => { const ok = await handleSave(); if (ok) forceCloseActiveTab(); };

  const handleSaveShift = async (fd: FormData) => {
    if (!calendarId || isViewing) throw new Error("Shift changes are unavailable.");
    setShiftError(null);
    setShiftSaving(true);
    try {
      const data = {
        calendar_id: calendarId,
        shift_code: fd.get("shift_code") as string,
        shift_name: fd.get("shift_name") as string,
        shift_start_time: fd.get("shift_start_time") as string,
        shift_end_time: fd.get("shift_end_time") as string,
        break_start_time: (fd.get("break_start_time") as string) || null,
        break_end_time: (fd.get("break_end_time") as string) || null,
        total_hours: fd.get("total_hours") ? Number(fd.get("total_hours")) : null,
        is_overnight: fd.get("is_overnight") === "on",
        is_active: fd.get("is_active") !== "off",
      };
      const result = shiftDialog.editing
        ? await updateWorkShift({ ...data, id: Number(shiftDialog.editing.id) })
        : await createWorkShift(data);
      if (!result.success) throw new Error("The shift was not saved. Check your entries and access, then try again.");
      toast.success("Shift saved");
      setShiftDialog({ open: false, editing: null });
      await queryClient.invalidateQueries({ queryKey: queryKeys.commonMd.workShifts(calendarId) });
    } finally { setShiftSaving(false); }
  };

  const handleRemoveShift = async (id: number) => {
    if (isViewing || removeFlight.current || !confirm("Remove shift?")) return;
    removeFlight.current = true;
    setRemovingShift(true);
    setShiftError(null);
    try {
      const result = await softDeleteWorkShift(id, calendarId);
      if (!result.success) { setShiftError("The shift was not removed. Check your access and try again."); return; }
      await queryClient.invalidateQueries({ queryKey: queryKeys.commonMd.workShifts(calendarId) });
    } catch { setShiftError("Removal could not be confirmed. Refresh the shift list before retrying."); }
    finally { removeFlight.current = false; setRemovingShift(false); }
  };

  const shiftColumns: ColumnDef<NonNullable<WorkCalendarRow["shifts"]>[number]>[] = [
{accessorKey:"shift_name",header:"Shift"},{accessorKey:"shift_code",header:"Code"}, {accessorKey:"shift_start_time",header:"Start"}, {accessorKey:"shift_end_time",header:"End"}, {accessorKey:"is_overnight",header:"Overnight"}, {accessorKey:"is_active",header:"Active"},
{id:"actions",header:"Actions",enableSorting:false,enableHiding:false,cell:({row})=>disabled?null:<div className="flex"><Button type="button" disabled={removingShift || shiftSaving} aria-label="Edit shift" variant="ghost" onClick={()=>setShiftDialog({open:true,editing:row.original as unknown as Record<string,unknown>})}><Pencil className="h-4 w-4"/></Button><Button type="button" disabled={removingShift || shiftSaving} aria-label="Remove shift" variant="ghost" onClick={()=>void handleRemoveShift(row.original.id)}><Trash2 className="h-4 w-4"/></Button></div>}];

  const toggleDay = (day: string) => {
    setWorkingDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  return (
    <ERPRecordWorkspaceForm
      mode={mode}
      title={isViewing ? "View Work Calendar" : isEditing ? "Edit Work Calendar" : "New Work Calendar"}
      subtitle={calendar ? `${calendar.calendar_name} (${calendar.calendar_code})` : "Create a new work calendar"}
      recordCode={calendar?.calendar_code}
      sections={sections}
      activeSection={activeSection}
      onSectionChange={setActiveSection}
      isDirty={isDirty}
      onSave={isViewing ? undefined : handleSave}
      onSaveAndClose={isViewing ? undefined : handleSaveAndClose}
      onRequestClose={handleRequestClose}
      isSubmitting={isSubmitting}
    >
      <form id={FORM_ID} onSubmit={(e) => { e.preventDefault(); handleSaveAndClose(); }} onInput={syncDraft} onChange={syncDraft}>
        <ERPRecordSectionPanel id="basic" activeId={activeSection} title="Calendar Details">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="calendar_code">Calendar Code</RequiredLabel>
              <Input id="calendar_code" name="calendar_code" className="uppercase" defaultValue={getDraftDefault("calendar_code", calendar?.calendar_code ?? "")} disabled={disabled || isEditing} required />
            </div>
            <div className="col-span-6 space-y-1.5">
              <RequiredLabel htmlFor="calendar_name">Calendar Name</RequiredLabel>
              <Input id="calendar_name" name="calendar_name" defaultValue={getDraftDefault("calendar_name", calendar?.calendar_name ?? "")} disabled={disabled} required />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="calendar_type" className="text-muted-foreground text-xs">Calendar Type</Label>
              <select id="calendar_type" name="calendar_type" defaultValue={getDraftDefault("calendar_type", calendar?.calendar_type ?? "standard")} disabled={disabled} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                {CAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="owner_company_id" className="text-muted-foreground text-xs">Organization</Label>
              <select id="owner_company_id" name="owner_company_id" defaultValue={getDraftDefault("owner_company_id", calendar?.owner_company_id ?? "")} disabled={disabled} className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40">
                <option value="">All Organizations</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.legal_name_en}</option>)}
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
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="effective_from" className="text-muted-foreground text-xs">Effective From</Label>
              <Input type="date" id="effective_from" name="effective_from" defaultValue={getDraftDefault("effective_from", calendar?.effective_from ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-6 space-y-1.5">
              <Label htmlFor="effective_to" className="text-muted-foreground text-xs">Effective To</Label>
              <Input type="date" id="effective_to" name="effective_to" defaultValue={getDraftDefault("effective_to", calendar?.effective_to ?? "")} disabled={disabled} />
            </div>
            <div className="col-span-12 grid grid-cols-3 gap-2">
              {[
                { id: "has_ramadan_timing", label: "Has Ramadan Timing", checked: calendar?.has_ramadan_timing ?? false },
                { id: "has_summer_timing", label: "Has Summer Timing", checked: calendar?.has_summer_timing ?? false },
                { id: "is_active", label: "Active", checked: calendar?.is_active ?? true },
              ].map(f => (
                <div key={f.id} className="flex items-center space-x-2">
                  <Checkbox id={f.id} name={f.id} defaultChecked={f.checked} disabled={disabled} />
                  <Label htmlFor={f.id} className="text-xs cursor-pointer">{f.label}</Label>
                </div>
              ))}
            </div>
            <div className="col-span-12 space-y-1.5">
              <Label htmlFor="notes" className="text-muted-foreground text-xs">Notes</Label>
              <Textarea id="notes" name="notes" defaultValue={getDraftDefault("notes", calendar?.notes ?? "")} rows={3} disabled={disabled} />
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
                <Button size="sm" variant="outline" onClick={() => setShiftDialog({ open: true, editing: null })}>
                  <PlusCircle className="h-4 w-4 mr-1" /> Add Shift
                </Button>
              </div>
            )}
            {shiftsLoadError && <div role="alert" className="text-sm text-destructive">Work shifts could not be refreshed. Previously loaded rows may be out of date. <Button type="button" variant="outline" size="sm" disabled={shiftsLoading} onClick={()=>void reloadShifts()}>Retry shifts</Button></div>}
            {shiftError && <p role="alert" className="text-sm text-destructive">{shiftError}</p>}
            <ERPDataTable tableId={`calendar.shifts:${calendarId}`} resultsLabel="Work shifts" data={(shifts ?? []).filter(s=>!s.deleted_at)} columns={shiftColumns} enableRowSelection={false}/>
            {shiftDialog.open && (
              <ValidatedTaskForm key={String(shiftDialog.editing?.id ?? "new")} onSubmit={handleSaveShift} className="mt-4 border rounded-md p-4 space-y-3 bg-muted/30">
                <p className="text-sm font-medium">{shiftDialog.editing ? "Edit Shift" : "Add Shift"}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label htmlFor="s_code" className="text-xs">Shift Code *</Label><Input id="s_code" name="shift_code" defaultValue={(shiftDialog.editing?.shift_code as string) ?? ""} required /></div>
                  <div className="space-y-1"><Label htmlFor="s_name" className="text-xs">Shift Name *</Label><Input id="s_name" name="shift_name" defaultValue={(shiftDialog.editing?.shift_name as string) ?? ""} required /></div>
                  <div className="space-y-1"><Label htmlFor="s_start" className="text-xs">Start Time *</Label><Input type="time" id="s_start" name="shift_start_time" defaultValue={(shiftDialog.editing?.shift_start_time as string) ?? ""} required /></div>
                  <div className="space-y-1"><Label htmlFor="s_end" className="text-xs">End Time *</Label><Input type="time" id="s_end" name="shift_end_time" defaultValue={(shiftDialog.editing?.shift_end_time as string) ?? ""} required /></div>
                  <div className="space-y-1"><Label htmlFor="s_brk_start" className="text-xs">Break Start</Label><Input type="time" id="s_brk_start" name="break_start_time" defaultValue={(shiftDialog.editing?.break_start_time as string) ?? ""} /></div>
                  <div className="space-y-1"><Label htmlFor="s_brk_end" className="text-xs">Break End</Label><Input type="time" id="s_brk_end" name="break_end_time" defaultValue={(shiftDialog.editing?.break_end_time as string) ?? ""} /></div>
                  <div className="space-y-1"><Label htmlFor="s_hours" className="text-xs">Total Hours</Label><Input type="number" step="0.5" id="s_hours" name="total_hours" defaultValue={(shiftDialog.editing?.total_hours as string) ?? ""} /></div>
                  <div className="flex items-center gap-2 pt-4"><Checkbox id="s_overnight" name="is_overnight" defaultChecked={(shiftDialog.editing?.is_overnight as boolean) ?? false} /><Label htmlFor="s_overnight" className="text-xs">Overnight Shift</Label></div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShiftDialog({ open: false, editing: null })}>Cancel</Button>
                  <Button type="submit" size="sm" disabled={shiftSaving}>{shiftSaving ? "Saving..." : "Save Shift"}</Button>
                </div>
              </ValidatedTaskForm>
            )}
          </div>
        )}
      </ERPRecordSectionPanel>
    </ERPRecordWorkspaceForm>
  );
}
