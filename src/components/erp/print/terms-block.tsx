/** TermsBlock — legal terms and conditions */
import React from "react";
interface TermsBlockProps { title?: string; titleAr?: string; terms: string; termsAr?: string; }
export function TermsBlock({ title = "Terms & Conditions", titleAr, terms, termsAr }: TermsBlockProps) {
  return (
    <div style={{ margin: "4mm 0", fontSize: "8pt", color: "#616161" }} className="avoid-page-break">
      <div style={{ fontWeight: 700, marginBottom: "1mm", color: "#424242", fontSize: "9pt" }}>
        {title}{titleAr && <span lang="ar" dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', Arial, sans-serif" }}> / {titleAr}</span>}
      </div>
      <div style={{ whiteSpace: "pre-wrap" }}>{terms}</div>
      {termsAr && <div lang="ar" dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', Arial, sans-serif", marginTop: "1mm", textAlign: "right" }}>{termsAr}</div>}
    </div>
  );
}
