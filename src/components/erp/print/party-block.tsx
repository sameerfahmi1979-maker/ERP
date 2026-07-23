/** PartyBlock — buyer/supplier/employee party section */
import React from "react";
interface PartyBlockProps { label?: string; name?: string; nameAr?: string; ref?: string; address?: string; phone?: string; email?: string; taxNumber?: string; }
export function PartyBlock({ label, name, nameAr, ref: refNo, address, phone, email, taxNumber }: PartyBlockProps) {
  return (
    <div style={{ border: "1px solid #e0e0e0", borderRadius: "3px", padding: "3mm", fontSize: "9pt" }}>
      {label && <div style={{ fontSize: "7.5pt", color: "#757575", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "1mm", fontWeight: 700 }}>{label}</div>}
      {name && <div style={{ fontWeight: 700, fontSize: "10pt" }}>{name}</div>}
      {nameAr && <div lang="ar" dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', Arial, sans-serif", fontWeight: 700 }}>{nameAr}</div>}
      {refNo && <div style={{ color: "#616161" }}>Ref: {refNo}</div>}
      {address && <div style={{ color: "#616161", whiteSpace: "pre-line" }}>{address}</div>}
      {phone && <div>📞 {phone}</div>}
      {email && <div>✉ {email}</div>}
      {taxNumber && <div><strong>TRN:</strong> {taxNumber}</div>}
    </div>
  );
}
