"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Phone, Mail } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { LookupSelect } from "@/components/erp/lookup-select";
import { RequiredLabel } from "@/components/erp/required-label";
import type { CustomerContact } from "@/features/master-data/customers/types";
import {
  getCustomerContacts,
  deleteCustomerContact,
  createCustomerContact,
  updateCustomerContact,
} from "@/server/actions/master-data/customer-contacts";

type CustomerContactsSectionProps = {
  customerId: number;
  disabled?: boolean;
};

export function CustomerContactsSection({ customerId, disabled }: CustomerContactsSectionProps) {
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<CustomerContact | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    contact_name_en: "",
    contact_name_ar: "",
    designation: "",
    department: "",
    contact_type_code: null as string | null,
    email: "",
    mobile: "",
    phone: "",
    whatsapp: "",
    is_primary: false,
    is_authorized_signatory: false,
    is_decision_maker: false,
    is_finance_contact: false,
    is_operations_contact: false,
    preferred_communication_code: null as string | null,
    notes: "",
    status_code: "ACTIVE",
  });

  const loadContacts = async () => {
    setLoading(true);
    const result = await getCustomerContacts(customerId);
    if (result.success && result.data) {
      setContacts(result.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadContacts();
  }, [customerId]);

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this contact?")) return;
    const result = await deleteCustomerContact(id);
    if (result.success) {
      toast.success("Contact deleted");
      loadContacts();
    } else {
      toast.error(result.error ?? "Failed to delete contact");
    }
  };

  const openAddDialog = () => {
    setEditingContact(null);
    setFormData({
      contact_name_en: "",
      contact_name_ar: "",
      designation: "",
      department: "",
      contact_type_code: null,
      email: "",
      mobile: "",
      phone: "",
      whatsapp: "",
      is_primary: false,
      is_authorized_signatory: false,
      is_decision_maker: false,
      is_finance_contact: false,
      is_operations_contact: false,
      preferred_communication_code: null,
      notes: "",
      status_code: "ACTIVE",
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (contact: CustomerContact) => {
    setEditingContact(contact);
    setFormData({
      contact_name_en: contact.contact_name_en,
      contact_name_ar: contact.contact_name_ar || "",
      designation: contact.designation || "",
      department: contact.department || "",
      contact_type_code: contact.contact_type_code,
      email: contact.email || "",
      mobile: contact.mobile || "",
      phone: contact.phone || "",
      whatsapp: contact.whatsapp || "",
      is_primary: contact.is_primary,
      is_authorized_signatory: contact.is_authorized_signatory,
      is_decision_maker: contact.is_decision_maker,
      is_finance_contact: contact.is_finance_contact,
      is_operations_contact: contact.is_operations_contact,
      preferred_communication_code: contact.preferred_communication_code,
      notes: contact.notes || "",
      status_code: contact.status_code,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const payload = {
        ...formData,
        customer_id: customerId,
        contact_name_ar: formData.contact_name_ar || null,
        designation: formData.designation || null,
        department: formData.department || null,
        email: formData.email || null,
        mobile: formData.mobile || null,
        phone: formData.phone || null,
        whatsapp: formData.whatsapp || null,
        notes: formData.notes || null,
        sort_order: 0,
      };

      const result = editingContact
        ? await updateCustomerContact({ id: editingContact.id, contact_code: editingContact.contact_code, ...payload })
        : await createCustomerContact(payload);

      if (result.success) {
        toast.success(editingContact ? "Contact updated" : "Contact created");
        setIsDialogOpen(false);
        loadContacts();
      } else {
        toast.error(result.error ?? "Failed to save contact");
      }
    } catch (error) {
      toast.error("An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading contacts...</div>;

  return (
    <div>
      {!disabled && (
        <Button size="sm" className="mb-4" onClick={openAddDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Add Contact
        </Button>
      )}

      {contacts.length === 0 ? (
        <div className="text-sm text-muted-foreground p-4 border border-dashed rounded-md">
          No contacts added yet
        </div>
      ) : (
        <div className="space-y-3">
          {contacts.map((contact) => (
            <div key={contact.id} className="p-4 border rounded-md">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium">{contact.contact_name_en}</span>
                    {contact.is_primary && <Badge variant="default" className="text-xs">Primary</Badge>}
                    {contact.is_authorized_signatory && <Badge variant="secondary" className="text-xs">Signatory</Badge>}
                  </div>
                  {contact.designation && <div className="text-sm text-muted-foreground">{contact.designation}</div>}
                  <div className="flex items-center gap-4 mt-2 text-sm">
                    {contact.email && (
                      <div className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {contact.email}
                      </div>
                    )}
                    {contact.mobile && (
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {contact.mobile}
                      </div>
                    )}
                  </div>
                </div>
                {!disabled && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(contact)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(contact.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingContact ? "Edit Contact" : "Add Contact"}</DialogTitle>
            <DialogDescription>
              {editingContact ? "Update contact information" : "Add a new contact for this customer"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {editingContact && (
              <div className="bg-muted p-3 rounded-md">
                <Label className="text-xs text-muted-foreground">Contact Code</Label>
                <div className="font-mono font-medium">{editingContact.contact_code}</div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <RequiredLabel htmlFor="contact_name_en" required={true}>Contact Name (English)</RequiredLabel>
                <Input
                  id="contact_name_en"
                  value={formData.contact_name_en}
                  onChange={(e) => setFormData({ ...formData, contact_name_en: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label htmlFor="contact_name_ar">Contact Name (Arabic)</Label>
                <Input
                  id="contact_name_ar"
                  value={formData.contact_name_ar}
                  onChange={(e) => setFormData({ ...formData, contact_name_ar: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="designation">Designation</Label>
                <Input
                  id="designation"
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="department">Department</Label>
                <Input
                  id="department"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="contact_type_code">Contact Type</Label>
                <LookupSelect
                  categoryCode="CONTACT_TYPES"
                  value={formData.contact_type_code}
                  onValueChange={(v) => setFormData({ ...formData, contact_type_code: v as string | null })}
                  valueField="code"
                />
              </div>

              <div>
                <RequiredLabel htmlFor="email" required={true}>Email</RequiredLabel>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">* At least one contact method (email, mobile, or phone) is required</p>
              </div>

              <div>
                <Label htmlFor="mobile">Mobile</Label>
                <Input
                  id="mobile"
                  value={formData.mobile}
                  onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input
                  id="whatsapp"
                  value={formData.whatsapp}
                  onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                />
              </div>

              <div>
                <Label htmlFor="preferred_communication_code">Preferred Communication</Label>
                <LookupSelect
                  categoryCode="COMMUNICATION_PREFERENCE_TYPES"
                  value={formData.preferred_communication_code}
                  onValueChange={(v) => setFormData({ ...formData, preferred_communication_code: v as string | null })}
                  valueField="code"
                />
              </div>

              <div>
                <Label htmlFor="status_code" className="required">Status</Label>
                <LookupSelect
                  categoryCode="PARTY_STATUS_TYPES"
                  value={formData.status_code}
                  onValueChange={(v) => setFormData({ ...formData, status_code: v as string })}
                  valueField="code"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Flags</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_primary"
                    checked={formData.is_primary}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_primary: !!checked })}
                  />
                  <Label htmlFor="is_primary" className="font-normal">Primary Contact</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_authorized_signatory"
                    checked={formData.is_authorized_signatory}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_authorized_signatory: !!checked })}
                  />
                  <Label htmlFor="is_authorized_signatory" className="font-normal">Authorized Signatory</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_decision_maker"
                    checked={formData.is_decision_maker}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_decision_maker: !!checked })}
                  />
                  <Label htmlFor="is_decision_maker" className="font-normal">Decision Maker</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_finance_contact"
                    checked={formData.is_finance_contact}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_finance_contact: !!checked })}
                  />
                  <Label htmlFor="is_finance_contact" className="font-normal">Finance Contact</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_operations_contact"
                    checked={formData.is_operations_contact}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_operations_contact: !!checked })}
                  />
                  <Label htmlFor="is_operations_contact" className="font-normal">Operations Contact</Label>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : editingContact ? "Update Contact" : "Add Contact"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
