/** QRVerificationBlock — verification QR code + link text */
import React from "react";
interface QRVerificationBlockProps { qrImageUrl?: string; verificationUrl?: string; verificationCode?: string; label?: string; }
export function QRVerificationBlock({ qrImageUrl, verificationUrl, verificationCode, label = "Verify this document" }: QRVerificationBlockProps) {
  return (
    <div className="qr-block avoid-page-break">
      {qrImageUrl && <img src={qrImageUrl} alt="QR Code" style={{ width: "20mm", height: "20mm" }} />}
      <div className="qr-block-text">
        <div style={{ fontWeight: 600, fontSize: "8pt" }}>{label}</div>
        {verificationCode && <div style={{ fontFamily: "monospace", fontSize: "8pt", color: "#424242" }}>{verificationCode}</div>}
        {verificationUrl && <div style={{ fontSize: "7.5pt", wordBreak: "break-all", color: "#1565c0" }}>{verificationUrl}</div>}
      </div>
    </div>
  );
}
