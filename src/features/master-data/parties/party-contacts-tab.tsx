"use client";

import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Edit, Trash2, Phone, Mail, UserRound } from "lucide-react";
import { toast } from "sonner";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { RequiredLabel } from "@/components/erp/required-label";
import { usePartyContactsQuery } from "./hooks/use-party-child-queries";
import { invalidatePartyContacts } from "@/lib/query/invalidation";
import { useRealtimeSync } from "@/hooks/realtime/use-realtime-sync";
import {
  createPartyContact,
  updatePartyContact,
  deletePartyContact,
} from "@/server/actions/master-data/party-contacts";
import {
  getPartyContactRoles,
  getPartyContactDepartments,
} from "@/server/actions/master-data/parties";
import type { PartyContact } from "./party-types";

type PartyContactsTabProps = {
  partyId: number;
  disabled?: boolean;
  onChildOpen?: (open: boolean) => void;
};

const emptyForm = {
  full_name: "",
  designation: "",
  department_id: null as number | null,
  contact_role_id: null as number | null,
  email: "",
  phone: "",
  mobile: "",
  whatsapp: "",
  is_primary: false,
  is_accounts_contact: false,
  is_sales_contact: false,
  is_operations_contact: false,
  is_hse_contact: false,
  is_documents_contact: false,
  is_active: true,
  notes: "",
};

