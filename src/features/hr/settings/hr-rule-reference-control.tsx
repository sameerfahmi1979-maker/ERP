"use client";

import { useEffect, useState } from "react";
import { Select } from "@fluentui/react-components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readJson } from "@/lib/reads/client";
import { HR_RULE_CHOICE_PAGE_SIZE, hrRuleChoicePageSchema, type HrRuleChoicePage } from "@/lib/hr/specialized-settings-read";
import { hrRuleReferenceLabel, type HrRuleChoice, type HrRuleEntity, type HrRuleField, type HrRuleRow } from "@/lib/hr/specialized-settings-form";

export function HrRuleReferenceControl({ id, entity, field, row, value, disabled, onChange, onBlocked }: {
  id: string; entity: HrRuleEntity; field: HrRuleField; row?: HrRuleRow; value: string; disabled: boolean;
  onChange: (value: string) => void; onBlocked: (field: string, blocked: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<HrRuleChoicePage | null>(null);
  const [failed, setFailed] = useState(false);
  const [picked, setPicked] = useState<HrRuleChoice>();
  const parent = row?.id ?? null;
  const savedId = row?.[field.key];
  useEffect(() => {
    if (!open) return;
    const request = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await readJson<{ success: true; data: unknown }>("hr-rule-settings",
          { kind: "choices", entity, field: field.key, parent, search, page }, request.signal);
        const data = hrRuleChoicePageSchema(page).parse(response.data);
        if (data.retained && data.retained.id !== savedId) throw Error("Saved reference changed");
        if (request.signal.aborted) return;
        setResult(data);
        onBlocked(field.key, false);
      } catch {
        if (!request.signal.aborted) setFailed(true);
      }
    }, search ? 250 : 0);
    return () => { clearTimeout(timer); request.abort(); };
  }, [open, entity, field.key, parent, search, page, retry, savedId, onBlocked]);

  function resetRead() {
    setResult(null);
    setFailed(false);
    onBlocked(field.key, true);
  }

  function toggle() {
    if (open) {
      setOpen(false);
      onBlocked(field.key, false);
      return;
    }
    resetRead();
    setOpen(true);
  }

  const published = open ? result?.data ?? [] : [];
  const current = published.find(item => String(item.id) === value);
  const retained = result?.retained;
  const saved = value && savedId != null && String(savedId) === value;
  const selected = current ?? (picked && String(picked.id) === value ? picked : undefined);
  const retainedLabel = selected?.label ?? (saved && row ? retained?.label ?? hrRuleReferenceLabel(row, field) : "");
  const busy = open && !result && !failed;
  const refresh = (nextPage: number) => { resetRead(); setPage(nextPage); };

  return <>
    <Select id={id} name={field.key} aria-label={field.label} required={field.required} disabled={disabled}
      value={value} onChange={event => {
        const next = event.target.value;
        const option = published.find(item => String(item.id) === next);
        if (next && !option) return;
        setPicked(option);
        onChange(next);
      }} style={{ width: "100%" }}>
      <option value="">{field.required ? `Select ${field.label.toLowerCase()}` : field.emptyLabel}</option>
      {value && !current && retainedLabel && <option value={value} disabled>
        {retainedLabel}{saved ? retained?.eligible ? " (saved selection)" : " (retained)" : ""}
      </option>}
      {published.map(option => <option key={option.id} value={String(option.id)}>{option.label}</option>)}
    </Select>
    {!disabled && <Button type="button" size="sm" variant="ghost" onClick={toggle}>
      {open ? "Close" : "Browse"} {field.label.toLowerCase()} choices
    </Button>}
    {open && <div className="space-y-1">
      <Input aria-label={`Search ${field.label.toLowerCase()} choices`} maxLength={200} disabled={disabled}
        value={search} onChange={event => {
          if (event.target.value === search) return;
          resetRead();
          setSearch(event.target.value);
          setPage(1);
        }} />
      {busy && <p role="status" className="text-xs">Loading {field.label.toLowerCase()} choices…</p>}
      {failed && <div role="alert" className="text-sm text-destructive">
        Reference choices could not load. Entries are retained.
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => { resetRead(); setRetry(n => n + 1); }}>
          Retry {field.label.toLowerCase()} choices
        </Button>
      </div>}
      {result && <div className="flex flex-wrap items-center gap-1">
        <p className="text-xs text-muted-foreground">{result.total} matching choices</p>
        <Button type="button" size="sm" variant="ghost" disabled={disabled || page === 1} onClick={() => refresh(page - 1)}>
          Previous {field.label.toLowerCase()} choices
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={disabled || page * HR_RULE_CHOICE_PAGE_SIZE >= result.total} onClick={() => refresh(page + 1)}>
          Next {field.label.toLowerCase()} choices
        </Button>
      </div>}
    </div>}
  </>;
}
