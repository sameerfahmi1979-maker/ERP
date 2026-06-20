"use client";

import Link from "next/link";
import {
  Building2,
  GitBranch,
  Users,
  MapPin,
  FileText,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchBadges } from "./search-badges";
import type { ErpSearchResult, ErpSearchEntityType } from "@/lib/ai/common/search/types";

const ENTITY_ICONS: Record<ErpSearchEntityType | string, React.ReactNode> = {
  organization: <Building2 className="h-4 w-4 text-blue-600" />,
  branch: <GitBranch className="h-4 w-4 text-green-600" />,
  party: <Users className="h-4 w-4 text-purple-600" />,
  site: <MapPin className="h-4 w-4 text-orange-600" />,
  dms_document: <FileText className="h-4 w-4 text-slate-600" />,
};

const ENTITY_LABELS: Record<string, string> = {
  organization: "Organization",
  branch: "Branch",
  party: "Party",
  site: "Work Site",
  dms_document: "Document",
  duplicate_candidate: "Duplicate",
  compliance_finding: "Compliance",
  risk_score: "Risk Score",
  field_suggestion: "Field Suggestion",
};

interface SearchResultCardProps {
  result: ErpSearchResult;
  className?: string;
}

export function SearchResultCard({ result, className }: SearchResultCardProps) {
  const icon = ENTITY_ICONS[result.entityType ?? result.resultType] ?? <FileText className="h-4 w-4" />;
  const label = ENTITY_LABELS[result.resultType] ?? result.resultType;

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm",
        "hover:border-slate-300 hover:shadow-md transition-all duration-150",
        className
      )}
    >
      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-slate-50 border border-slate-200">
        {icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                {label}
              </span>
              {result.subtitle && (
                <span className="text-xs text-slate-400">{result.subtitle}</span>
              )}
            </div>
            <p className="mt-0.5 text-sm font-semibold text-slate-900 truncate">
              {result.isConfidential ? (
                <span className="text-red-700">
                  {result.title} — Confidential
                </span>
              ) : (
                result.title
              )}
            </p>
          </div>

          <Link
            href={result.route}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-colors flex-shrink-0"
          >
            <ExternalLink className="h-3 w-3" />
            Open
          </Link>
        </div>

        {!result.isConfidential && result.snippet && (
          <p className="mt-1 text-xs text-slate-500 line-clamp-2">{result.snippet}</p>
        )}

        <SearchBadges
          badges={result.badges}
          isConfidential={result.isConfidential}
          semanticSimilarity={result.semanticSimilarity}
        />
      </div>
    </div>
  );
}
