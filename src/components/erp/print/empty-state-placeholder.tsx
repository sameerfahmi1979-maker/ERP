/** EmptyStatePlaceholder — shown when a document has no data */
import React from "react";
interface EmptyStatePlaceholderProps { message?: string; messageAr?: string; }
export function EmptyStatePlaceholder({ message = "No data available", messageAr }: EmptyStatePlaceholderProps) {
  return (
    <div style={{ textAlign: "center", padding: "20mm 0", color: "#9e9e9e", fontSize: "10pt" }}>
      <div>{message}</div>
      {messageAr && <div lang="ar" dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', Arial, sans-serif", marginTop: "2mm" }}>{messageAr}</div>}
    </div>
  );
}
