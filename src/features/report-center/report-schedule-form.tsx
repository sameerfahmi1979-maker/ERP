"use client";

import { ERPCombobox } from "@/components/erp/combobox";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { ScheduleFormOptions } from "@/lib/report-center/schedule-ui-access";
import { createWorkspaceSaveAttempt } from "@/lib/workspace/save-contract";
import { getScheduleFormOptions } from "@/server/actions/reports/schedule-options";
import {
  createReportSchedule,
  updateReportSchedule,
  type ReportSchedule,
} from "@/server/actions/reports/schedules";
import { CalendarClock, Mail, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface ReportScheduleFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: ReportSchedule | null;
  onSaved: () => void;
}

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const FORMAT_OPTIONS = [
  { value: "pdf", label: "PDF" },
  { value: "excel", label: "Excel" },
  { value: "csv", label: "CSV" },
];

const DAY_OF_WEEK_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

export function ReportScheduleForm(props: ReportScheduleFormProps) {
  return props.open ? <ReportScheduleSession key={props.editing?.id ?? "new"} {...props} /> : null;
}

function ReportScheduleSession({
  open,
  onOpenChange,
  editing,
  onSaved,
}: ReportScheduleFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [options, setOptions] = useState<ScheduleFormOptions | null>(null);
  const [choicesError, setChoicesError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [retry, setRetry] = useState(0);
  const attempt = useRef(createWorkspaceSaveAttempt());

  const [form, setForm] = useState(() => editing ? {
    companyValue: editing.owner_company_id === null ? "global" : String(editing.owner_company_id),
    reportCode: (editing.report as { report_code?: string } | undefined)?.report_code ?? "",
    scheduleName: editing.schedule_name,
    outputFormat: editing.output_format,
    frequency: editing.frequency,
    dayOfWeek: editing.day_of_week ?? 1,
    dayOfMonth: editing.day_of_month ?? 1,
    timeOfDay: (editing.time_of_day ?? "07:00").slice(0, 5),
    timezone: editing.timezone,
    recipientTo: (editing.recipient_to ?? []).join(", "),
    recipientCc: (editing.recipient_cc ?? []).join(", "),
    emailSubjectTemplate: editing.email_subject_template ?? "",
    emailBodyTemplate: editing.email_body_template ?? "",
    isActive: editing.is_active,
  } : {
    companyValue: "",
    reportCode: "",
    scheduleName: "",
    outputFormat: "pdf" as "pdf" | "excel" | "csv",
    frequency: "weekly" as "daily" | "weekly" | "monthly",
    dayOfWeek: 1,
    dayOfMonth: 1,
    timeOfDay: "07:00",
    timezone: "Asia/Dubai",
    recipientTo: "",
    recipientCc: "",
    emailSubjectTemplate: "",
    emailBodyTemplate: "",
    isActive: true,
  });

  useEffect(() => {
    let current = true;
    void getScheduleFormOptions().then(result => {
      if (!current) return;
      if (result.success && result.data) { setOptions(result.data); setChoicesError(""); }
      else setChoicesError("Schedule choices could not be loaded. Retry before saving.");
    }).catch(() => { if (current) setChoicesError("Schedule choices could not be loaded. Retry before saving."); });
    return () => { current = false; };
  }, [retry]);
  const reports = options?.reports.filter(r => r.companyValues.includes(form.companyValue)) ?? [];
  const formats = FORMAT_OPTIONS.filter(f => reports.find(r => r.code === form.reportCode)?.formats.includes(f.value));

  const handleSubmit = async () => {
    if (!options || choicesError) return;
    setSaveError("");
    if (!options.companies.some(c => c.value === form.companyValue)) { setSaveError("Choose a company you are currently authorized to deliver reports for."); return; }

    if (!reports.some(r => r.code === form.reportCode) || !formats.some(f => f.value === form.outputFormat)) {
      setSaveError("Choose an available report and one of its supported output formats before saving.");
      return;
    }

    const recipientTo = form.recipientTo
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    if (recipientTo.length === 0) { toast.error("At least one recipient is required."); return; }

    const recipientCc = form.recipientCc
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    const payload = {
      scheduleName: form.scheduleName.trim(), outputFormat: form.outputFormat,
      frequency: form.frequency,
      dayOfWeek: form.frequency === "weekly" ? form.dayOfWeek : null,
      dayOfMonth: form.frequency === "monthly" ? form.dayOfMonth : null,
      timeOfDay: form.timeOfDay, timezone: form.timezone, recipientTo, recipientCc,
      emailSubjectTemplate: form.emailSubjectTemplate || undefined,
      emailBodyTemplate: form.emailBodyTemplate || undefined, isActive: form.isActive,
    };
    setIsSubmitting(true);
    try {
      if (editing) {
        const result = await updateReportSchedule({
          id: editing.id,
          expectedUpdatedAt: editing.updated_at,
          ...payload,
        });
        if (!result.success) { setSaveError(result.error ?? "Update could not be confirmed. Refresh before retrying."); return; }
        toast.success("Schedule updated.");
      } else {
        const request = {
          ...payload,
          ownerCompanyId: form.companyValue === "global" ? null : Number(form.companyValue),
          reportCode: form.reportCode,
          filtersJson: {},
        };
        const contract = attempt.current.begin(request, null);
        const result = await createReportSchedule({ ...request, requestId: contract.operationId });
        if (!result.success) {
          if (!result.uncertain) attempt.current.resolved();
          setSaveError(result.error ?? "Save could not be confirmed. Retry the same entries."); return;
        }
        attempt.current.resolved();
        toast.success("Schedule created.");
      }
      onOpenChange(false);
      onSaved();
    } catch {
      setSaveError("Save unconfirmed. Your entries are retained. Retry with exactly the same values, or refresh the list to reconcile before starting another save.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit Schedule" : "New Schedule"}
      subtitle="Configure automated report delivery"
      icon={<CalendarClock className="h-5 w-5" />}
      mode={editing ? "edit" : "add"}
      size="lg"
      isSubmitting={isSubmitting}
      submitDisabled={!options || !!choicesError || options.companies.length === 0}
      submitLabel={editing ? "Save" : "Create schedule"}
      onSubmit={handleSubmit}
    >
      {saveError && <p role="alert" className="mb-4 rounded-sm border border-destructive bg-destructive/5 p-3 text-sm">{saveError}</p>}
      {choicesError ? <div role="alert" className="mb-4 border p-3"><p>{choicesError}</p><Button type="button" variant="outline" onClick={() => setRetry(r => r + 1)}>Retry choices</Button></div>
        : !options ? <p role="status">Loading authorized schedule choices…</p>
        : !options.companies.length ? <p role="status">You do not currently have company-wide report delivery permission. No schedule can be saved.</p> : null}
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12">
          <Label className="text-xs mb-1.5 block">Company scope *</Label>
          <ERPCombobox ariaLabel="Company scope" required disabled={!!editing || !options}
            value={form.companyValue} options={options?.companies ?? []} placeholder="Choose the report's company scope"
            onValueChange={value => setForm(f => ({ ...f, companyValue: String(value), reportCode: "" }))} />
          <p className="mt-1 text-xs text-muted-foreground">A company schedule uses company-wide delivery permissions, not a branch-only assignment. Scope cannot be changed in this editor.</p>
        </div>
        {!editing && (
          <div className="col-span-12">
            <Label className="text-xs mb-1.5 block">Report <span className="text-destructive">*</span></Label>
            <ERPCombobox
              ariaLabel="Report" value={form.reportCode}
              onValueChange={(v) => setForm((f) => ({ ...f, reportCode: String(v) }))}
              options={reports.map((r) => ({ value: r.code, label: r.name }))}
              placeholder="Select report..."
              required
            />
          </div>
        )}

        <div className="col-span-12">
          <Label className="text-xs mb-1.5 block">Schedule Name <span className="text-destructive">*</span></Label>
          <Input
            aria-label="Schedule name" required maxLength={200} pattern=".*\S.*"
            value={form.scheduleName}
            onChange={(e) => setForm((f) => ({ ...f, scheduleName: e.target.value }))}
            placeholder="e.g. Weekly Employee List"
          />
        </div>

        <div className="col-span-12 sm:col-span-4">
          <Label className="text-xs mb-1.5 block">Output Format</Label>
          <ERPCombobox
            ariaLabel="Output format" required
            value={form.outputFormat}
            onValueChange={(v) => setForm((f) => ({ ...f, outputFormat: v as "pdf" | "excel" | "csv" }))}
            options={formats}
            placeholder="Format..."
          />
        </div>

        <div className="col-span-12 sm:col-span-4">
          <Label className="text-xs mb-1.5 block">Frequency</Label>
          <ERPCombobox
            ariaLabel="Frequency" required
            value={form.frequency}
            onValueChange={(v) => setForm((f) => ({ ...f, frequency: v as "daily" | "weekly" | "monthly" }))}
            options={FREQUENCY_OPTIONS}
            placeholder="Frequency..."
          />
        </div>

        <div className="col-span-12 sm:col-span-4">
          <Label className="text-xs mb-1.5 block">Time of Day</Label>
          <Input
            aria-label="Time of day" required
            type="time"
            value={form.timeOfDay}
            onChange={(e) => setForm((f) => ({ ...f, timeOfDay: e.target.value }))}
          />
        </div>

        <p className="col-span-12 text-sm text-muted-foreground">Times use {form.timezone}, not your browser&apos;s timezone. A day beyond the end of a month runs on that month&apos;s last day. Active schedules run automatically only after the backend delivery service is enabled.</p>

        {form.frequency === "weekly" && (
          <div className="col-span-6">
            <Label className="text-xs mb-1.5 block">Day of Week</Label>
            <ERPCombobox
              ariaLabel="Day of week" required
              value={form.dayOfWeek}
              onValueChange={(v) => setForm((f) => ({ ...f, dayOfWeek: Number(v) }))}
              options={DAY_OF_WEEK_OPTIONS}
              placeholder="Day..."
            />
          </div>
        )}

        {form.frequency === "monthly" && (
          <div className="col-span-6">
            <Label className="text-xs mb-1.5 block">Day of Month</Label>
            <Input
              aria-label="Day of month" required step={1}
              type="number"
              min={1}
              max={31}
              value={form.dayOfMonth}
              onChange={(e) => setForm((f) => ({ ...f, dayOfMonth: Number(e.target.value) }))}
            />
          </div>
        )}

        <div className="col-span-12 border-t pt-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-3">
            <Mail className="h-3.5 w-3.5" />
            Email Recipients
          </div>
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12">
              <Label className="text-xs mb-1.5 block">To <span className="text-destructive">*</span></Label>
              <Input
                aria-label="To recipients" type="email" multiple required
                value={form.recipientTo}
                onChange={(e) => setForm((f) => ({ ...f, recipientTo: e.target.value }))}
                placeholder="recipient@example.com, another@example.com"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Comma-separated email addresses</p>
            </div>
            <div className="col-span-12">
              <Label className="text-xs mb-1.5 block">CC</Label>
              <Input
                aria-label="CC recipients" type="email" multiple
                value={form.recipientCc}
                onChange={(e) => setForm((f) => ({ ...f, recipientCc: e.target.value }))}
                placeholder="cc@example.com (optional)"
              />
            </div>
          </div>
        </div>

        <div className="col-span-12 border-t pt-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-3">
            <Settings2 className="h-3.5 w-3.5" />
            Email Template (optional)
          </div>
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12">
              <Label className="text-xs mb-1.5 block">Subject</Label>
              <Input
                aria-label="Email subject" maxLength={500}
                value={form.emailSubjectTemplate}
                onChange={(e) => setForm((f) => ({ ...f, emailSubjectTemplate: e.target.value }))}
                placeholder="e.g. Weekly Report — {date}"
              />
            </div>
          </div>
        </div>

        <div className="col-span-12">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="h-4 w-4"
            />
            <span className="text-sm">Schedule is active</span>
          </label>
        </div>
      </div>
    </ERPChildDialogForm>
  );
}
