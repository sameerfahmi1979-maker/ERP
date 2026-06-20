"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { CalendarClock, Mail, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { listReportRegistry } from "@/server/actions/reports/registry";
import {
  createReportSchedule,
  updateReportSchedule,
  type ReportSchedule,
} from "@/server/actions/reports/schedules";
import type { ReportRegistryEntry } from "@/lib/report-center/types";

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

export function ReportScheduleForm({
  open,
  onOpenChange,
  editing,
  onSaved,
}: ReportScheduleFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reports, setReports] = useState<ReportRegistryEntry[]>([]);

  const [form, setForm] = useState({
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
    if (open) {
      listReportRegistry().then((r) => {
        if (r.success && r.data) setReports(r.data);
      });

      if (editing) {
        const report = editing.report as { report_code?: string } | undefined;
        setForm({
          reportCode: report?.report_code ?? "",
          scheduleName: editing.schedule_name,
          outputFormat: editing.output_format,
          frequency: editing.frequency,
          dayOfWeek: editing.day_of_week ?? 1,
          dayOfMonth: editing.day_of_month ?? 1,
          timeOfDay: editing.time_of_day ?? "07:00",
          timezone: editing.timezone,
          recipientTo: (editing.recipient_to ?? []).join(", "),
          recipientCc: (editing.recipient_cc ?? []).join(", "),
          emailSubjectTemplate: editing.email_subject_template ?? "",
          emailBodyTemplate: editing.email_body_template ?? "",
          isActive: editing.is_active,
        });
      } else {
        setForm({
          reportCode: "",
          scheduleName: "",
          outputFormat: "pdf",
          frequency: "weekly",
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
      }
    }
  }, [open, editing]);

  const handleSubmit = async () => {
    if (!form.reportCode) { toast.error("Please select a report."); return; }
    if (!form.scheduleName) { toast.error("Schedule name is required."); return; }

    const recipientTo = form.recipientTo
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    if (recipientTo.length === 0) { toast.error("At least one recipient is required."); return; }

    const recipientCc = form.recipientCc
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    setIsSubmitting(true);
    try {
      if (editing) {
        const result = await updateReportSchedule({
          id: editing.id,
          scheduleName: form.scheduleName,
          outputFormat: form.outputFormat,
          frequency: form.frequency,
          dayOfWeek: form.frequency === "weekly" ? form.dayOfWeek : null,
          dayOfMonth: form.frequency === "monthly" ? form.dayOfMonth : null,
          timeOfDay: form.timeOfDay,
          timezone: form.timezone,
          recipientTo,
          recipientCc,
          emailSubjectTemplate: form.emailSubjectTemplate || undefined,
          emailBodyTemplate: form.emailBodyTemplate || undefined,
          isActive: form.isActive,
        });
        if (!result.success) { toast.error(result.error ?? "Update failed."); return; }
        toast.success("Schedule updated.");
      } else {
        const result = await createReportSchedule({
          reportCode: form.reportCode,
          scheduleName: form.scheduleName,
          filtersJson: {},
          outputFormat: form.outputFormat,
          frequency: form.frequency,
          dayOfWeek: form.frequency === "weekly" ? form.dayOfWeek : undefined,
          dayOfMonth: form.frequency === "monthly" ? form.dayOfMonth : undefined,
          timeOfDay: form.timeOfDay,
          timezone: form.timezone,
          recipientTo,
          recipientCc,
          emailSubjectTemplate: form.emailSubjectTemplate || undefined,
          emailBodyTemplate: form.emailBodyTemplate || undefined,
          isActive: form.isActive,
        });
        if (!result.success) { toast.error(result.error ?? "Create failed."); return; }
        toast.success("Schedule created.");
      }
      onOpenChange(false);
      onSaved();
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
      onSubmit={handleSubmit}
    >
      <div className="grid grid-cols-12 gap-4">
        {!editing && (
          <div className="col-span-12">
            <Label className="text-xs mb-1.5 block">Report <span className="text-destructive">*</span></Label>
            <ERPCombobox
              value={form.reportCode}
              onValueChange={(v) => setForm((f) => ({ ...f, reportCode: String(v) }))}
              options={reports.map((r) => ({ value: r.report_code, label: r.report_name_en }))}
              placeholder="Select report..."
              required
            />
          </div>
        )}

        <div className="col-span-12">
          <Label className="text-xs mb-1.5 block">Schedule Name <span className="text-destructive">*</span></Label>
          <Input
            value={form.scheduleName}
            onChange={(e) => setForm((f) => ({ ...f, scheduleName: e.target.value }))}
            placeholder="e.g. Weekly Employee List"
          />
        </div>

        <div className="col-span-4">
          <Label className="text-xs mb-1.5 block">Output Format</Label>
          <ERPCombobox
            value={form.outputFormat}
            onValueChange={(v) => setForm((f) => ({ ...f, outputFormat: v as "pdf" | "excel" | "csv" }))}
            options={FORMAT_OPTIONS}
            placeholder="Format..."
          />
        </div>

        <div className="col-span-4">
          <Label className="text-xs mb-1.5 block">Frequency</Label>
          <ERPCombobox
            value={form.frequency}
            onValueChange={(v) => setForm((f) => ({ ...f, frequency: v as "daily" | "weekly" | "monthly" }))}
            options={FREQUENCY_OPTIONS}
            placeholder="Frequency..."
          />
        </div>

        <div className="col-span-4">
          <Label className="text-xs mb-1.5 block">Time of Day</Label>
          <Input
            type="time"
            value={form.timeOfDay}
            onChange={(e) => setForm((f) => ({ ...f, timeOfDay: e.target.value }))}
          />
        </div>

        {form.frequency === "weekly" && (
          <div className="col-span-6">
            <Label className="text-xs mb-1.5 block">Day of Week</Label>
            <ERPCombobox
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
                value={form.recipientTo}
                onChange={(e) => setForm((f) => ({ ...f, recipientTo: e.target.value }))}
                placeholder="recipient@example.com, another@example.com"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Comma-separated email addresses</p>
            </div>
            <div className="col-span-12">
              <Label className="text-xs mb-1.5 block">CC</Label>
              <Input
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
