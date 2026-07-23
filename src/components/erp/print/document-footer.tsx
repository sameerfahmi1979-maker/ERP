/** DocumentFooter — sticky bottom bar with company info + page number hint */
import React from "react";
interface DocumentFooterProps {
  footerTextEn?: string;
  footerTextAr?: string;
  showPageNumbers?: boolean;
}
export function DocumentFooter({ footerTextEn, footerTextAr, showPageNumbers = true }: DocumentFooterProps) {
  return (
    <footer className="doc-footer">
      <span lang="en">{footerTextEn ?? ""}</span>
      {footerTextAr && <span lang="ar" dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', Arial, sans-serif" }}>{footerTextAr}</span>}
      {showPageNumbers && <span style={{ color: "#9e9e9e" }}>Page <span className="pageNumber" /> of <span className="totalPages" /></span>}
    </footer>
  );
}
