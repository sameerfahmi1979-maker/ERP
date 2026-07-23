/** AddressBlock — simple address */
import React from "react";
interface AddressBlockProps { label?: string; lines: (string | null | undefined)[]; direction?: "ltr" | "rtl"; lang?: string; }
export function AddressBlock({ label, lines, direction = "ltr", lang = "en" }: AddressBlockProps) {
  return (
    <div className="address-block" lang={lang} dir={direction} style={direction === "rtl" ? { fontFamily: "'Noto Sans Arabic', Arial, sans-serif", textAlign: "right" } : {}}>
      {label && <strong style={{ display: "block", fontSize: "8pt", color: "#757575", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</strong>}
      {lines.filter(Boolean).map((line, i) => <div key={i}>{line}</div>)}
    </div>
  );
}
