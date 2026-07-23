/** DocumentTitle — centered document title bar */
import React from "react";
interface DocumentTitleProps {
  title: string;
  titleAr?: string;
  subtitle?: string;
}
export function DocumentTitle({ title, titleAr, subtitle }: DocumentTitleProps) {
  return (
    <div style={{ textAlign: "center", margin: "4mm 0 3mm", borderBottom: "1px solid #e0e0e0", paddingBottom: "3mm" }}>
      <h1 style={{ margin: 0, fontSize: "14pt", fontWeight: 700, color: "#1a237e" }}>{title}</h1>
      {titleAr && <div lang="ar" dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', Arial, sans-serif", fontSize: "13pt", fontWeight: 700, color: "#1a237e" }}>{titleAr}</div>}
      {subtitle && <p style={{ margin: "1mm 0 0", fontSize: "9pt", color: "#757575" }}>{subtitle}</p>}
    </div>
  );
}
