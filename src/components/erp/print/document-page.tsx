/**
 * DocumentPage — outer wrapper for a print template page.
 * Applies base print fonts, direction, and the print-root class.
 */

import React from "react";
import "@/styles/print/globals.css";

interface DocumentPageProps {
  children: React.ReactNode;
  /** LTR (English), RTL (Arabic), or auto (bilingual) */
  direction?: "ltr" | "rtl" | "auto";
  /** Language for the root element */
  lang?: string;
  /** Apply landscape page class */
  landscape?: boolean;
  /** Optional watermark text (renders behind content) */
  watermarkText?: string;
  /** Optional watermark image URL */
  watermarkImageUrl?: string;
  className?: string;
}

export function DocumentPage({
  children,
  direction = "ltr",
  lang,
  landscape = false,
  watermarkText,
  watermarkImageUrl,
  className,
}: DocumentPageProps) {
  const resolvedLang = lang ?? (direction === "rtl" ? "ar" : "en");

  return (
    <div
      lang={resolvedLang}
      dir={direction}
      className={[
        "print-root",
        landscape ? "landscape-page" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {watermarkText && (
        <div className="watermark" aria-hidden="true">
          {watermarkText}
        </div>
      )}
      {watermarkImageUrl && !watermarkText && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={watermarkImageUrl}
          alt=""
          className="watermark-img"
          aria-hidden="true"
        />
      )}
      {children}
    </div>
  );
}
