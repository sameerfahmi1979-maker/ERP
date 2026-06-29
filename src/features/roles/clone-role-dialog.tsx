"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RequiredLabel } from "@/components/erp/required-label";
import { Badge } from "@/components/ui/badge";
import type { Role } from "@/types/database";
import { cloneRole } from "@/server/actions/roles";
import { ROLE_CATEGORIES, ROLE_LEVELS } from "@/features/roles/role-constants";

type CloneRoleDialogProps = {
  sourceRole: Role;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CloneRoleDialog({ sourceRole, open, onOpenChange }: CloneRoleDialogProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    role_code: "",
    role_name: "",
    display_name: "",
    role_category: sourceRole.role_category ?? "",
    role_level: sourceRole.role_level ?? "",
    description: sourceRole.description ?? "",
    notes: "",
  });

  const selectClass =
    "flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40";

  const handleSubmit = async () => {
    if (!form.role_code.trim()) { toast.error("Role code is required"); return; }
    if (!form.role_name.trim()) { toast.error("Role name is required"); return; }

    setIsSubmitting(true);
    try {
      const result = await cloneRole(sourceRole.id, {
        role_code: form.role_code.trim().toLowerCase().replace(/\s+/g, "_"),
        role_name: form.role_name.trim(),
        display_name: form.display_name.trim() || null,
        role_category: form.role_category || null,
        role_level: form.role_level || null,
        description: form.description.trim() || null,
        notes: form.notes.trim() || null,
      });

      if (result.success && result.data) {
        toast.success(`Role cloned as "${result.data.role_code}" with permissions copied`);
        onOpenChange(false);
        router.push(`/admin/roles/record/${result.data.id}?mode=edit`);
      } else {
        toast.error(result.error ?? "Failed to clone role");
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={onOpenChange}
      title="Clone Role"
      subtitle={`Cloning from: ${sourceRole.role_name} (${sourceRole.role_code})`}
      icon={<Copy className="h-5 w-5" />}
      mode="add"
      size="md"
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      submitLabel="Clone Role"
    >
      {/* Source role summary */}
      <div className="col-span-12 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
        <Badge variant={sourceRole.is_system_role ? "default" : "secondary"} className="text-xs shrink-0">
          {sourceRole.is_system_role ? "System" : "Custom"}
        </Badge>
        <span className="text-sm font-medium">{sourceRole.role_name}</span>
        <span className="text-xs font-mono text-muted-foreground">({sourceRole.role_code})</span>
        <span className="text-xs text-muted-foreground ml-auto">→ will create custom role</span>
      </div>

      <div className="col-span-6 space-y-1.5">
        <RequiredLabel htmlFor="clone_role_code" required>New Role Code</RequiredLabel>
        <Input
          id="clone_role_code"
          value={form.role_code}
          onChange={(e) => setForm((f) => ({ ...f, role_code: e.target.value.toLowerCase().replace(/\s+/g, "_") }))}
          placeholder="e.g., custom_hr_manager"
          className="lowercase"
        />
      </div>

      <div className="col-span-6 space-y-1.5">
        <RequiredLabel htmlFor="clone_role_name" required>New Role Name</RequiredLabel>
        <Input
          id="clone_role_name"
          value={form.role_name}
          onChange={(e) => setForm((f) => ({ ...f, role_name: e.target.value }))}
          placeholder="e.g., Custom HR Manager"
        />
      </div>

      <div className="col-span-12 space-y-1.5">
        <label htmlFor="clone_display_name" className="text-sm font-medium">Display Name</label>
        <Input
          id="clone_display_name"
          value={form.display_name}
          onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
          placeholder="Friendly label shown in UI (optional)"
        />
      </div>

      <div className="col-span-6 space-y-1.5">
        <label htmlFor="clone_role_category" className="text-sm font-medium">Category</label>
        <select
          id="clone_role_category"
          value={form.role_category}
          onChange={(e) => setForm((f) => ({ ...f, role_category: e.target.value }))}
          className={selectClass}
        >
          <option value="">— Select category —</option>
          {ROLE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="col-span-6 space-y-1.5">
        <label htmlFor="clone_role_level" className="text-sm font-medium">Level</label>
        <select
          id="clone_role_level"
          value={form.role_level}
          onChange={(e) => setForm((f) => ({ ...f, role_level: e.target.value }))}
          className={selectClass}
        >
          <option value="">— Select level —</option>
          {ROLE_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      <div className="col-span-12 space-y-1.5">
        <label htmlFor="clone_description" className="text-sm font-medium">Description</label>
        <Textarea
          id="clone_description"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={2}
          placeholder="What this role is for..."
        />
      </div>

      <div className="col-span-12 space-y-1.5">
        <label htmlFor="clone_notes" className="text-sm font-medium">Notes</label>
        <Textarea
          id="clone_notes"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={2}
          placeholder="Internal notes (optional)"
        />
      </div>
    </ERPChildDialogForm>
  );
}
