"use client";

import {
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Calendar,
  Hash,
  Building2,
  ExternalLink,
} from "lucide-react";
import type { PublicVerificationResult } from "@/lib/public-verification/types";

interface VerifyPageContentProps {
  token: string;
  result: PublicVerificationResult | null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Status banners
// ─────────────────────────────────────────────────────────────────────────────

function ValidBanner({ title }: { title: string }) {
  return (
    <div className="flex items-start gap-4 p-5 rounded-xl bg-green-50 border-2 border-green-600">
      <CheckCircle2 className="h-7 w-7 text-green-600 shrink-0 mt-0.5" />
      <div>
        <p className="text-base font-bold text-green-800 uppercase tracking-wide">
          Authenticity Verified
        </p>
        <p className="text-sm text-green-700 mt-0.5">
          <strong>{title}</strong> is an authentic document issued through the ERP system.
        </p>
      </div>
    </div>
  );
}

function ExpiredBanner() {
  return (
    <div className="flex items-start gap-4 p-5 rounded-xl bg-yellow-50 border-2 border-yellow-500">
      <Clock className="h-7 w-7 text-yellow-600 shrink-0 mt-0.5" />
      <div>
        <p className="text-base font-bold text-yellow-800 uppercase tracking-wide">
          Verification Link Expired
        </p>
        <p className="text-sm text-yellow-700 mt-0.5">
          This verification link has expired. Please request a fresh document from the issuing organization.
        </p>
      </div>
    </div>
  );
}

function CancelledBanner({ reason }: { reason?: string | null }) {
  return (
    <div className="flex items-start gap-4 p-5 rounded-xl bg-red-50 border-2 border-red-600">
      <XCircle className="h-7 w-7 text-red-600 shrink-0 mt-0.5" />
      <div>
        <p className="text-base font-bold text-red-800 uppercase tracking-wide">
          Verification Link Cancelled
        </p>
        <p className="text-sm text-red-700 mt-0.5">
          This verification link has been cancelled by the issuing organization.
          {reason && (
            <span className="block mt-1 italic">Reason: {reason}</span>
          )}
        </p>
      </div>
    </div>
  );
}

function SupersededBanner({ newToken }: { newToken?: string | null }) {
  return (
    <div className="flex items-start gap-4 p-5 rounded-xl bg-blue-50 border-2 border-blue-500">
      <ArrowRight className="h-7 w-7 text-blue-600 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-base font-bold text-blue-800 uppercase tracking-wide">
          Updated Version Available
        </p>
        <p className="text-sm text-blue-700 mt-0.5">
          A newer version of this document has been issued.
        </p>
        {newToken && (
          <a
            href={`/verify/${newToken}`}
            className="inline-flex items-center gap-1.5 mt-2 text-sm font-semibold text-blue-700 underline hover:text-blue-900"
          >
            View current version
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

function NotFoundBanner() {
  return (
    <div className="flex items-start gap-4 p-5 rounded-xl bg-slate-50 border-2 border-slate-300">
      <AlertTriangle className="h-7 w-7 text-slate-500 shrink-0 mt-0.5" />
      <div>
        <p className="text-base font-bold text-slate-700 uppercase tracking-wide">
          Verification Link Not Found
        </p>
        <p className="text-sm text-slate-600 mt-0.5">
          This verification link is not available or no longer exists. If you believe this is an error, contact the issuing organization directly.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Detail row
// ─────────────────────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dotted border-neutral-300 py-2">
      <span className="text-[10px] uppercase tracking-widest text-neutral-500 shrink-0">
        {label}
      </span>
      <span className="text-sm font-medium text-neutral-900 text-right break-words max-w-[60%]">
        {value || "—"}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function VerifyPageContent({ token, result }: VerifyPageContentProps) {
  const isValid = result?.status === "valid";
  const isExpired = result?.status === "expired";
  const isCancelled = result?.status === "cancelled";
  const isSuperseded = result?.status === "superseded";

  const summaryEntries = result?.verification_summary
    ? Object.entries(result.verification_summary).filter(
        ([, v]) => v !== null && v !== undefined && String(v).trim() !== ""
      )
    : [];

  const payloadEntries = result?.public_payload
    ? Object.entries(result.public_payload).filter(
        ([, v]) => v !== null && v !== undefined && String(v).trim() !== ""
      )
    : [];

  const showPayload =
    isValid &&
    (result?.access_level === "full_view" ||
      result?.access_level === "full_view_download_ready") &&
    payloadEntries.length > 0;

  const showSummary = isValid && summaryEntries.length > 0;

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
      {/* Header bar */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-slate-900 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Document Verification
            </h1>
            <p className="text-xs text-slate-500">ERP Authenticated Output</p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Status banner */}
        {!result && <NotFoundBanner />}
        {isValid && <ValidBanner title={result!.document_title} />}
        {isExpired && <ExpiredBanner />}
        {isCancelled && <CancelledBanner reason={result?.cancel_reason} />}
        {isSuperseded && <SupersededBanner newToken={result?.superseded_by_token} />}

        {/* Document identity card */}
        {result && (
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm">
            {/* Document header */}
            <div className="bg-slate-900 px-5 py-4 flex items-start justify-between">
              <div>
                <p className="text-white font-bold text-base leading-tight">
                  {result.document_title}
                </p>
                {result.document_subtitle && (
                  <p className="text-slate-300 text-xs mt-0.5">{result.document_subtitle}</p>
                )}
              </div>
              <div className="text-right shrink-0 ml-4">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest border ${
                    isValid
                      ? "border-green-400 text-green-300"
                      : isExpired
                        ? "border-yellow-400 text-yellow-300"
                        : "border-red-400 text-red-300"
                  }`}
                >
                  {result.status}
                </span>
              </div>
            </div>

            {/* Document details */}
            <div className="px-5 py-4 space-y-1">
              <div className="flex items-center gap-1.5 mb-3">
                <FileText className="h-3 w-3 text-slate-400" />
                <span className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">
                  Document Details
                </span>
              </div>
              {result.document_ref && (
                <DetailRow
                  label="Reference"
                  value={
                    <span className="font-mono text-xs">{result.document_ref}</span>
                  }
                />
              )}
              {result.document_date && (
                <DetailRow
                  label="Document Date"
                  value={
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-slate-400" />
                      {formatDate(result.document_date)}
                    </span>
                  }
                />
              )}
              <DetailRow
                label="Issue Date"
                value={formatDate(result.issued_at)}
              />
              {result.expires_at && (
                <DetailRow
                  label="Link Expiry"
                  value={formatDate(result.expires_at)}
                />
              )}
              <DetailRow
                label="Document Type"
                value={
                  <span className="capitalize">{result.output_type.replace(/_/g, " ")}</span>
                }
              />
            </div>
          </div>
        )}

        {/* Verification summary (summary / full_view levels) */}
        {showSummary && (
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Hash className="h-3 w-3 text-slate-400" />
                <span className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">
                  Verification Summary
                </span>
              </div>
              <div className="space-y-0">
                {summaryEntries.map(([key, value]) => (
                  <DetailRow
                    key={key}
                    label={key.replace(/_/g, " ")}
                    value={String(value)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Full public payload */}
        {showPayload && (
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-5 py-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Building2 className="h-3 w-3 text-slate-400" />
                <span className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">
                  Document Content
                </span>
              </div>
              <div className="space-y-0">
                {payloadEntries.map(([key, value]) => (
                  <DetailRow
                    key={key}
                    label={key.replace(/_/g, " ")}
                    value={String(value)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Download (deferred) */}
        {result?.download_enabled && (
          <div className="bg-white border border-neutral-200 rounded-xl px-5 py-4 shadow-sm">
            <p className="text-sm text-slate-500 italic text-center">
              Download not available in this version. Please contact the issuing organization.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-[10px] text-slate-400 space-y-1 pb-8">
          <p className="font-mono break-all text-slate-300">
            Token: {token.slice(0, 8)}…{token.slice(-4)}
          </p>
          <p>
            This page provides authenticity verification only. No sensitive personal data is displayed.
          </p>
          <p>Computer-generated verification. Scanned {new Date().toLocaleDateString("en-GB")}.</p>
        </div>
      </div>
    </div>
  );
}
