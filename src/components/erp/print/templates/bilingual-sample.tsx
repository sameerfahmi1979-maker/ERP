/**
 * Template: Bilingual Sample (English + Arabic)
 * Template Key: bilingual-sample-en-ar
 * Phase: ERP PDF.1 — Production PDF Generation Framework (2026-07-23)
 *
 * Proof-set: Bilingual/Arabic document demonstrating:
 *  - RTL Arabic text correctly shaped via Noto Sans Arabic
 *  - Bilingual two-column layout
 *  - Mixed Arabic+English metadata
 *  - Arabic company name in header
 */

import React from "react";
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

// ─── Data Loader (Stub) ────────────────────────────────────────────────────

export async function loadBilingualSampleData(params: {
  recordType: string;
  recordId: number;
  ownerCompanyId: number;
  locale: string;
}): Promise<BilingualSampleData> {
  void params;
  return {
    refNo: "BILINGUAL-DEMO-001",
    date: "23 يوليو 2026 / 23 July 2026",
    companyNameEn: "Alliance Gulf Transport & Construction",
    companyNameAr: "تحالف الخليج للنقل والإنشاءات",
    recipientNameEn: "Mohammed Al-Rashidi",
    recipientNameAr: "محمد الراشدي",
    bodyEn: `To Whom It May Concern,\n\nThis letter is issued to confirm that the above-named individual is an employee of our organization. All information contained herein is accurate and valid as of the date of issuance.\n\nThis document is issued upon the employee's request for official use only.`,
    bodyAr: `إلى من يهمه الأمر،\n\nيُصدر هذا الخطاب لتأكيد أن الشخص المذكور أعلاه موظف لدى منظمتنا. جميع المعلومات الواردة هنا دقيقة وصحيحة اعتباراً من تاريخ الإصدار.\n\nيُصدر هذا الوثيقة بناءً على طلب الموظف للاستخدام الرسمي فقط.`,
    footerTextEn: "Alliance Gulf Transport & Construction LLC",
    footerTextAr: "تحالف الخليج للنقل والإنشاءات ش.ذ.م.م",
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
