"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReportTemplateSelectDialog } from "@/components/report-center/report-template-select-dialog";
import { useReadCacheOwner } from "@/components/layout/read-cache-boundary";
import { reportTemplateSelectionIdentity } from "@/lib/reads/report-template-selection-schema";
import { previewOfficialDocument } from "@/server/actions/output/preview-official-document";
import type { AuthContext } from "@/lib/rbac/check";
import type { EmployeeOutputCatalogItem } from "@/server/actions/output/output-catalog";
import type { OfficialDocumentLanguage } from "@/lib/official-documents/types";

interface Props { authContext: AuthContext; employeeId: number; item: EmployeeOutputCatalogItem | null; open: boolean; onOpenChange: (open: boolean) => void }
export function OfficialDraftPreviewDialog(props: Props) {
  return props.open && props.item ? <DraftSession key={JSON.stringify([reportTemplateSelectionIdentity(props.authContext), props.employeeId, props.item.outputCode])} {...props} item={props.item} /> : null;
}
function DraftSession({ authContext, employeeId, item, onOpenChange }: Props & { item: EmployeeOutputCatalogItem }) {
  const owner = useReadCacheOwner(), live = useRef(false), flight = useRef(false), revision = useRef<object | null>(null);
  const [language, setLanguage] = useState<OfficialDocumentLanguage>(item.previewLanguages?.[0] ?? "en");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [template, setTemplate] = useState<{ id: number; name: string } | null>(null), [chooseBrand, setChooseBrand] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [pdf, setPdf] = useState<{ url: string; asOf: string; notice: string } | null>(null);
  useLayoutEffect(() => { live.current = true; return () => { live.current = false; }; }, [owner]);
  useLayoutEffect(() => { revision.current = {}; }, [language, inputs, template]);
  useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url); }, [pdf]);
  const changed = () => { setPdf(null); setError(null); };
  const submit = async () => {
    if (flight.current) return; flight.current = true;
    const selected = revision.current, current = () => live.current && owner?.isLive() !== false && revision.current === selected;
    setBusy(true); setError(null); setPdf(null);
    try {
      const result = await previewOfficialDocument({ outputCode: item.outputCode, employeeId, language, inputs, ...(template ? { templateId: template.id } : {}) });
      if (!current()) return;
      if (!result.success) { setError(result.error); return; }
      const bytes = Uint8Array.from(atob(result.pdfBase64), character => character.charCodeAt(0));
      setPdf({ url: URL.createObjectURL(new Blob([bytes], { type: "application/pdf" })), asOf: result.asOf, notice: result.notice });
    } catch { if (current()) setError("The draft response could not be confirmed. Try previewing again; no official document was issued."); }
    finally { flight.current = false; if (live.current) setBusy(false); }
  };
  if (owner?.isLive() === false) return null;
  return <>
    <ERPChildDialogForm open onOpenChange={onOpenChange} title={`Preview draft — ${item.name}`} subtitle="Fixed wording filled from the permitted employee record. A preview is not an issued original." size="xl" mode="add" isSubmitting={busy} submitLabel="Preview draft" onSubmit={submit}>
      <fieldset disabled={busy} className="space-y-4 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="official-draft-language">Language</label>
          <select id="official-draft-language" value={language} onChange={event => { changed(); setLanguage(event.target.value as OfficialDocumentLanguage); }} className="rounded-sm border bg-background p-2 text-foreground">
            {(item.previewLanguages ?? []).map(value => <option key={value} value={value}>{value === "en" ? "English" : value === "ar" ? "العربية" : "English + العربية"}</option>)}
          </select>
          <span>Letterhead: {template?.name ?? "Employee's company default"}</span>
          {item.canBrandingOverride && <Button type="button" variant="outline" onClick={() => setChooseBrand(true)}>Choose letterhead</Button>}
          {template && <Button type="button" variant="ghost" onClick={() => { changed(); setTemplate(null); }}>Use company default</Button>}
        </div>
        {item.optionalInputs.map(field => <div key={field.key}>
          <label htmlFor={`draft-input-${field.key}`}>{field.labelEn}{field.required ? " *" : ""}</label>
          <Input id={`draft-input-${field.key}`} required={field.required} maxLength={field.maxLength} value={inputs[field.key] ?? ""} placeholder={field.placeholder}
            onChange={event => { changed(); setInputs(previous => ({ ...previous, [field.key]: event.target.value })); }} />
          {field.helpText && <p className="text-sm text-muted-foreground">{field.helpText}</p>}
        </div>)}
      </fieldset>
      {error && <p role="alert" className="whitespace-pre-line text-destructive">{error}</p>}
      {pdf && <section aria-label="Draft PDF" className="space-y-2 min-w-0">
        <p className="text-sm text-muted-foreground">{pdf.notice} Generated {new Date(pdf.asOf).toLocaleString()}.</p>
        <a href={pdf.url} download={`${item.outputCode}-DRAFT.pdf`} className="text-primary underline">Download draft PDF</a>
        <iframe title="Canonical draft PDF" src={pdf.url} className="h-[60dvh] w-full border" />
      </section>}
    </ERPChildDialogForm>
    <ReportTemplateSelectDialog authContext={authContext} open={chooseBrand} onOpenChange={setChooseBrand} ownerCompanyIds={item.ownerCompanyId ? [item.ownerCompanyId] : undefined} issuableOnly
      readGeneration={JSON.stringify([employeeId, item.outputCode, language])} selectedTemplateId={template?.id} dialogTitle="Choose company letterhead"
      onSelect={(id, selected) => { if (!live.current || owner?.isLive() === false) return; changed(); setTemplate({ id, name: selected.template_name }); }} />
  </>;
}
