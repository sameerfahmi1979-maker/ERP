"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { NotificationTemplateRow } from "@/server/actions/notifications/templates";
import {
  createNotificationTemplate,
  updateNotificationTemplate,
} from "@/server/actions/notifications/templates";

interface NotificationTemplateFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  template?: NotificationTemplateRow | null;
}

export function NotificationTemplateFormDialog({
  open,
  onClose,
  onSuccess,
  template,
}: NotificationTemplateFormDialogProps) {
  const isEdit = !!template;
  const [pending, startTransition] = useTransition();

  const [form, setForm] = useState({
    template_code: template?.templateCode ?? "",
    template_name: template?.templateName ?? "",
    source_module: template?.sourceModule ?? "",
    notification_type: template?.notificationType ?? "",
    subject_template: template?.subjectTemplate ?? "",
    html_template: template?.htmlTemplate ?? "",
    text_template: template?.textTemplate ?? "",
    default_severity: template?.defaultSeverity ?? "info",
    default_channel_in_app: template?.defaultChannelInApp ?? true,
    default_channel_email: template?.defaultChannelEmail ?? false,
    is_system: template?.isSystem ?? false,
  });

  const handleChange = (field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    startTransition(async () => {
      const result = isEdit
        ? await updateNotificationTemplate(template!.id, {
            template_name: form.template_name,
            source_module: form.source_module,
            notification_type: form.notification_type,
            subject_template: form.subject_template,
            html_template: form.html_template || null,
            text_template: form.text_template,
            default_severity: form.default_severity as "info" | "success" | "warning" | "urgent" | "critical",
            default_channel_in_app: form.default_channel_in_app,
            default_channel_email: form.default_channel_email,
          })
        : await createNotificationTemplate({
            template_code: form.template_code,
            template_name: form.template_name,
            source_module: form.source_module,
            notification_type: form.notification_type,
            subject_template: form.subject_template,
            html_template: form.html_template || null,
            text_template: form.text_template,
            default_severity: form.default_severity as "info" | "success" | "warning" | "urgent" | "critical",
            default_channel_in_app: form.default_channel_in_app,
            default_channel_email: form.default_channel_email,
            is_system: form.is_system,
          });

      if (result.success) {
        toast.success(isEdit ? "Template updated" : "Template created");
        onSuccess();
      } else {
        toast.error(result.error ?? "Failed");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Template" : "New Notification Template"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Template Code *</Label>
            <Input
              value={form.template_code}
              onChange={(e) => handleChange("template_code", e.target.value.toUpperCase())}
              disabled={isEdit}
              placeholder="MY_TEMPLATE_CODE"
              className="text-sm h-8 font-mono"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Template Name *</Label>
            <Input
              value={form.template_name}
              onChange={(e) => handleChange("template_name", e.target.value)}
              placeholder="My Notification Template"
              className="text-sm h-8"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Source Module *</Label>
            <Input
              value={form.source_module}
              onChange={(e) => handleChange("source_module", e.target.value.toUpperCase())}
              placeholder="DMS / HR / SYSTEM"
              className="text-sm h-8"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Notification Type *</Label>
            <Input
              value={form.notification_type}
              onChange={(e) => handleChange("notification_type", e.target.value)}
              placeholder="expiry_reminder"
              className="text-sm h-8"
            />
          </div>
          <div className="flex flex-col gap-1.5 col-span-2">
            <Label className="text-xs">Subject Template * (use {"{{variable}}"} placeholders)</Label>
            <Input
              value={form.subject_template}
              onChange={(e) => handleChange("subject_template", e.target.value)}
              placeholder="Document {{document_no}} — {{title}} expires soon"
              className="text-sm h-8"
            />
          </div>
          <div className="flex flex-col gap-1.5 col-span-2">
            <Label className="text-xs">Text Body *</Label>
            <Textarea
              value={form.text_template}
              onChange={(e) => handleChange("text_template", e.target.value)}
              rows={3}
              placeholder="Plain text content with {{variable}} placeholders"
              className="text-sm resize-none"
            />
          </div>
          <div className="flex flex-col gap-1.5 col-span-2">
            <Label className="text-xs">HTML Body (optional)</Label>
            <Textarea
              value={form.html_template}
              onChange={(e) => handleChange("html_template", e.target.value)}
              rows={3}
              placeholder="<p>HTML content with {{variable}} placeholders</p>"
              className="text-sm font-mono resize-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Default Severity</Label>
            <select
              value={form.default_severity}
              onChange={(e) => handleChange("default_severity", e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-sm"
            >
              <option value="info">Info</option>
              <option value="success">Success</option>
              <option value="warning">Warning</option>
              <option value="urgent">Urgent</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label className="text-xs">Default Channels</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.default_channel_in_app}
                  onChange={(e) => handleChange("default_channel_in_app", e.target.checked)}
                  className="rounded"
                />
                In-App
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.default_channel_email}
                  onChange={(e) => handleChange("default_channel_email", e.target.checked)}
                  className="rounded"
                />
                Email
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit} disabled={pending}>
            {isEdit ? "Save Changes" : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
