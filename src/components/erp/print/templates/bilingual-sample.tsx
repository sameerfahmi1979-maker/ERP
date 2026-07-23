/**
 * Template: Bilingual Employment Confirmation (English + Arabic)
 * Template Key: bilingual-sample-en-ar
 * Phase: ERP PDF.1 — Production PDF Generation Framework (2026-07-23)
 *
 * Bilingual proof template demonstrating Arabic RTL support.
 * Uses real employee data (same as hr-employment-letter-en).
 * recordType: 'employee', recordId: employee.id
 *
 * Governance status: DRAFT — promote to 'published' once Arabic/bilingual
 * visual QA passes with real Gotenberg runtime.
 */

import React from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DocumentPage,
  DocumentHeader,
  DocumentTitle,
  DocumentMetadata,
  BilingualText,
  ArabicText,
  SignatureBlock,
  DocumentFooter,
  AvoidPageBreak,
} from "@/components/erp/print";

export interface BilingualSampleData {
  refNo: string;
  date: string;
  companyNameEn: string;
  companyNameAr: string;
  logoUrl?: string;
  recipientNameEn: string;
  recipientNameAr: string;
  bodyEn: string;
  bodyAr: string;
  footerTextEn?: string;
  footerTextAr?: string;
}

// ─── Data Loader (Real — uses employee data) ─────────────────────────────────
// recordType: 'employee' | recordId: employees.id

export async function loadBilingualSampleData(params: {
  recordType: string;
  recordId: number;
  ownerCompanyId: number;
  locale: string;
}): Promise<BilingualSampleData> {
  const supabase = createAdminClient();

  const { data: emp } = await supabase
    .from("employees")
    .select(`
      employee_code,
      full_name_en,
      full_name_ar,
      joining_date,
      owner_company_id,
      designations!employees_designation_id_fkey(designation_name_en, designation_name_ar),
      owner_companies!employees_owner_company_id_fkey(
        legal_name_en,
        legal_name_ar,
        trn
      )
    `)
    .eq("id", params.recordId)
    .eq("owner_company_id", params.ownerCompanyId)
    .single();

  const { data: brandingRow } = await supabase
    .from("erp_report_branding_profiles")
    .select("footer_text_en, footer_text_ar")
    .eq("owner_company_id", params.ownerCompanyId)
    .limit(1)
    .maybeSingle();

  const today = new Date();
  const dateEn = today.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
  const dateAr = today.toLocaleDateString("ar-AE", { day: "2-digit", month: "long", year: "numeric" });

  const company = (emp?.owner_companies as unknown as Record<string, string> | null);
  const branding = Array.isArray(brandingRow)
    ? (brandingRow[0] as unknown as Record<string, string> | null)
    : (brandingRow as unknown as Record<string, string> | null);
  const designation = Array.isArray(emp?.designations)
    ? (emp?.designations[0] as unknown as Record<string, string> | null)
    : (emp?.designations as unknown as Record<string, string> | null);

  const nameEn = emp?.full_name_en ?? `Employee #${params.recordId}`;
  const nameAr = emp?.full_name_ar ?? nameEn;
  const titleEn = designation?.designation_name_en ?? "Employee";
  const titleAr = designation?.designation_name_ar ?? titleEn;

  return {
    refNo: `CONFIRM-${emp?.employee_code ?? params.recordId}-${today.getFullYear()}`,
    date: `${dateAr} / ${dateEn}`,
    companyNameEn: company?.legal_name_en ?? "Alliance Gulf Transport & Construction",
    companyNameAr: company?.legal_name_ar ?? "تحالف الخليج للنقل والإنشاءات",
    recipientNameEn: nameEn,
    recipientNameAr: nameAr,
    bodyEn: `To Whom It May Concern,\n\nThis letter confirms that ${nameEn}, holding the position of ${titleEn}, is a full-time employee of this organization. The employee's tenure commenced on ${emp?.joining_date ?? "—"} and remains active as of the date of this letter.\n\nThis document is issued upon the employee's request for official use only.`,
    bodyAr: `إلى من يهمه الأمر،\n\nيُقر هذا الخطاب بأن السيد/السيدة ${nameAr}، الذي يشغل منصب ${titleAr}، موظف بدوام كامل لدى هذه المنظمة. بدأت خدمة الموظف في ${emp?.joining_date ?? "—"} ولا تزال سارية حتى تاريخ هذا الخطاب.\n\nيُصدر هذا الخطاب بناءً على طلب الموظف للاستخدام الرسمي فقط.`,
    footerTextEn: branding?.footer_text_en ?? (company?.legal_name_en ?? "ALGT"),
    footerTextAr: branding?.footer_text_ar ?? (company?.legal_name_ar ?? "تحالف الخليج"),
  };
}

// ─── Renderer ─────────────────────────────────────────────────────────────

export function renderBilingualSample(data: unknown): React.ReactElement {
  const d = data as BilingualSampleData;

  return (
    <DocumentPage direction="auto" lang="en">
      <DocumentHeader
        logoUrl={d.logoUrl}
        companyNameEn={d.companyNameEn}
        companyNameAr={d.companyNameAr}
        documentNo={d.refNo}
        documentTypeLabel="Official Letter / خطاب رسمي"
      />

      <BilingualText
        en={`Date: ${d.date}`}
        ar={`التاريخ: ${d.date}`}
        style={{ marginBottom: "4mm", fontSize: "9pt", color: "#616161" }}
      />

      <DocumentTitle
        title="Employment Confirmation Letter"
        titleAr="خطاب تأكيد التوظيف"
        subtitle={d.refNo}
      />

      <DocumentMetadata
        columns={2}
        items={[
          { label: "Employee Name", labelAr: "اسم الموظف", value: d.recipientNameEn },
          { label: "الاسم بالعربي", value: d.recipientNameAr },
        ]}
      />

      {/* Bilingual body text */}
      <AvoidPageBreak>
        <div style={{ marginTop: "8mm", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8mm" }}>
          <div lang="en" dir="ltr" style={{ fontSize: "10pt", lineHeight: 1.7, whiteSpace: "pre-line" }}>
            {d.bodyEn}
          </div>
          <ArabicText style={{ fontSize: "10pt", lineHeight: 1.8, whiteSpace: "pre-line" }}>
            {d.bodyAr}
          </ArabicText>
        </div>
      </AvoidPageBreak>

      {/* Arabic signature line */}
      <div style={{ marginTop: "10mm", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8mm" }}>
        <SignatureBlock
          slots={[
            { title: "Authorized Signatory", titleAr: "المفوض بالتوقيع" },
          ]}
        />
        <div /> {/* spacer for RTL side */}
      </div>

      <DocumentFooter
        footerTextEn={d.footerTextEn}
        footerTextAr={d.footerTextAr}
        showPageNumbers={true}
      />
    </DocumentPage>
  );
}
