"use client";

import { useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { listCandidateOffers, createOffer, updateOffer, archiveOffer, changeOfferStatus } from "@/server/actions/hr/recruitment";
import type { OfferRow } from "@/server/actions/hr/recruitment";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Gift, Pencil, Trash2, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Props = {
  candidateId: number;
  canManage: boolean;
  onChildOpen?: (open: boolean) => void;
};

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "approved", label: "Approved" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending_approval: "bg-amber-100 text-amber-700",
  approved: "bg-cyan-100 text-cyan-700",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  withdrawn: "bg-orange-100 text-orange-700",
  expired: "bg-rose-100 text-rose-700",
  cancelled: "bg-gray-100 text-gray-700",
};

type OfferForm = {
  offer_status: string;
  offer_date: string;
  valid_until: string;
  proposed_joining_date: string;
  basic_salary: string;
  gross_salary: string;
  currency: string;
  notes: string;
};

const EMPTY_FORM: OfferForm = {
  offer_status: "draft",
  offer_date: "",
  valid_until: "",
  proposed_joining_date: "",
  basic_salary: "",
  gross_salary: "",
  currency: "AED",
  notes: "",
};

export function CandidateOffersTab({ candidateId, canManage, onChildOpen }: Props) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OfferRow | null>(null);
  const [form, setForm] = useState<OfferForm>(EMPTY_FORM);
  const [isPending, startTransition] = useTransition();

  const { data: res, isLoading } = useQuery({
    queryKey: queryKeys.recruitment.candidateOffers(candidateId),
    queryFn: () => listCandidateOffers(candidateId),
    staleTime: 30_000,
  });
  const offers = Array.isArray(res?.data) ? res.data : [];

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
    onChildOpen?.(true);
  }

  function openEdit(offer: OfferRow) {
    setEditing(offer);
    setForm({
      offer_status: offer.offer_status,
      offer_date: offer.offer_date ?? "",
      valid_until: offer.valid_until ?? "",
      proposed_joining_date: offer.proposed_joining_date ?? "",
      basic_salary: offer.basic_salary != null ? String(offer.basic_salary) : "",
      gross_salary: offer.gross_salary != null ? String(offer.gross_salary) : "",
      currency: offer.currency,
      notes: offer.notes ?? "",
    });
    setDialogOpen(true);
    onChildOpen?.(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    onChildOpen?.(false);
  }

  const set = (key: keyof OfferForm, value: string) => setForm((p) => ({ ...p, [key]: value }));

  function handleSave() {
    startTransition(async () => {
      const payload = {
        offer_status: form.offer_status as "draft" | "pending_approval" | "approved" | "sent" | "accepted" | "rejected" | "withdrawn" | "expired" | "cancelled",
        offer_date: form.offer_date || null,
        valid_until: form.valid_until || null,
        proposed_joining_date: form.proposed_joining_date || null,
        basic_salary: form.basic_salary ? parseFloat(form.basic_salary) : null,
        gross_salary: form.gross_salary ? parseFloat(form.gross_salary) : null,
        currency: form.currency || "AED",
        notes: form.notes || null,
      };

      const res = editing
        ? await updateOffer(editing.id, payload)
        : await createOffer(candidateId, payload);

      if (res.success) {
        toast.success(editing ? "Offer updated" : "Offer created");
        queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.candidateOffers(candidateId) });
        closeDialog();
      } else {
        toast.error(res.error ?? "Failed to save offer");
      }
    });
  }

  function handleStatusChange(id: number, status: string) {
    startTransition(async () => {
      const res = await changeOfferStatus(id, status);
      if (res.success) {
        toast.success(`Offer ${status}`);
        queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.candidateOffers(candidateId) });
      } else {
        toast.error(res.error ?? "Failed to update status");
      }
    });
  }

  function handleArchive(id: number) {
    startTransition(async () => {
      const res = await archiveOffer(id);
      if (res.success) {
        toast.success("Offer removed");
        queryClient.invalidateQueries({ queryKey: queryKeys.recruitment.candidateOffers(candidateId) });
      } else {
        toast.error(res.error ?? "Failed to remove");
      }
    });
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Offers</h3>
        {canManage && (
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4 mr-1" /> Create Offer
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded" />)}</div>
      ) : offers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <Gift className="h-8 w-8 mx-auto mb-2 opacity-40" />
          No offers created yet.
        </div>
      ) : (
        <div className="divide-y border rounded-lg">
          {offers.map((offer) => (
            <div key={offer.id} className="flex items-center gap-3 p-3">
              <Gift className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[offer.offer_status]}`}>
                    {offer.offer_status.replace(/_/g, " ")}
                  </span>
                  {offer.designation && <span className="text-sm font-medium">{offer.designation.designation_name_en}</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {offer.basic_salary != null ? `Basic: ${offer.basic_salary.toLocaleString()} ${offer.currency}` : "Salary: Not specified"}
                  {offer.proposed_joining_date && ` · Joining: ${offer.proposed_joining_date}`}
                  {offer.valid_until && ` · Valid until: ${offer.valid_until}`}
                </p>
              </div>
              {canManage && (
                <div className="flex gap-1">
                  {offer.offer_status === "sent" && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => handleStatusChange(offer.id, "accepted")} disabled={isPending} title="Accept"><CheckCircle className="h-4 w-4 text-green-600" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => handleStatusChange(offer.id, "rejected")} disabled={isPending} title="Reject"><XCircle className="h-4 w-4 text-red-500" /></Button>
                    </>
                  )}
                  {["draft", "pending_approval", "approved"].includes(offer.offer_status) && (
                    <Button size="sm" variant="ghost" onClick={() => handleStatusChange(offer.id, "sent")} disabled={isPending} title="Mark Sent" className="text-xs px-2">Send</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => openEdit(offer)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => handleArchive(offer.id)} disabled={isPending}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={closeDialog}
        title={editing ? "Edit Offer" : "Create Offer"}
        subtitle="Manage offer details for this candidate"
        icon={<Gift className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="lg"
        isSubmitting={isPending}
        onSubmit={handleSave}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-6">
            <Label>Offer Status</Label>
            <ERPCombobox value={form.offer_status || null} onValueChange={(v) => set("offer_status", String(v ?? "draft"))} options={STATUS_OPTIONS} placeholder="Select status" />
          </div>
          <div className="col-span-12 md:col-span-3">
            <Label>Offer Date</Label>
            <Input type="date" value={form.offer_date} onChange={(e) => set("offer_date", e.target.value)} />
          </div>
          <div className="col-span-12 md:col-span-3">
            <Label>Valid Until</Label>
            <Input type="date" value={form.valid_until} onChange={(e) => set("valid_until", e.target.value)} />
          </div>
          <div className="col-span-12 md:col-span-4">
            <Label>Proposed Joining Date</Label>
            <Input type="date" value={form.proposed_joining_date} onChange={(e) => set("proposed_joining_date", e.target.value)} />
          </div>
          <div className="col-span-12 md:col-span-3">
            <Label>Basic Salary</Label>
            <Input type="number" min={0} value={form.basic_salary} onChange={(e) => set("basic_salary", e.target.value)} placeholder="0.00" />
          </div>
          <div className="col-span-12 md:col-span-3">
            <Label>Gross Salary</Label>
            <Input type="number" min={0} value={form.gross_salary} onChange={(e) => set("gross_salary", e.target.value)} placeholder="0.00" />
          </div>
          <div className="col-span-12 md:col-span-2">
            <Label>Currency</Label>
            <Input value={form.currency} onChange={(e) => set("currency", e.target.value)} placeholder="AED" />
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Offer notes..." />
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}
