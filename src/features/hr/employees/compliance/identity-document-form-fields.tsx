"use client";

import { AlertTriangle, Sparkles } from "lucide-react";
import { ERPCombobox } from "@/components/erp/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CountrySelect } from "@/components/erp/geography/country-select";
import { EmirateSelect } from "@/components/erp/geography/emirate-select";
import { CitySelect } from "@/components/erp/geography/city-select";
import { PartySelect } from "@/components/erp/party-select";
import { OwnerCompanySelect } from "@/components/erp/organizations/owner-company-select";
import { cn } from "@/lib/utils";
import {
  type IdentityDocumentFormState,
  IDENTITY_DOC_STATUS_OPTIONS,
  IDENTITY_VERIFICATION_OPTIONS,
  IDENTITY_RENEWAL_STATUS_OPTIONS,
  ISSUING_AUTHORITY_PARTY_TYPE_CODES,
} from "@/lib/hr/compliance/identity-document-form";

type DocTypeOption = { value: number; label: string };

type Props = {
  form: IdentityDocumentFormState;
  setForm: React.Dispatch<React.SetStateAction<IdentityDocumentFormState>>;
  docTypeOptions: DocTypeOption[];
  fieldConfidence?: Record<string, number>;
  prefillBanner?: {
    documentTitle: string;
    documentNo: string;
    prefillSource: string;
    warning?: string | null;
    linkedToEmployee?: boolean;
  } | null;
};

function lowConfidence(confidence: Record<string, number> | undefined, field: string): boolean {
  const score = confidence?.[field];
  return score != null && score < 0.7;
}

function FieldHint({ field, confidence }: { field: string; confidence?: Record<string, number> }) {
  if (!lowConfidence(confidence, field)) return null;
  return (
    <p className="text-[11px] text-amber-600 mt-0.5 flex items-center gap-1">
      <AlertTriangle className="h-3 w-3 shrink-0" />
      AI confidence low — please verify
    </p>
  );
}

