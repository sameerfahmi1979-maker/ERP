"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useReadCacheOwner } from "@/components/layout/read-cache-boundary";
import { getFormSuggestionSources, prepareReviewedFormSuggestions, revalidateReviewedFormSuggestions } from "@/server/actions/ai/common/form-review";
import type { FormFieldCandidate, FormSuggestionReceipt } from "@/lib/ai/assistant-guidance/form-review";

/** Suggestions become ordinary unsaved form entries. Saving keeps the owning F04/F06 contract. */
export function ReviewedFormSuggestions(props: { formId: string; entityType: "branch" | "site"; entityId: number | null; disabled: boolean }) {
  const owner = useReadCacheOwner(), epoch = useRef(0);
  const [busy, setBusy] = useState(false), [query, setQuery] = useState("");
  const [sources, setSources] = useState<Array<{ id: number; label: string }>>([]), [sourceId, setSourceId] = useState<number | null>(null);
  const [prepared, setPrepared] = useState<{ fields: FormFieldCandidate[]; receipt: FormSuggestionReceipt; sourceLabel: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]), [notice, setNotice] = useState("");
  const localValues = useRef<Record<string, string>>({});
  useEffect(() => () => { epoch.current++; }, []);
  useEffect(() => { if (props.disabled) epoch.current++; }, [props.disabled]);
  const context = () => {
    const form = document.getElementById(props.formId) as HTMLFormElement | null;
    return { entityType: props.entityType, entityId: props.entityId, companyId: Number(form ? new FormData(form).get("owner_company_id") : 0) };
  };
  const valid = (ticket: number) => ticket === epoch.current && owner?.isLive() === true;
  const run = async (kind: "sources" | "prepare" | "copy") => {
    if (props.disabled || !owner?.isLive() || busy) return;
    const ticket = ++epoch.current, originalContext = JSON.stringify(context()); setBusy(true); setNotice("");
    try {
      if (kind === "sources") {
        setPrepared(null); setSelected([]); setSourceId(null);
        const r = await getFormSuggestionSources({ ...context(), query });
        if (!valid(ticket) || originalContext !== JSON.stringify(context())) return;
        setSources(r.success ? r.data : []); if (!r.success) setNotice(r.error); else if (!r.data.length) setNotice("No permitted source choices. Existing records use their explicitly linked documents.");
      } else if (kind === "prepare" && sourceId) {
        const r = await prepareReviewedFormSuggestions({ ...context(), documentId: sourceId });
        if (!valid(ticket) || originalContext !== JSON.stringify(context())) return;
        setPrepared(r.success ? r.data : null); setSelected([]);
        if (r.success) { const form = document.getElementById(props.formId) as HTMLFormElement | null; localValues.current = Object.fromEntries(r.data.fields.map(f => [f.field, String(form ? new FormData(form).get(f.field) ?? "" : "")])); }
        if (!r.success) setNotice(r.error); else if (!r.data.fields.length) setNotice("No unambiguous eligible fields were found in the recorded metadata. Enter the fields normally; no protected values were inferred.");
      } else if (kind === "copy" && prepared) {
        if (JSON.stringify({ entityType: prepared.receipt.entityType, entityId: prepared.receipt.entityId, companyId: prepared.receipt.companyId }) !== originalContext) { setPrepared(null); setNotice("The form scope changed. Prepare suggestions again."); return; }
        const r = await revalidateReviewedFormSuggestions(prepared.receipt);
        if (!valid(ticket) || originalContext !== JSON.stringify(context())) return;
        if (!r.success) { setNotice(r.error); setPrepared(null); return; }
        const form = document.getElementById(props.formId) as HTMLFormElement | null;
        if (selected.some(field => String(form ? new FormData(form).get(field) ?? "" : "") !== localValues.current[field])) { setNotice("You edited a selected field after preparing suggestions. Prepare again to protect your current entries."); return; }
        for (const candidate of r.data.fields.filter(f => selected.includes(f.field))) {
          const input = form?.elements.namedItem(candidate.field);
          if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) || input.disabled) continue;
          const setter = Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")?.set;
          setter?.call(input, candidate.value); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        setPrepared(null); setSelected([]); setNotice("Selected values are unsaved form entries. Review/edit them, then use the normal Save action.");
      }
    } catch { if (valid(ticket)) setNotice("Suggestions could not be verified. No save was attempted."); }
    finally { if (valid(ticket)) setBusy(false); }
  };
  if (!owner?.isLive()) return null;
  return <div className="space-y-3 rounded-md border border-border p-3 mb-4">
    <p className="text-sm font-medium">Prepare form values from document metadata</p>
    <p className="text-xs text-muted-foreground">Choose an authorised source. Select each field you want to copy, including any replacement. Business codes, scope, roles and statuses stay under their normal controls.</p>
    <div className="flex flex-wrap gap-2"><Input aria-label="Find a form suggestion source" value={query} onChange={e => setQuery(e.target.value)} disabled={props.disabled || busy} placeholder="Document number or title" /><Button type="button" variant="outline" disabled={props.disabled || busy} onClick={() => void run("sources")}>Find sources</Button></div>
    {sources.length > 0 && <div className="flex flex-wrap gap-2"><select aria-label="Suggestion source document" className="w-full min-w-0 bg-background text-foreground border border-input rounded-md p-2" value={sourceId ?? ""} disabled={props.disabled || busy} onChange={e => { epoch.current++; setBusy(false); setSourceId(Number(e.target.value) || null); setPrepared(null); setSelected([]); }}><option value="">Select a document</option>{sources.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select><Button type="button" variant="outline" disabled={props.disabled || busy || !sourceId} onClick={() => void run("prepare")}>Review suggested values</Button></div>}
    {prepared && <div className="space-y-2"><p className="text-xs text-muted-foreground">Source: {prepared.sourceLabel}</p>{prepared.fields.map(f => <label key={f.field} className="flex gap-2 items-start text-sm"><input type="checkbox" checked={selected.includes(f.field)} disabled={props.disabled || busy} onChange={e => setSelected(v => e.target.checked ? [...v, f.field] : v.filter(x => x !== f.field))} /><span>{f.label}: {f.value}{f.existingValue ? " — replace existing value only if selected" : ""}</span></label>)}<Button type="button" variant="outline" disabled={props.disabled || busy || !selected.length} onClick={() => void run("copy")}>Use selected values in form</Button></div>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
  </div>;
}
