"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { PlusCircle, Pencil, Link2 } from "lucide-react";
import { toast } from "sonner";
import { RequiredLabel } from "@/components/erp/required-label";
import {
  createRelationshipType,
  updateRelationshipType,
} from "@/server/actions/master-data/party-admin-masters";
import type { RelationshipTypeAdminRow } from "@/server/actions/master-data/party-admin-masters";
import type { AuthContext } from "@/lib/rbac/check";
import { useRouter } from "next/navigation";

type Props = {
  rows: RelationshipTypeAdminRow[];
  authContext: AuthContext;
};

type FormState = {
  relationship_code: string;
  name_en: string;
  name_ar: string;
  description: string;
  is_active: boolean;
  sort_order: number;
};

const emptyForm: FormState = {
  relationship_code: "",
  name_en: "",
  name_ar: "",
  description: "",
  is_active: true,
  sort_order: 0,
};

export function RelationshipTypesAdminTable({ rows, authContext }: Props) {
  const router = useRouter();
  const canManage = authContext.permissionCodes?.includes("master_data.parties.manage_relationships") || authContext.roleCodes?.includes("system_admin") || authContext.roleCodes?.includes("group_admin");

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RelationshipTypeAdminRow | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setIsDialogOpen(true);
  };

  const openEdit = (row: RelationshipTypeAdminRow) => {
    setEditing(row);
    setForm({
      relationship_code: row.relationship_code,
      name_en: row.name_en,
      name_ar: row.name_ar ?? "",
      description: row.description ?? "",
      is_active: row.is_active,
      sort_order: row.sort_order,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.relationship_code || !form.name_en) {
      toast.error("Code and name are required");
      return;
    }
    setIsSubmitting(true);
    const payload = {
      relationship_code: form.relationship_code.toUpperCase(),
      name_en: form.name_en,
      name_ar: form.name_ar || null,
      description: form.description || null,
      is_active: form.is_active,
      sort_order: form.sort_order,
    };

    const result = editing
      ? await updateRelationshipType(editing.id, payload)
      : await createRelationshipType(payload);

    setIsSubmitting(false);
    if (!result.success) {
      toast.error(result.error ?? "Failed to save");
      return;
    }
    toast.success(editing ? "Relationship type updated" : "Relationship type created");
    setIsDialogOpen(false);
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Party Relationship Types</h2>
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
              {canManage && <th className="p-3" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/25">
                <td className="p-3 font-mono text-xs font-medium">{row.relationship_code}</td>
                <td className="p-3">
                  <div>{row.name_en}</div>
                  {row.name_ar && <div className="text-xs text-muted-foreground">{row.name_ar}</div>}
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
                {canManage && (
                  <td className="p-3">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(row)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
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
        title={editing ? "Edit Relationship Type" : "Add Relationship Type"}
        subtitle="Define a party-to-party relationship type"
        icon={<Link2 className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="md"
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-6">
            <RequiredLabel required>Code</RequiredLabel>
            <Input
              value={form.relationship_code}
              onChange={(e) => setForm((f) => ({ ...f, relationship_code: e.target.value.toUpperCase() }))}
              placeholder="e.g. SUBSIDIARY"
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
            <Input value={form.name_en} onChange={(e) => setForm((f) => ({ ...f, name_en: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Name (Arabic)</Label>
            <Input value={form.name_ar} onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))} dir="rtl" />
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
