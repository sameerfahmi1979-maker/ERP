/** CompanyBranding — company address/contact block below the header */
import React from "react";
interface CompanyBrandingProps {
  addressBlockEn?: string;
  addressBlockAr?: string;
  phone?: string;
  email?: string;
  website?: string;
  taxNumber?: string;
  licenseNo?: string;
}
export function CompanyBranding({ addressBlockEn, addressBlockAr, phone, email, website, taxNumber, licenseNo }: CompanyBrandingProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: addressBlockAr ? "1fr 1fr" : "1fr", gap: "4mm", fontSize: "8pt", color: "#616161", marginBottom: "4mm" }}>
      {addressBlockEn && <div lang="en" className="address-block">{addressBlockEn}</div>}
      {addressBlockAr && <div lang="ar" dir="rtl" className="address-block" style={{ fontFamily: "'Noto Sans Arabic', Arial, sans-serif", textAlign: "right" }}>{addressBlockAr}</div>}
      <div style={{ display: "flex", gap: "6mm", flexWrap: "wrap", gridColumn: "1/-1" }}>
        {phone && <span>📞 {phone}</span>}
        {email && <span>✉ {email}</span>}
        {website && <span>🌐 {website}</span>}
        {taxNumber && <span><strong>TRN:</strong> {taxNumber}</span>}
        {licenseNo && <span><strong>Lic:</strong> {licenseNo}</span>}
      </div>
    </div>
  );
}
