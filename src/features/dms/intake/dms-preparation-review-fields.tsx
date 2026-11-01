"use client";
import { Input } from "@/components/ui/input";
import type { PreparationCandidates } from "@/lib/dms/preparation/candidates";
export type ExistingDocumentReviewProps = { mode: "existing_document"; candidate: PreparationCandidates; selections: string[]; edits: Record<string, string>; onSelectionChange: (keys: string[]) => void; onEdit: (key: string, value: string) => void; disabled?: boolean };

/** Compact child-record review: no global-list columns, filters or paging controls. */
export function DmsPreparationReviewFields({ candidate, selections, edits, onSelectionChange, onEdit, disabled }: ExistingDocumentReviewProps) {
  return <fieldset disabled={disabled} className="space-y-3 min-w-0">
    <legend className="text-sm font-medium">Review proposed changes</legend>
    <p className="text-xs text-muted-foreground">Only selected values will change. Blank or unknown suggestions do not erase accepted data. Original files and document number are retained. Source changes retire outdated summaries and search data while keeping their history.</p>
    {candidate.summary && <div className="rounded border border-border p-3 text-sm whitespace-pre-wrap" dir="auto"><p className="text-xs text-muted-foreground">Suggested summary — pending review</p>{candidate.summary}</div>}
    {candidate.warnings.length > 0 && <ul className="text-xs text-muted-foreground space-y-1">{candidate.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
    {candidate.proposedType && <p className="text-sm">Suggested type: {candidate.proposedType.typeName}. Category: {candidate.proposedType.categoryName ?? "Registered category"}. {candidate.proposedType.holdReason ?? "Selecting the type also selects its registered category. Existing unmapped metadata is retained."}</p>}
    <div className="space-y-2">{candidate.values.map(value => <div key={value.key} className="rounded border border-border p-3 space-y-2">
      <label className="flex gap-2 items-center text-sm font-medium"><input type="checkbox" checked={selections.includes(value.key)} onChange={e => onSelectionChange(e.target.checked ? [...selections, value.key] : selections.filter(k => k !== value.key))} />{value.label}</label>
      <div className="grid gap-2 sm:grid-cols-2 text-sm">
        <div className="min-w-0"><p className="text-xs text-muted-foreground">Current</p><p className="whitespace-pre-wrap break-words" dir="auto">{value.key === "document_type_id" ? "Existing document type" : value.current || "Not recorded"}</p></div>
        <label className="min-w-0"><span className="text-xs text-muted-foreground">Proposed — review or edit</span>{value.key === "document_type_id" ? <p>{candidate.proposedType?.typeName}</p> : <Input id={`preparation-${value.key.replace(":", "-")}`} name={value.key} required={selections.includes(value.key)} dir="auto" aria-label={`Proposed ${value.label}`} value={edits[value.key] ?? value.proposed} onChange={e => onEdit(value.key, e.target.value)} disabled={disabled || !selections.includes(value.key)} />}</label>
      </div>
      {value.evidence.map((e, i) => <blockquote key={i} className="border-s-2 border-border ps-2 text-xs whitespace-pre-wrap break-words" dir="auto"><span className="text-muted-foreground">Supporting excerpt{e.page ? ` — page ${e.page}` : " — page position unavailable"}: </span>{e.snippet}</blockquote>)}
      {!value.evidence.length && <p className="text-xs text-muted-foreground">Review against the original file or verified record context; no page position is claimed.</p>}
    </div>)}</div>
    {!candidate.values.length && <p className="text-sm">No supported changes were proposed. Accepted values remain unchanged.</p>}
  </fieldset>;
}
