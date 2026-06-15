"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { PlusCircle, Trash2, AlertCircle, Tags } from "lucide-react";
import { toast } from "sonner";
import {
  addPartyServiceCategory,
  removePartyServiceCategory,
  getServiceCategoriesForSelect,
  getPartyServiceCategoryAssignments,
} from "@/server/actions/master-data/party-service-categories";
import { useChildTableQuery } from "@/hooks/child-tables/use-child-table-query";
import { useQuery } from "@tanstack/react-query";
import type { PartyServiceCategoryAssignment } from "@/server/actions/master-data/party-service-categories";

type Props = {
  partyId: number;
  canManage: boolean;
  onChildOpen?: (open: boolean) => void;
};

type FormState = {
  service_category_id: number | null;
  is_primary: boolean;
  remarks: string;
};

const emptyForm: FormState = {
  service_category_id: null,
  is_primary: false,
  remarks: "",
};

export function PartyServicesTab({ partyId, canManage, onChildOpen }: Props) {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const setDialogOpen = (open: boolean) => { setIsDialogOpen(open); onChildOpen?.(open); };
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: assignments, isLoading, error } = useChildTableQuery({
    tableName: "party_service_category_assignments",
    parentId: partyId,
    fetcher: getPartyServiceCategoryAssignments,
  });

  const { data: allCategoriesResult } = useQuery({
    queryKey: ["service_categories_for_select"],
    queryFn: () => getServiceCategoriesForSelect(),
    staleTime: 5 * 60 * 1000,
  });
  const allCategories = allCategoriesResult?.success ? allCategoriesResult.data ?? [] : [];

  const categoryOptions = allCategories.map((c) => ({
    value: c.id,
    label: c.category_name_en,
    code: c.category_code,
  }));

  const openAdd = () => {
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.service_category_id) {
      toast.error("Please select a service category");
      return;
    }
    setIsSubmitting(true);
    const result = await addPartyServiceCategory({
      party_id: partyId,
      service_category_id: form.service_category_id,
      is_primary: form.is_primary,
      remarks: form.remarks || null,
    });
    setIsSubmitting(false);
    if (!result.success) {
      toast.error(result.error ?? "Failed to assign service category");
      return;
    }
    toast.success("Service category assigned");
    setDialogOpen(false);
    queryClient.invalidateQueries({ queryKey: ["child", "party_service_category_assignments", partyId] });
  };

  const handleRemove = async (id: number) => {
    if (!confirm("Remove this service category assignment?")) return;
    const result = await removePartyServiceCategory(id);
    if (!result.success) {
      toast.error(result.error ?? "Failed to remove");
      return;
    }
    toast.success("Service category removed");
    queryClient.invalidateQueries({ queryKey: ["child", "party_service_category_assignments", partyId] });
  };

  if (isLoading) return <div className="flex items-center justify-center h-32 text-muted-foreground">Loading service categories…</div>;
  if (error) return <div className="text-destructive p-4">{String(error)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-sm">Services &amp; Categories</h3>
          <p className="text-xs text-muted-foreground">{assignments?.length ?? 0} active assignment(s)</p>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={openAdd}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Assign Category
          </Button>
        )}
      </div>

      {(!assignments || assignments.length === 0) ? (
        <div className="flex flex-col items-center justify-center h-24 border border-dashed rounded-md text-muted-foreground text-sm gap-2">
          <AlertCircle className="h-4 w-4" />
          No service categories assigned
        </div>
      ) : (
        <div className="grid gap-2">
          {(assignments as PartyServiceCategoryAssignment[]).map((a) => (
            <div key={a.id} className="flex items-center justify-between border rounded-md px-4 py-3">
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-medium text-sm">{a.category_name_en ?? `Category #${a.service_category_id}`}</p>
                  {a.category_code && <p className="text-xs text-muted-foreground">{a.category_code}</p>}
                  {a.remarks && <p className="text-xs text-muted-foreground mt-1">{a.remarks}</p>}
                </div>
                {a.is_primary && <Badge className="bg-blue-100 text-blue-800 text-xs">Primary</Badge>}
              </div>
              {canManage && (
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => handleRemove(a.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <ERPChildDialogForm
        open={isDialogOpen}
        onOpenChange={setDialogOpen}
        title="Assign Service Category"
        subtitle="Select a service category for this party"
        icon={<Tags className="h-5 w-5" />}
        mode="add"
        size="md"
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        submitLabel="Assign"
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <Label>Service Category *</Label>
            <ERPCombobox
              value={form.service_category_id}
              onValueChange={(v) => setForm((f) => ({ ...f, service_category_id: v !== null ? Number(v) : null }))}
              options={categoryOptions}
              placeholder="Select category..."
              showCode
            />
          </div>
          <div className="col-span-12 flex items-center gap-3">
            <Switch id="is_primary" checked={form.is_primary} onCheckedChange={(v) => setForm((f) => ({ ...f, is_primary: v }))} />
            <Label htmlFor="is_primary">Primary category</Label>
          </div>
          <div className="col-span-12">
            <Label>Remarks</Label>
            <Textarea value={form.remarks} onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))} rows={3} />
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}