export function PartyContactsTab({ partyId, disabled, onChildOpen }: PartyContactsTabProps) {
  const queryClient = useQueryClient();
  const { items: contacts, isLoading } = usePartyContactsQuery(partyId);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const setDialogOpen = (open: boolean) => { setIsDialogOpen(open); onChildOpen?.(open); };
  const [editing, setEditing] = useState<PartyContact | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  // ERP REALTIME.1B — scoped live sync for this party's contacts.
  // Subscription is suppressed while a child dialog is open to protect unsaved form data.
  useRealtimeSync({
    table: "party_contacts",
    event: "*",
    filter: `party_id=eq.${partyId}`,
    enabled: !isDialogOpen,
    debounceMs: 400,
    onEvent: () => {
      invalidatePartyContacts(queryClient, partyId);
    },
  });

  const { data: roles } = useQuery({
    queryKey: ["party_contact_roles"],
    queryFn: async () => (await getPartyContactRoles()).data ?? [],
    staleTime: 5 * 60 * 1000,
  });

  const { data: departments } = useQuery({
    queryKey: ["party_contact_departments"],
    queryFn: async () => (await getPartyContactDepartments()).data ?? [],
    staleTime: 5 * 60 * 1000,
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (item: PartyContact) => {
    setEditing(item);
    setForm({
      full_name: item.full_name,
      designation: item.designation ?? "",
      department_id: item.department_id,
      contact_role_id: item.contact_role_id,
      email: item.email ?? "",
      phone: item.phone ?? "",
      mobile: item.mobile ?? "",
      whatsapp: item.whatsapp ?? "",
      is_primary: item.is_primary,
      is_accounts_contact: item.is_accounts_contact,
      is_sales_contact: item.is_sales_contact,
      is_operations_contact: item.is_operations_contact,
      is_hse_contact: item.is_hse_contact,
      is_documents_contact: item.is_documents_contact,
      is_active: item.is_active,
      notes: item.notes ?? "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this contact?")) return;
    const result = await deletePartyContact(id);
    if (result.success) {
      toast.success("Contact deleted");
      invalidatePartyContacts(queryClient, partyId);
    } else {
      toast.error(result.error ?? "Failed to delete");
    }
  };

  const handleSubmit = async () => {
    if (!form.full_name) {
      toast.error("Full name is required");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        party_id: partyId,
        full_name: form.full_name,
        designation: form.designation || null,
        department_id: form.department_id,
        contact_role_id: form.contact_role_id,
        email: form.email || null,
        phone: form.phone || null,
        mobile: form.mobile || null,
        whatsapp: form.whatsapp || null,
        is_primary: form.is_primary,
        is_accounts_contact: form.is_accounts_contact,
        is_sales_contact: form.is_sales_contact,
        is_operations_contact: form.is_operations_contact,
        is_hse_contact: form.is_hse_contact,
        is_documents_contact: form.is_documents_contact,
        is_active: form.is_active,
        notes: form.notes || null,
      };

      const result = editing
        ? await updatePartyContact({ id: editing.id, ...payload })
        : await createPartyContact(payload);

      if (result.success) {
        toast.success(`Contact ${editing ? "updated" : "added"}`);
        setDialogOpen(false);
        invalidatePartyContacts(queryClient, partyId);
      } else {
        toast.error(result.error ?? "Failed to save contact");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-4">
      {!disabled && (
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={openAdd} className="gap-2">
            <Plus className="h-4 w-4" /> Add Contact
          </Button>
        </div>
      )}

      {(contacts ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No contacts added yet.</p>
      ) : (
        <div className="space-y-2">
          {(contacts ?? []).map((contact) => (
            <div key={contact.id} className="rounded-md border p-3 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{contact.full_name}</span>
                  {contact.is_primary && <Badge className="text-xs">Primary</Badge>}
                  {contact.designation && <span className="text-xs text-muted-foreground">{contact.designation}</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {contact.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{contact.email}</span>}
                  {(contact.mobile || contact.phone) && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{contact.mobile || contact.phone}</span>}
                </div>
                <div className="flex gap-1 flex-wrap">
                  {contact.is_accounts_contact && <Badge variant="outline" className="text-xs">Accounts</Badge>}
                  {contact.is_sales_contact && <Badge variant="outline" className="text-xs">Sales</Badge>}
                  {contact.is_operations_contact && <Badge variant="outline" className="text-xs">Operations</Badge>}
                  {contact.is_hse_contact && <Badge variant="outline" className="text-xs">HSE</Badge>}
                </div>
              </div>
              {!disabled && (
                <div className="flex gap-1 shrink-0">
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(contact)}>
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(contact.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ERPChildDialogForm
        open={isDialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Edit Contact" : "Add Contact"}
        subtitle="Enter contact person details"
        icon={<UserRound className="h-5 w-5" />}
        mode={editing ? "edit" : "add"}
        size="lg"
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
      >
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12">
            <RequiredLabel required>Full Name</RequiredLabel>
            <Input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Designation</Label>
            <Input value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} />
          </div>
          <div className="col-span-6">
            <Label>Department</Label>
            <ERPCombobox
              value={form.department_id}
              onValueChange={(v) => setForm((f) => ({ ...f, department_id: v !== null ? Number(v) : null }))}
              options={(departments ?? []).map((d) => ({ value: d.id, label: d.name_en }))}
              placeholder="Select department..."
              allowClear
            />
          </div>
          <div className="col-span-6">
            <Label>Contact Role</Label>
            <ERPCombobox
              value={form.contact_role_id}
              onValueChange={(v) => setForm((f) => ({ ...f, contact_role_id: v !== null ? Number(v) : null }))}
              options={(roles ?? []).map((r) => ({ value: r.id, label: r.name_en }))}
              placeholder="Select role..."
              allowClear
            />
          </div>
          <div className="col-span-6">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="col-span-4">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="col-span-4">
            <Label>Mobile</Label>
            <Input value={form.mobile} onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))} />
          </div>
          <div className="col-span-4">
            <Label>WhatsApp</Label>
            <Input value={form.whatsapp} onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} />
          </div>
          <div className="col-span-12 grid grid-cols-3 gap-3">
            {[
              { key: "is_primary", label: "Primary" },
              { key: "is_accounts_contact", label: "Accounts" },
              { key: "is_sales_contact", label: "Sales" },
              { key: "is_operations_contact", label: "Operations" },
              { key: "is_hse_contact", label: "HSE" },
              { key: "is_documents_contact", label: "Documents" },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={`cnt-${key}`}
                  checked={!!form[key as keyof typeof form]}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, [key]: !!c }))}
                />
                <Label htmlFor={`cnt-${key}`}>{label}</Label>
              </div>
            ))}
          </div>
          <div className="col-span-12">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}
