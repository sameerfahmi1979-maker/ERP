/**
 * DocumentHeader — top branding + document identity bar.
 */

import React from "react";

interface DocumentHeaderProps {
  /** Signed URL for the company logo */
  logoUrl?: string;
  /** Company name (English) */
  companyNameEn?: string;
  /** Company name (Arabic) */
  companyNameAr?: string;
  /** Document number / reference */
  documentNo?: string;
  /** Document type label (e.g. "Tax Invoice") */
  documentTypeLabel?: string;
  /** Status badge text */
  status?: string;
  /** Status badge color (CSS background-color) */
  statusColor?: string;
}

export function DocumentHeader({
  logoUrl,
  companyNameEn,
  companyNameAr,
  documentNo,
  documentTypeLabel,
  status,
  statusColor = "#1a237e",
}: DocumentHeaderProps) {
  return (
    <header className="doc-header">
      {/* Logo */}
      <div style={{ minWidth: 0 }}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={companyNameEn ?? "Company Logo"}
            style={{
              maxHeight: "18mm",
              maxWidth: "50mm",
              objectFit: "contain",
              display: "block",
            }}
          />
        ) : (
          <div
            style={{
              width: "40mm",
              height: "14mm",
              background: "#e8eaf6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "2px",
              fontSize: "8pt",
              color: "#9e9e9e",
            }}
          >
            {companyNameEn ?? "No Logo"}
          </div>
        )}
      </div>

      {/* Company Name */}
      <div style={{ textAlign: "center" }}>
        {companyNameEn && (
          <div style={{ fontWeight: 700, fontSize: "12pt", color: "#1a237e" }}>
            {companyNameEn}
          </div>
        )}
        {companyNameAr && (
          <div
            lang="ar"
            dir="rtl"
            style={{
              fontFamily: "'Noto Sans Arabic', Arial, sans-serif",
              fontWeight: 600,
              fontSize: "11pt",
              color: "#1a237e",
            }}
          >
            {companyNameAr}
          </div>
        )}
      </div>

      {/* Document Identity */}
      <div style={{ textAlign: "right", minWidth: 0 }}>
        {documentTypeLabel && (
          <div style={{ fontWeight: 700, fontSize: "11pt", color: "#212121" }}>
            {documentTypeLabel}
          </div>
        )}
        {documentNo && (
          <div style={{ fontSize: "9pt", color: "#616161", fontWeight: 600, marginTop: "1mm" }}>
            {documentNo}
          </div>
        )}
        {status && (
          <div style={{ marginTop: "2mm" }}>
            <span
              style={{
                background: statusColor,
                color: "#fff",
                fontSize: "7pt",
                fontWeight: 700,
                padding: "1px 6px",
                borderRadius: "3px",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              {status}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
