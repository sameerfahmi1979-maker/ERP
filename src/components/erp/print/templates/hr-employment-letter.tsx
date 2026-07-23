/**
 * Template: HR Employment Letter (English)
 * Template Key: hr-employment-letter-en
 * Phase: ERP PDF.1 — Production PDF Generation Framework (2026-07-23)
 */

import React from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DocumentPage,
  DocumentHeader,
  CompanyBranding,
  DocumentTitle,
  DocumentMetadata,
  SignatureBlock,
  QRVerificationBlock,
  DocumentFooter,
} from "@/components/erp/print";

// ─── Data Types ────────────────────────────────────────────────────────────

export interface HrEmploymentLetterData {
  // Letter metadata
  letterRef: string;
  letterDate: string;
  // Employee
  employeeCode: string;
  fullNameEn: string;
  fullNameAr?: string;
  jobTitle: string;
  department?: string;
  joinDate: string;
  employmentType?: string;
  // Company branding
  companyNameEn: string;
  companyNameAr?: string;
  logoUrl?: string;
  addressBlockEn?: string;
  addressBlockAr?: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
  footerTextEn?: string;
  // Signature
  signatoryTitle?: string;
  signatoryName?: string;
  signatureUrl?: string;
  stampUrl?: string;
  // QR verification
  verificationUrl?: string;
  verificationCode?: string;
  qrImageUrl?: string;
  // Optional extras
  notes?: string;
}

// ─── Data Loader ───────────────────────────────────────────────────────────

export async function loadHrEmploymentLetterData(params: {
  recordType: string;
  recordId: number;
  ownerCompanyId: number;
  locale: string;
}): Promise<HrEmploymentLetterData> {
  const supabase = createAdminClient();

  // Load employee
  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select(`
      employee_code,
      full_name_en,
      full_name_ar,
      joining_date,
      employment_type_id,
      owner_company_id,
      designations!employees_designation_id_fkey(designation_name_en),
      departments!employees_department_id_fkey(department_name_en),
      owner_companies!employees_owner_company_id_fkey(
        legal_name_en,
        legal_name_ar,
        trn
      )
    `)
    .eq("id", params.recordId)
    .eq("owner_company_id", params.ownerCompanyId)
    .single();

  if (empErr || !emp) {
    console.error(`[PrintRoute] Employee query failed: id=${params.recordId}, company=${params.ownerCompanyId}, error:`, empErr);
    throw new Error(`Employee not found: id=${params.recordId}, company=${params.ownerCompanyId}${empErr ? ` (${empErr.message})` : ""}`);
  }

  // Load branding profile for the owner company (separate query — no FK from employees)
  const { data: brandingRow } = await supabase
    .from("erp_report_branding_profiles")
    .select("address_block_en, address_block_ar, phone, email, footer_text_en")
    .eq("owner_company_id", params.ownerCompanyId)
    .limit(1)
    .maybeSingle();

  const company = emp.owner_companies as unknown as Record<string, string> | null;
  const branding = brandingRow ?? null;

  return {
    letterRef: `EMP-LTR-${emp.employee_code}-${new Date().getFullYear()}`,
    letterDate: new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }),
    employeeCode: emp.employee_code as string,
    fullNameEn: emp.full_name_en as string,
    fullNameAr: emp.full_name_ar as string | undefined,
    jobTitle: (emp.designations as unknown as Record<string, string> | null)?.designation_name_en ?? "—",
    department: (emp.departments as unknown as Record<string, string> | null)?.department_name_en ?? undefined,
    joinDate: emp.joining_date
      ? new Date(emp.joining_date as string).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
      : "—",
    employmentType: "Full-Time",
    companyNameEn: company?.legal_name_en ?? "Company",
    companyNameAr: company?.legal_name_ar ?? undefined,
    taxNumber: company?.trn ?? undefined,
    addressBlockEn: branding?.address_block_en ?? undefined,
    addressBlockAr: branding?.address_block_ar ?? undefined,
    phone: branding?.phone ?? undefined,
    email: branding?.email ?? undefined,
    footerTextEn: branding?.footer_text_en ?? undefined,
    signatoryTitle: "Authorized Signatory",
    notes: undefined,
  };
}

// ─── Renderer ─────────────────────────────────────────────────────────────

export function renderHrEmploymentLetter(data: unknown): React.ReactElement {
  const d = data as HrEmploymentLetterData;

  return (
    <DocumentPage direction="ltr" lang="en">
      <DocumentHeader
        logoUrl={d.logoUrl}
        companyNameEn={d.companyNameEn}
        companyNameAr={d.companyNameAr}
        documentNo={d.letterRef}
        documentTypeLabel="Employment Certificate"
      />

      <CompanyBranding
        addressBlockEn={d.addressBlockEn}
        phone={d.phone}
        email={d.email}
        taxNumber={d.taxNumber}
      />

      <DocumentTitle title="Employment Certificate" subtitle={`Issued on ${d.letterDate}`} />

      <DocumentMetadata
        items={[
          { label: "Employee Code", value: d.employeeCode },
          { label: "Employee Name", value: d.fullNameEn },
          { label: "Job Title", value: d.jobTitle },
          { label: "Department", value: d.department },
          { label: "Date of Joining", value: d.joinDate },
          { label: "Employment Type", value: d.employmentType },
        ]}
      />

      <div style={{ marginTop: "8mm", fontSize: "10pt", lineHeight: 1.7 }}>
        <p>
          This is to certify that{" "}
          <strong>{d.fullNameEn}</strong>
          {d.fullNameAr ? (
            <span lang="ar" dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', Arial, sans-serif" }}>
              {" "}({d.fullNameAr})
            </span>
          ) : null}
          , employed as <strong>{d.jobTitle}</strong>
          {d.department ? ` in the ${d.department} department` : ""}
          , has been a member of our organization since{" "}
          <strong>{d.joinDate}</strong> on a{" "}
          <strong>{d.employmentType ?? "full-time"}</strong> basis.
        </p>
        <p style={{ marginTop: "4mm" }}>
          This certificate is issued upon the employee&apos;s request for
          official purposes only.
        </p>
      </div>

      {d.notes && (
        <div style={{ marginTop: "6mm", fontSize: "9pt", color: "#616161" }}>
          <strong>Notes:</strong> {d.notes}
        </div>
      )}

      <SignatureBlock
        slots={[
          {
            title: d.signatoryTitle ?? "Authorized Signatory",
            name: d.signatoryName,
            signatureUrl: d.signatureUrl,
            stampUrl: d.stampUrl,
          },
        ]}
      />

      {(d.verificationUrl || d.verificationCode) && (
        <QRVerificationBlock
          qrImageUrl={d.qrImageUrl}
          verificationUrl={d.verificationUrl}
          verificationCode={d.verificationCode}
          label="Verify this certificate at"
        />
      )}

      <DocumentFooter footerTextEn={d.footerTextEn} showPageNumbers={true} />
    </DocumentPage>
  );
}
