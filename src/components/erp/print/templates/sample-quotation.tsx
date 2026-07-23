/**
 * Template: Sample Quotation (English)
 * Template Key: sample-quotation-en
 * Phase: ERP PDF.1 — Production PDF Generation Framework (2026-07-23)
 *
 * Commercial quotation proof template.
 *
 * IMPORTANT: The ERP Sales/Quotation module is not yet implemented.
 * This template uses a real data loader that queries:
 *   - parties (for customer info, loaded by recordId)
 *   - owner_companies (for company branding, loaded by ownerCompanyId)
 * Line items are hardcoded demo data until the Sales module is built.
 *
 * Governance status: DRAFT — cannot produce official PDFs until Sales module
 * provides real quotation data and this template is promoted to 'published'.
 */

import React from "react";
import { createAdminClient } from "@/lib/supabase/admin";
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

// ─── Data Loader ──────────────────────────────────────────────────────────
// Real data loader: queries parties (by recordId = party.id for the customer)
// and owner_companies (by ownerCompanyId) for genuine ERP data.
// Line items are demo until the Sales module provides a quotation table.

export async function loadSampleQuotationData(params: {
  recordType: string;
  recordId: number;
  ownerCompanyId: number;
  locale: string;
}): Promise<SampleQuotationData> {
  const supabase = createAdminClient();

  // Load owner company branding
  const { data: company } = await supabase
    .from("owner_companies")
    .select("legal_name_en, legal_name_ar, trn")
    .eq("id", params.ownerCompanyId)
    .single();

  // Load party (customer) for demo — recordId is treated as the party ID
  const { data: party } = await supabase
    .from("parties")
    .select("trade_name_en, trade_name_ar, party_code")
    .eq("id", params.recordId)
    .single();

  // Load branding profile
  const { data: branding } = await supabase
    .from("erp_report_branding_profiles")
    .select("address_block_en, phone, email, footer_text_en")
    .eq("owner_company_id", params.ownerCompanyId)
    .limit(1)
    .single();

  const today = new Date();
  const validUntil = new Date(today);
  validUntil.setDate(validUntil.getDate() + 30);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  return {
    quotationNo: `QUO-${today.getFullYear()}-DEMO`,
    quotationDate: fmt(today),
    validUntil: fmt(validUntil),
    status: "Draft",
    companyNameEn: company?.legal_name_en ?? "Alliance Gulf Transport & Construction",
    companyNameAr: company?.legal_name_ar ?? "تحالف الخليج للنقل والإنشاءات",
    addressBlockEn: branding?.address_block_en ?? "Dubai, United Arab Emirates",
    phone: branding?.phone ?? "+971 4 000 0000",
    email: branding?.email ?? "info@algt.ae",
    taxNumber: company?.trn ?? "100000000000000",
    footerTextEn: branding?.footer_text_en ?? `${company?.legal_name_en ?? "ALGT"} — Dubai, UAE`,
    customerName: party?.trade_name_en ?? `Party #${params.recordId}`,
    customerAddress: party?.trade_name_ar ?? "",
    customerRef: `REF-${params.recordId}`,
    currency: "AED",
    subtotal: "50,000.00",
    vat: "2,500.00",
    total: "52,500.00",
    // Demo line items — replace with real quotation_lines once Sales module is built
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
