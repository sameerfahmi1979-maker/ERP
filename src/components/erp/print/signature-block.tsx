/**
 * SignatureBlock — signature / stamp / approval signatory section.
 */
import React from "react";
export interface SignatureSlot {
  title: string;
  titleAr?: string;
  name?: string;
  signatureUrl?: string;
  stampUrl?: string;
}
interface SignatureBlockProps { slots: SignatureSlot[]; }
export function SignatureBlock({ slots }: SignatureBlockProps) {
  return (
    <div className="signature-block avoid-page-break">
      {slots.map((slot, i) => (
        <div key={i} className="signature-slot">
          {slot.signatureUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={slot.signatureUrl} alt="Signature" />
          )}
          {slot.stampUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={slot.stampUrl} alt="Stamp" style={{ position: "absolute", opacity: 0.7 }} />
          )}
          <div style={{ fontWeight: 700, fontSize: "9pt" }}>{slot.title}</div>
          {slot.titleAr && <div lang="ar" dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', Arial, sans-serif", fontSize: "8.5pt" }}>{slot.titleAr}</div>}
          {slot.name && <div style={{ fontSize: "8.5pt", color: "#424242" }}>{slot.name}</div>}
        </div>
      ))}
    </div>
  );
}
