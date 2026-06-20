"use client";

import Link from "next/link";
import type { AuditExplanationSummary } from "@/lib/ai/common/audit-explainer/types";
import { cn } from "@/lib/utils";
import { Sparkles, Info, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";

interface Props {
  summary: AuditExplanationSummary;
  onClose?: () => void;
}

export function AuditExplanationPanel({ summary, onClose }: Props) {
  const exp = summary.explanation;

  const confidenceColor = exp
    ? {
        high: "text-green-600 dark:text-green-400",
        medium: "text-amber-600 dark:text-amber-400",
        low: "text-red-500 dark:text-red-400",
      }[exp.confidence]
    : "";

  return (
    <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/20 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-indigo-100 dark:border-indigo-900 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-indigo-500" />
          <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
            {summary.isAiGenerated ? "AI Explanation" : "Summary"}
          </span>
          {summary.isAiGenerated && exp && (
            <span className={cn("text-xs font-medium", confidenceColor)}>
              {exp.confidence} confidence
            </span>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Close
          </button>
        )}
      </div>
      <div className="p-5 space-y-4">
        {exp ? (
          <>
            <div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{exp.title}</p>
              <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{exp.plainEnglishSummary}</p>
            </div>

            {exp.whatChanged.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                  What Changed
                </p>
                <ul className="space-y-1">
                  {exp.whatChanged.map((c, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
              <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span>{exp.whoAndWhen}</span>
            </div>

            {exp.businessImpact && (
              <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                <span>{exp.businessImpact}</span>
              </div>
            )}

            {exp.recommendedReviewLinks.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {exp.recommendedReviewLinks.map((link, i) => (
                  <Link
                    key={i}
                    href={link.href}
                    className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    {link.label}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-700 dark:text-slate-300">{summary.deterministicSummary}</p>
        )}

        {summary.warnings.length > 0 && (
          <div className="text-xs text-amber-600 dark:text-amber-400 space-y-0.5">
            {summary.warnings.map((w, i) => <p key={i}>{w}</p>)}
          </div>
        )}

        <p className="text-[10px] text-slate-400 dark:text-slate-500">
          Generated {new Date(summary.generatedAt).toLocaleString()}
          {summary.modelName ? ` · ${summary.modelName}` : ""}
          {summary.isAiGenerated ? " · AI-assisted" : " · Deterministic"}
        </p>
      </div>
    </div>
  );
}
