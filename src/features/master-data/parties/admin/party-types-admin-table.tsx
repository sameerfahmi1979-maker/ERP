"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { PlusCircle, Pencil, Power, Layers } from "lucide-react";
import { toast } from "sonner";
import { RequiredLabel } from "@/components/erp/required-label";
import {
  createPartyType,
  updatePartyType,
  togglePartyTypeActive,
} from "@/server/actions/master-data/party-admin-masters";
import type { PartyTypeAdminRow } from "@/server/actions/master-data/party-admin-masters";
import type { AuthContext } from "@/lib/rbac/check";
import { useRouter } from "next/navigation";

type Props = {
  rows: PartyTypeAdminRow[];
  authContext: AuthContext;
};

type FormState = {
  type_code: string;
  type_name: string;
  type_name_ar: string;
  description: string;
  icon_name: string;
  color_token: string;
  is_active: boolean;
  sort_order: number;
};

const emptyForm: FormState = {
  type_code: "",
  type_name: "",
  type_name_ar: "",
  description: "",
  icon_name: "",
  color_token: "",
  is_active: true,
  sort_order: 0,
};

export function PartyTypesAdminTable({ rows, authContext }: Props) {
  const router = useRouter();
  const canManage = authContext.permissionCodes?.includes("master_data.parties.manage_types") || authContext.roleCodes?.includes("system_admin") || authContext.roleCodes?.includes("group_admin");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PartyTypeAdminRow | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setIsDialogOpen(true);
  };

  const openEdit = (row: PartyTypeAdminRow) => {
    setEditing(row);
    setForm({
      type_code: row.type_code,
      type_name: row.type_name,
      type_name_ar: row.type_name_ar ?? "",
      description: row.description ?? "",
      icon_name: row.icon_name ?? "",
      color_token: row.color_token ?? "",
      is_active: row.is_active,
      sort_order: row.sort_order,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.type_code || !form.type_name) {
      toast.error("Code and name are required");
      return;
    }
    setIsSubmitting(true);
    const payload = {
      type_code: form.type_code.toUpperCase(),
      type_name: form.type_name,
      type_name_ar: form.type_name_ar || null,
      description: form.description || null,
      icon_name: form.icon_name || null,
      color_token: form.color_token || null,
      is_active: form.is_active,
      sort_order: form.sort_order,
    };

    const result = editing
      ? await updatePartyType(editing.id, payload)
      : await createPartyType(payload);

    setIsSubmitting(false);
    if (!result.success) {
      toast.error(result.error ?? "Failed to save");
      return;
    }
    toast.success(editing ? "Party type updated" : "Party type created");
    setIsDialogOpen(false);
    router.refresh();
  };

  const handleToggle = async (row: PartyTypeAdminRow) => {
    const result = await togglePartyTypeActive(row.id);
    if (!result.success) {
      toast.error(result.error ?? "Failed to toggle");
      return;
    }
    toast.success(row.is_active ? "Deactivated" : "Activated");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Party Types</h2>
          <p className="text-sm text-muted-foreground">{rows.length} types</p>
        </div>
        {canManage && (
          <Button onClick={openAdd} size="sm">
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Type
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Code</th>
              <th className="text-left p-3 font-medium">Name</th>
              <th className="text-left p-3 font-medium">Description</th>
              <th className="text-center p-3 font-medium">System</th>
              <th className="text-center p-3 font-medium">Status</th>
              <th className="text-center p-3 font-medium">Order</th>
              {canManage && <th className="p-3" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/25">
                <td className="p-3 font-mono text-xs font-medium">{row.type_code}</td>
                <td className="p-3">
                  <div>{row.type_name}</div>
                  {row.type_name_ar && <div className="text-xs text-muted-foreground">{row.type_name_ar}</div>}
                </td>
                <td className="p-3 text-muted-foreground max-w-xs truncate">{row.description ?? "—"}</td>
                <td className="p-3 text-center">
                  {row.is_system && <Badge variant="outline" className="text-xs">System</Badge>}
                </td>
                <td className="p-3 text-center">
                  <Badge className={row.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}>
                    {row.is_active ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="p-3 text-center text-muted-foreground">{row.sort_order}</td>
                {canManage && (
                  <td className="p-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(row)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleToggle(row)} title={row.is_active ? "Deactivate" : "Activate"}>
                        <Power className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ERPChildDialogForm
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        title={editing ? "Edit Party Type" : "Add Party Type"}
        subtitle="Define a party classification type"
        icon={<Layers className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="md"
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <RequiredLabel required>Code</RequiredLabel>
            <Input
              value={form.type_code}
              onChange={(e) => setForm((f) => ({ ...f, type_code: e.target.value.toUpperCase() }))}
              placeholder="e.g. CUSTOMER"
              disabled={!!editing}
              className="font-mono"
            />
          </div>
          <div className="col-span-6">
            <Label>Sort Order</Label>
            <Input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))} />
          </div>
          <div className="col-span-6">
            <RequiredLabel required>Name (English)</RequiredLabel>
            <Input value={form.type_name} onChange={(e) => setForm((f) => ({ ...f, type_name: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Name (Arabic)</Label>
            <Input value={form.type_name_ar} onChange={(e) => setForm((f) => ({ ...f, type_name_ar: e.target.value }))} dir="rtl" />
          </div>
          <div className="col-span-12">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
          </div>
          <div className="col-span-6 flex items-center gap-3">
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
            <Label>Active</Label>
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}
