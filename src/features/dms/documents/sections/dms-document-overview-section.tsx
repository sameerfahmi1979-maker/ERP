"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ERPCombobox } from "@/components/erp/combobox";
import { RequiredLabel } from "@/components/erp/required-label";
import { OwnerCompanySelect } from "@/components/erp/organizations/owner-company-select";
import { BranchSelect } from "@/components/erp/organizations/branch-select";
import { PartySelect } from "@/components/erp/party-select";
import type { DmsDocumentRow } from "@/server/actions/dms/documents";
import { DMS_DOCUMENT_STATUSES, DMS_CONFIDENTIALITY_LEVELS } from "../dms-document-constants";

interface DocumentType {
  id: number;
  name_en: string;
  type_code: string;
  category_id: number | null;
  requires_expiry_tracking: boolean;
  default_confidentiality: string;
}

interface Category {
  id: number;
  name_en: string;
  category_code: string;
}

interface DmsDocumentOverviewSectionProps {
  doc: Partial<DmsDocumentRow> | null;
  isViewing: boolean;
  documentTypes: DocumentType[];
  categories: Category[];
  documentTypeId: number | null;
  setDocumentTypeId: (id: number | null) => void;
  categoryId: number | null;
  setCategoryId: (id: number | null) => void;
  confidentialityLevel: string;
  setConfidentialityLevel: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
  owningCompanyId: number | null;
  setOwningCompanyId: (id: number | null) => void;
  owningBranchId: number | null;
  setOwningBranchId: (id: number | null) => void;
  partyId: number | null;
  setPartyId: (id: number | null) => void;
}

export function DmsDocumentOverviewSection({
  doc,
  isViewing,
  documentTypes,
  categories,
  documentTypeId,
  setDocumentTypeId,
  categoryId,
  setCategoryId,
  confidentialityLevel,
  setConfidentialityLevel,
  status,
  setStatus,
  owningCompanyId,
  setOwningCompanyId,
  owningBranchId,
  setOwningBranchId,
  partyId,
  setPartyId,
}: DmsDocumentOverviewSectionProps) {
  const [requiresExpiry, setRequiresExpiry] = useState(false);

  // Controlled state for text/date inputs to avoid Base UI "defaultValue after init" warning
  const [title, setTitle]           = useState(doc?.title ?? "");
  const [description, setDescription] = useState(doc?.description ?? "");
  const [issueDate, setIssueDate]   = useState(doc?.issue_date ?? "");
  const [expiryDate, setExpiryDate] = useState(doc?.expiry_date ?? "");

  useEffect(() => {
    if (documentTypeId) {
      const dt = documentTypes.find((t) => t.id === documentTypeId);
      if (dt) {
        setRequiresExpiry(dt.requires_expiry_tracking);
        if (!categoryId && dt.category_id) {
          setCategoryId(dt.category_id);
        }
        if (confidentialityLevel === "internal" || !confidentialityLevel) {
          setConfidentialityLevel(dt.default_confidentiality);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentTypeId]);

  const dtOptions = documentTypes.map((t) => ({ value: t.id, label: t.name_en }));
  const catOptions = categories.map((c) => ({ value: c.id, label: c.name_en }));

  return (
    <div className="space-y-4">
      {doc?.document_no && (
        <div>
          <Label className="text-xs text-muted-foreground">Document Number</Label>
          <div className="mt-1 font-mono font-semibold text-sm text-primary">{doc.document_no}</div>
        </div>
      )}

      <div>
        <RequiredLabel htmlFor="dms-title">Title</RequiredLabel>
        <Input
          id="dms-title"
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Document title"
          disabled={isViewing}
          required
        />
      </div>

      <div>
        <Label htmlFor="dms-description">Description</Label>
        <Textarea
          id="dms-description"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
          disabled={isViewing}
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <RequiredLabel htmlFor="dms-doc-type">Document Type</RequiredLabel>
          <ERPCombobox
            options={dtOptions}
            value={documentTypeId}
            onValueChange={(v) => setDocumentTypeId(v as number | null)}
            placeholder="Select document type"
            disabled={isViewing}
            searchPlaceholder="Search types..."
          />
          <input type="hidden" name="document_type_id" value={documentTypeId ?? ""} />
        </div>

        <div>
          <RequiredLabel htmlFor="dms-category">Category</RequiredLabel>
          <ERPCombobox
            options={catOptions}
            value={categoryId}
            onValueChange={(v) => setCategoryId(v as number | null)}
            placeholder="Select category"
            disabled={isViewing}
            searchPlaceholder="Search categories..."
          />
          <input type="hidden" name="category_id" value={categoryId ?? ""} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="dms-status">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v ?? "draft")} disabled={isViewing}>
            <SelectTrigger id="dms-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DMS_DOCUMENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="status" value={status} />
        </div>

        <div>
          <Label htmlFor="dms-confidentiality">Confidentiality</Label>
          <Select value={confidentialityLevel} onValueChange={(v) => setConfidentialityLevel(v ?? "internal")} disabled={isViewing}>
            <SelectTrigger id="dms-confidentiality">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DMS_CONFIDENTIALITY_LEVELS.map((c) => (
                <SelectItem key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="confidentiality_level" value={confidentialityLevel} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="dms-issue-date">Issue Date</Label>
          <Input
            id="dms-issue-date"
            name="issue_date"
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            disabled={isViewing}
          />
        </div>

        <div>
          <Label htmlFor="dms-expiry-date">
            Expiry Date
            {requiresExpiry && <span className="text-red-500 ml-1">*</span>}
          </Label>
          <Input
            id="dms-expiry-date"
            name="expiry_date"
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            disabled={isViewing}
            required={requiresExpiry}
          />
          {requiresExpiry && (
            <p className="text-xs text-amber-600 mt-1">This document type requires expiry tracking.</p>
          )}
        </div>
      </div>

      {/* ── Owning Organization ── */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Owning Company</Label>
          <OwnerCompanySelect
            value={owningCompanyId}
            onValueChange={(id) => {
              setOwningCompanyId(id);
              if (id !== owningCompanyId) {
                setOwningBranchId(null);
              }
            }}
            allowClear
            disabled={isViewing}
            placeholder="Select company..."
          />
          <input type="hidden" name="owning_company_id" value={owningCompanyId ?? ""} />
        </div>
        <div>
          <Label>Owning Branch</Label>
          <BranchSelect
            value={owningBranchId}
            onValueChange={setOwningBranchId}
            ownerCompanyId={owningCompanyId}
            allowClear
            disabled={isViewing || !owningCompanyId}
          />
          <input type="hidden" name="owning_branch_id" value={owningBranchId ?? ""} />
        </div>
      </div>

      {/* ── Related Party ── */}
      <div>
        <Label>Related Party</Label>
        <p className="text-xs text-muted-foreground mb-1.5">
          The external party this document belongs to or describes — customer, vendor, employee, authority, etc. Optional.
        </p>
        <PartySelect
          value={partyId}
          onValueChange={setPartyId}
          allowClear
          disabled={isViewing}
          placeholder="Search parties..."
        />
        <input type="hidden" name="party_id" value={partyId ?? ""} />
      </div>

      {doc?.legacy_document_code && (
        <div>
          <Label className="text-xs text-muted-foreground">Legacy Document Code</Label>
          <div className="mt-1 text-xs font-mono text-muted-foreground">{doc.legacy_document_code}</div>
        </div>
      )}
    </div>
  );
}