export function IdentityDocumentFormFields({
  form,
  setForm,
  docTypeOptions,
  fieldConfidence,
  prefillBanner,
}: Props) {
  return (
    <div className="space-y-4">
      {prefillBanner && (
        <div className="rounded-lg border border-violet-200 bg-violet-50/80 px-4 py-3 text-sm">
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-violet-600 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-violet-900">Review AI-prefilled fields before saving</p>
              <p className="text-violet-800/80 mt-0.5">
                Source: {prefillBanner.documentTitle || prefillBanner.documentNo}
                {prefillBanner.documentNo && prefillBanner.documentTitle ? ` (${prefillBanner.documentNo})` : ""}
              </p>
              {prefillBanner.warning && (
                <p className="text-amber-700 mt-1 flex items-start gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  {prefillBanner.warning}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-6">
          <Label>Document Type <span className="text-destructive">*</span></Label>
          <ERPCombobox
            value={form.document_type_id}
            onValueChange={(v) => setForm((p) => ({ ...p, document_type_id: Number(v) }))}
            options={docTypeOptions}
            placeholder="Select document type..."
            required
          />
        </div>
        <div className="col-span-6">
          <Label>Document Number <span className="text-destructive">*</span></Label>
          <Input
            value={form.document_number}
            onChange={(e) => setForm((p) => ({ ...p, document_number: e.target.value }))}
            placeholder="Document number"
            className={cn(lowConfidence(fieldConfidence, "document_number") && "border-amber-400")}
          />
          <FieldHint field="document_number" confidence={fieldConfidence} />
        </div>
        <div className="col-span-6">
          <Label>Issue Date</Label>
          <Input
            type="date"
            value={form.issue_date}
            onChange={(e) => setForm((p) => ({ ...p, issue_date: e.target.value }))}
            className={cn(lowConfidence(fieldConfidence, "issue_date") && "border-amber-400")}
          />
          <FieldHint field="issue_date" confidence={fieldConfidence} />
        </div>
        <div className="col-span-6">
          <Label>Expiry Date</Label>
          <Input
            type="date"
            value={form.expiry_date}
            onChange={(e) => setForm((p) => ({ ...p, expiry_date: e.target.value }))}
            className={cn(lowConfidence(fieldConfidence, "expiry_date") && "border-amber-400")}
          />
          <FieldHint field="expiry_date" confidence={fieldConfidence} />
        </div>
        <div className="col-span-6">
          <Label>Issuing Authority</Label>
          <PartySelect
            value={form.issuing_authority_party_id}
            onValueChange={(v) => setForm((p) => ({ ...p, issuing_authority_party_id: v }))}
            typeCodes={[...ISSUING_AUTHORITY_PARTY_TYPE_CODES]}
            placeholder="Select issuing authority..."
            allowClear
          />
        </div>
        <div className="col-span-6">
          <Label>Issue Country</Label>
          <CountrySelect
            value={form.issue_country_id}
            onValueChange={(v) =>
              setForm((p) => ({
                ...p,
                issue_country_id: v,
                issuing_emirate_id: null,
                issue_city_id: null,
              }))
            }
          />
        </div>
        <div className="col-span-6">
          <Label>Issuing Region</Label>
          <EmirateSelect
            countryId={form.issue_country_id}
            value={form.issuing_emirate_id}
            onValueChange={(v) =>
              setForm((p) => ({
                ...p,
                issuing_emirate_id: v,
                issue_city_id: null,
              }))
            }
            disabled={!form.issue_country_id}
          />
        </div>
        <div className="col-span-6">
          <Label>Place of Issue</Label>
          <CitySelect
            emirateId={form.issuing_emirate_id}
            value={form.issue_city_id}
            onValueChange={(v) => setForm((p) => ({ ...p, issue_city_id: v }))}
            disabled={!form.issuing_emirate_id}
            placeholder={form.issuing_emirate_id ? "Select city..." : "Select issuing region first"}
          />
        </div>
        <div className="col-span-4">
          <Label>Status</Label>
          <ERPCombobox
            value={form.status}
            onValueChange={(v) => setForm((p) => ({ ...p, status: String(v) }))}
            options={[...IDENTITY_DOC_STATUS_OPTIONS]}
            placeholder="Status..."
          />
        </div>
        <div className="col-span-4">
          <Label>Verification</Label>
          <ERPCombobox
            value={form.verification_status}
            onValueChange={(v) => setForm((p) => ({ ...p, verification_status: String(v) }))}
            options={[...IDENTITY_VERIFICATION_OPTIONS]}
            placeholder="Verification..."
          />
        </div>
        <div className="col-span-4">
          <Label>Renewal Status</Label>
          <ERPCombobox
            value={form.renewal_status}
            onValueChange={(v) => setForm((p) => ({ ...p, renewal_status: String(v) }))}
            options={[...IDENTITY_RENEWAL_STATUS_OPTIONS]}
            placeholder="Renewal..."
          />
        </div>
        <div className="col-span-12 border-t pt-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">UAE-Specific Fields</p>
        </div>
        <div className="col-span-6">
          <Label>Emirates ID Application No</Label>
          <Input value={form.emirates_id_application_no} onChange={(e) => setForm((p) => ({ ...p, emirates_id_application_no: e.target.value }))} />
        </div>
        <div className="col-span-6">
          <Label>UID Number</Label>
          <Input value={form.uid_number} onChange={(e) => setForm((p) => ({ ...p, uid_number: e.target.value }))} />
        </div>
        <div className="col-span-6">
          <Label>Visa File Number</Label>
          <Input value={form.visa_file_number} onChange={(e) => setForm((p) => ({ ...p, visa_file_number: e.target.value }))} />
        </div>
        <div className="col-span-6">
          <Label>Labour Card Number</Label>
          <Input value={form.labour_card_number} onChange={(e) => setForm((p) => ({ ...p, labour_card_number: e.target.value }))} />
        </div>
        <div className="col-span-6">
          <Label>Work Permit Number</Label>
          <Input value={form.work_permit_number} onChange={(e) => setForm((p) => ({ ...p, work_permit_number: e.target.value }))} />
        </div>
        <div className="col-span-6">
          <Label>MOHRE Person Code</Label>
          <Input value={form.mohre_person_code} onChange={(e) => setForm((p) => ({ ...p, mohre_person_code: e.target.value }))} />
        </div>
        <div className="col-span-6">
          <Label>Profession on Document</Label>
          <Input value={form.profession_on_document} onChange={(e) => setForm((p) => ({ ...p, profession_on_document: e.target.value }))} />
        </div>
        <div className="col-span-6">
          <Label>Sponsor Company</Label>
          <OwnerCompanySelect value={form.sponsor_company_id} onValueChange={(v) => setForm((p) => ({ ...p, sponsor_company_id: v }))} />
        </div>
        <div className="col-span-12">
          <Label>Notes</Label>
          <Textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} />
        </div>
      </div>
    </div>
  );
}
