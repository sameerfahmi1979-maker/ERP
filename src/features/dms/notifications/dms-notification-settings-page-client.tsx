"use client";

import { useState, useTransition, useEffect } from "react";
import { toast } from "sonner";
import { Bell, Save, RotateCcw, UserRound, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { MultiSelectCombobox } from "@/components/erp/multi-select-combobox";
import { cn } from "@/lib/utils";
import type {
  DmsNotificationSettingsRow,
  RoleOption,
  UserOption,
} from "@/server/actions/dms/notification-settings";
import {
  saveDmsNotificationSettings,
  getDmsNotificationRecipientOptions,
} from "@/server/actions/dms/notification-settings";

// ── Reminder day options ──────────────────────────────────────────────────────

const REMINDER_DAY_OPTIONS = [90, 60, 30, 14, 7, 3, 1, 0] as const;

const REMINDER_DAY_LABELS: Record<number, string> = {
  90: "90 days",
  60: "60 days",
  30: "30 days",
  14: "14 days",
  7: "7 days",
  3: "3 days",
  1: "1 day",
  0: "On expiry day",
};

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: DmsNotificationSettingsRow = {
  id: 1,
  is_enabled: true,
  email_enabled: false,
  in_app_enabled: true,
  reminder_days_before: [90, 60, 30, 14, 7, 3, 1, 0],
  include_document_owner: true,
  include_document_creator: true,
  recipient_roles: [],
  recipient_user_ids: [],
  config_name: "Default DMS Notification Settings",
  notes: null,
  updated_by: null,
  updated_at: "",   // empty — only set from DB; avoids server/client timestamp mismatch
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface DmsNotificationSettingsClientProps {
  initialSettings: DmsNotificationSettingsRow | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DmsNotificationSettingsClient({
  initialSettings,
}: DmsNotificationSettingsClientProps) {
  const [form, setForm] = useState<DmsNotificationSettingsRow>(
    initialSettings ?? DEFAULT_SETTINGS
  );
  const [isPending, startTransition] = useTransition();

  // Lookup data
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [lookupLoading, setLookupLoading] = useState(true);

  // Load roles + users once
  useEffect(() => {
    getDmsNotificationRecipientOptions().then((res) => {
      if (res.success && res.data) {
        setRoleOptions(res.data.roles);
        setUserOptions(res.data.users);
      }
      setLookupLoading(false);
    });
  }, []);

  // ── Role recipients ───────────────────────────────────────────────────────

  function getRoleLabel(code: string): string {
    return roleOptions.find((r) => r.role_code === code)?.role_name ?? code;
  }

  // ── User recipients ───────────────────────────────────────────────────────

  function getUserLabel(uid: number): string {
    const u = userOptions.find((u) => u.id === uid);
    if (!u) return `User #${uid}`;
    return u.full_name || u.display_name || `User #${uid}`;
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  function toggleReminderDay(day: number) {
    setForm((prev) => {
      const days = prev.reminder_days_before;
      if (days.includes(day)) {
        return { ...prev, reminder_days_before: days.filter((d) => d !== day) };
      }
      return { ...prev, reminder_days_before: [...days, day].sort((a, b) => b - a) };
    });
  }

  // ── Reminder windows ──────────────────────────────────────────────────────

  function handleSave() {
    if (form.reminder_days_before.length === 0) {
      toast.error("Select at least one reminder day.");
      return;
    }
    startTransition(async () => {
      const result = await saveDmsNotificationSettings({
        is_enabled: form.is_enabled,
        email_enabled: form.email_enabled,
        in_app_enabled: form.in_app_enabled,
        reminder_days_before: form.reminder_days_before,
        include_document_owner: form.include_document_owner,
        include_document_creator: form.include_document_creator,
        recipient_roles: form.recipient_roles,
        recipient_user_ids: form.recipient_user_ids,
        config_name: form.config_name,
        notes: form.notes ?? undefined,
      });
      if (result.success) {
        toast.success("DMS notification settings saved.");
      } else {
        toast.error(result.error ?? "Failed to save settings.");
      }
    });
  }

  function handleReset() {
    setForm(initialSettings ?? DEFAULT_SETTINGS);
  }

  const isDisabled = !form.is_enabled;

  return (
    <div className="max-w-2xl space-y-6">

      {/* Header card */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Global Notification Configuration</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Configure who receives automatic DMS expiry reminders. These settings apply to all documents
          system-wide and are read by the daily notification scheduler.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="config_name" className="text-xs font-medium">Configuration Name</Label>
          <Input
            id="config_name"
            value={form.config_name}
            onChange={(e) => setForm((p) => ({ ...p, config_name: e.target.value }))}
            className="h-8 text-sm"
            maxLength={200}
          />
        </div>
      </div>

      {/* Channels */}
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <h3 className="text-sm font-semibold">Notification Channels</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Notifications Enabled</Label>
              <p className="text-xs text-muted-foreground">Master switch for the entire notification pipeline.</p>
            </div>
            <Switch checked={form.is_enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, is_enabled: v }))} />
          </div>

          <div className={cn("flex items-center justify-between", isDisabled && "opacity-40 pointer-events-none")}>
            <div>
              <Label className="text-sm font-medium">In-App Notifications</Label>
              <p className="text-xs text-muted-foreground">Show alerts in the top-bar notification bell.</p>
            </div>
            <Switch checked={form.in_app_enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, in_app_enabled: v }))} />
          </div>

          <div className={cn("flex items-center justify-between", isDisabled && "opacity-40 pointer-events-none")}>
            <div>
              <Label className="text-sm font-medium">Email Notifications</Label>
              <p className="text-xs text-muted-foreground">
                Requires <span className="font-mono text-[10px] bg-muted px-1 rounded">DMS_EXPIRY_EMAILS</span> feature flag enabled.
              </p>
            </div>
            <Switch checked={form.email_enabled} onCheckedChange={(v) => setForm((p) => ({ ...p, email_enabled: v }))} />
          </div>
        </div>
      </div>

      {/* Reminder windows */}
      <div className={cn("rounded-lg border bg-card p-5 space-y-4", isDisabled && "opacity-40 pointer-events-none")}>
        <div>
          <h3 className="text-sm font-semibold">Reminder Windows</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Select how many days before expiry to send reminders.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {REMINDER_DAY_OPTIONS.map((day) => {
            const selected = form.reminder_days_before.includes(day);
            return (
              <button
                key={day}
                onClick={() => toggleReminderDay(day)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  selected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {REMINDER_DAY_LABELS[day]}
              </button>
            );
          })}
        </div>
        {form.reminder_days_before.length === 0 && (
          <p className="text-xs text-destructive">At least one reminder day must be selected.</p>
        )}
      </div>

      {/* Recipients */}
      <div className={cn("rounded-lg border bg-card p-5 space-y-5", isDisabled && "opacity-40 pointer-events-none")}>
        <h3 className="text-sm font-semibold">Recipients</h3>

        {/* Always-include toggles */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Always include document owner</Label>
              <p className="text-xs text-muted-foreground">Notifies the user assigned as document owner.</p>
            </div>
            <Switch
              checked={form.include_document_owner}
              onCheckedChange={(v) => setForm((p) => ({ ...p, include_document_owner: v }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Always include document creator</Label>
              <p className="text-xs text-muted-foreground">Notifies the user who created the document record.</p>
            </div>
            <Switch
              checked={form.include_document_creator}
              onCheckedChange={(v) => setForm((p) => ({ ...p, include_document_creator: v }))}
            />
          </div>
        </div>

        <div className="border-t pt-4 space-y-4">

          {/* Role recipients */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-sm font-medium">Additional Recipient Roles</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              All active users with the selected roles will receive notifications.
            </p>
            <MultiSelectCombobox
              values={form.recipient_roles}
              onValuesChange={(vals) =>
                setForm((p) => ({ ...p, recipient_roles: vals.map(String) }))
              }
              options={roleOptions.map((r) => ({ value: r.role_code, label: r.role_name }))}
              placeholder="Select roles..."
              searchPlaceholder="Search roles..."
              loading={lookupLoading}
            />
          </div>

          {/* User recipients */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-sm font-medium">Additional Individual Users</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Specific users who always receive notifications regardless of role.
            </p>
            <MultiSelectCombobox
              values={form.recipient_user_ids}
              onValuesChange={(vals) =>
                setForm((p) => ({ ...p, recipient_user_ids: vals.map(Number) }))
              }
              options={userOptions.map((u) => ({
                value: u.id,
                label: u.full_name || u.display_name || `User #${u.id}`,
              }))}
              placeholder="Select users..."
              searchPlaceholder="Search by name..."
              loading={lookupLoading}
              maxVisibleOptions={20}
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-lg border bg-card p-5 space-y-2">
        <Label htmlFor="notes" className="text-xs font-medium">Notes (internal)</Label>
        <Textarea
          id="notes"
          value={form.notes ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value || null }))}
          rows={2}
          className="text-sm resize-none"
          placeholder="Optional internal notes..."
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isPending} className="gap-2">
          <Save className="h-4 w-4" />
          {isPending ? "Saving..." : "Save Settings"}
        </Button>
        <Button variant="outline" onClick={handleReset} disabled={isPending} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
      </div>

      {form.updated_at && (
        <p className="text-xs text-muted-foreground">
          Last updated: {new Date(form.updated_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}
