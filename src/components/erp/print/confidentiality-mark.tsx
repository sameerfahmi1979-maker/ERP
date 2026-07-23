/** ConfidentialityMark — inline confidentiality badge */
import React from "react";
type Level = "confidential" | "restricted" | "internal" | "public";
const COLORS: Record<Level, string> = { confidential: "#b71c1c", restricted: "#e65100", internal: "#1565c0", public: "#2e7d32" };
const LABELS: Record<Level, string> = { confidential: "Confidential", restricted: "Restricted", internal: "Internal Use", public: "Public" };
interface ConfidentialityMarkProps { level?: Level; label?: string; }
export function ConfidentialityMark({ level = "confidential", label }: ConfidentialityMarkProps) {
  return <span className="confidential-mark" style={{ background: COLORS[level] }}>{label ?? LABELS[level]}</span>;
}
