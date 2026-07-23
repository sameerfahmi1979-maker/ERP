/**
 * Template: Sample Quotation (English)
 * Template Key: sample-quotation-en
 * Phase: ERP PDF.1 — Production PDF Generation Framework (2026-07-23)
 *
 * Proof-set: One commercial document (quotation)
 * Uses a stub data loader so the proof can be rendered without a real quotation module.
 */

import React from "react";
import {
  DocumentPage,
  DocumentHeader,
  CompanyBranding,
  DocumentTitle,
  DocumentMetadata,
  PartyBlock,
  DocumentTable,
  TotalsBlock,
  NotesBlock,
  TermsBlock,
  SignatureBlock,
  DocumentFooter,
} from "@/components/erp/print";
import type { DocumentTableColumn } from "@/components/erp/print";

interface QuotationLine {
  seq: number;
  description: string;
  qty: number;
  unit: string;
  unitPrice: string;
  total: string;
}

export interface SampleQuotationData {
  quotationNo: string;
  quotationDate: string;
  validUntil: string;
  status: string;
  // Company
  companyNameEn: string;
  companyNameAr?: string;
  logoUrl?: string;
  addressBlockEn?: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
  footerTextEn?: string;
  // Customer
  customerName: string;
  customerAddress?: string;
  customerRef?: string;
  // Lines
  lines: QuotationLine[];
  currency: string;
  subtotal: string;
  vat: string;
  total: string;
  // Notes / terms
  notes?: string;
  terms?: string;
}

// ─── Data Loader (Stub) ────────────────────────────────────────────────────

export async function loadSampleQuotationData(params: {
  recordType: string;
  recordId: number;
  ownerCompanyId: number;
  locale: string;
}): Promise<SampleQuotationData> {
  // Stub: returns fixture data for proof-set demonstration
  // In a real module, this would query the quotations table
  void params;
  return {
    quotationNo: "QUO-2026-0001",
    quotationDate: "23 July 2026",
    validUntil: "22 August 2026",
    status: "Draft",
    companyNameEn: "Alliance Gulf Transport & Construction",
    companyNameAr: "تحالف الخليج للنقل والإنشاءات",
    addressBlockEn: "Dubai, United Arab Emirates\nP.O. Box 12345",
    phone: "+971 4 000 0000",
    email: "info@algt.ae",
    taxNumber: "100123456789003",
    footerTextEn: "Alliance Gulf Transport & Construction LLC — Dubai, UAE",
    customerName: "Al Mansoori Group LLC",
    customerAddress: "Abu Dhabi, UAE",
    customerRef: "RFQ-2026-456",
    currency: "AED",
    subtotal: "50,000.00",
    vat: "2,500.00",
    total: "52,500.00",
    lines: [
      { seq: 1, description: "Scaffolding Services — Zone A (Monthly)", qty: 1, unit: "Month", unitPrice: "20,000.00", total: "20,000.00" },
      { seq: 2, description: "Heavy Equipment Rental — 50T Crane", qty: 5, unit: "Day", unitPrice: "4,000.00", total: "20,000.00" },
      { seq: 3, description: "Manpower Supply — Skilled Labour (10 workers)", qty: 10, unit: "Day", unitPrice: "1,000.00", total: "10,000.00" },
    ],
    notes: "Prices are valid for 30 days from the quotation date.",
    terms: "1. Payment terms: 30 days net.\n2. All prices are exclusive of VAT (5%).\n3. Work to commence within 7 days of order confirmation.",
  };
}

// ─── Column Definitions ────────────────────────────────────────────────────

const QUOTATION_COLUMNS: DocumentTableColumn<QuotationLine>[] = [
  { key: "seq", header: "#", align: "center", width: "8mm", render: (r) => r.seq },
  { key: "description", header: "Description", render: (r) => r.description },
  { key: "qty", header: "Qty", align: "right", width: "12mm", numeric: true, render: (r) => r.qty },
  { key: "unit", header: "Unit", width: "14mm", render: (r) => r.unit },
  { key: "unitPrice", header: "Unit Price", align: "right", width: "22mm", numeric: true, render: (r) => r.unitPrice },
  { key: "total", header: "Total", align: "right", width: "22mm", numeric: true, render: (r) => r.total },
];

// ─── Renderer ─────────────────────────────────────────────────────────────

export function renderSampleQuotation(data: unknown): React.ReactElement {
  const d = data as SampleQuotationData;

  return (
    <DocumentPage direction="ltr" lang="en">
      <DocumentHeader
        logoUrl={d.logoUrl}
        companyNameEn={d.companyNameEn}
        companyNameAr={d.companyNameAr}
        documentNo={d.quotationNo}
        documentTypeLabel="Quotation"
        status={d.status}
      />

      <CompanyBranding
        addressBlockEn={d.addressBlockEn}
        phone={d.phone}
        email={d.email}
        taxNumber={d.taxNumber}
      />

      <DocumentTitle title={`Quotation ${d.quotationNo}`} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6mm", margin: "4mm 0" }}>
        <PartyBlock
          label="Bill To"
          name={d.customerName}
          address={d.customerAddress}
          ref={d.customerRef}
        />
        <DocumentMetadata
          columns={1}
          items={[
            { label: "Quotation Date", value: d.quotationDate },
            { label: "Valid Until", value: d.validUntil },
            { label: "Currency", value: d.currency },
            { label: "Status", value: d.status },
          ]}
        />
      </div>

      <DocumentTable
        columns={QUOTATION_COLUMNS}
        data={d.lines}
        showRowNumbers={false}
        emptyMessage="No line items"
      />

      <TotalsBlock
        currency={d.currency}
        rows={[
          { label: "Subtotal", value: d.subtotal },
          { label: "VAT (5%)", value: d.vat },
          { label: "Total", labelAr: "المجموع", value: d.total, isTotal: true },
        ]}
      />

      {d.notes && <NotesBlock notes={d.notes} />}
      {d.terms && <TermsBlock terms={d.terms} />}

      <SignatureBlock
        slots={[
          { title: "Prepared By" },
          { title: "Authorized Signatory" },
          { title: "Customer Acceptance" },
        ]}
      />

      <DocumentFooter footerTextEn={d.footerTextEn} showPageNumbers={true} />
    </DocumentPage>
  );
}
