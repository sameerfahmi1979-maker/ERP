"use client";
import {useEffect, useState} from "react";
import {useRecordReadActive} from "@/hooks/use-record-read-active";
import {useReadLifetime} from "@/hooks/use-read-lifetime";
import {useQuery} from "@tanstack/react-query";
import {ERPCombobox} from "@/components/erp/combobox";
import {Button} from "@/components/ui/button";
import {usePayrollReadScope} from "@/hooks/use-hr-payroll-records";
import {readJson, ReadError, retryAuthorizedRead} from "@/lib/reads/client";
import {payrollChoiceCriteriaSchema, payrollChoicePageSchema, type PayrollChoiceKind} from "@/lib/reads/hr-payroll-records-schema";
export function PayrollChoicePicker({kind, employeeId, value, onValueChange, enabled, onReadState, ariaLabel, required = false}: {
  kind: PayrollChoiceKind; employeeId: number; value: number | null; onValueChange: (id: number | null) => void; enabled: boolean; onReadState: (blocked: boolean) => void; ariaLabel: string; required?: boolean;
}) {
  const sectionActive = useRecordReadActive();
  const {identity, onDenied} = usePayrollReadScope(), [search, setSearch] = useState(""), [settled, setSettled] = useState(""), [page, setPage] = useState(1);
  useEffect(() => {const timer = setTimeout(() => setSettled(search), 250); return () => clearTimeout(timer);}, [search]);
  const safe = payrollChoiceCriteriaSchema.safeParse({kind, employeeId, page, pageSize: 50, search, selectedId: value});
  const request = payrollChoiceCriteriaSchema.safeParse({kind, employeeId, page, pageSize: 50, search: settled, selectedId: value});
  const admitted = enabled && safe.success && request.success && search === settled;
  const owner = useReadLifetime(JSON.stringify([identity, kind, employeeId, page, search, value, enabled]));
  const query = useQuery({queryKey: ["hr", "settings", kind, "payroll-picker", employeeId, {page, search: settled, selectedId: value}, identity], enabled: sectionActive && admitted, staleTime: 30000, retry: retryAuthorizedRead,
    queryFn: async ({signal}) => {
      if (!admitted || !request.success) throw new ReadError("Payroll choice criteria are invalid or still changing", 400);
      const result = await readJson<{success: true; data: unknown}>("hr-payroll-choices", request.data, signal), parsed = payrollChoicePageSchema.safeParse(result.data);
      if (!parsed.success || parsed.data.kind !== kind || parsed.data.employeeId !== employeeId || parsed.data.page !== page || parsed.data.pageSize !== 50 || parsed.data.selected && parsed.data.selected.id !== value) throw Error("Payroll choices could not be verified");
      return parsed.data;
    }});
  const denied = query.error instanceof ReadError && [401, 403].includes(query.error.status);
  useEffect(() => {if (denied) onDenied();}, [denied, onDenied]);
  const busy = enabled && (admitted && query.isPending || query.isFetching || search !== settled), data = query.isError || busy || !admitted ? undefined : query.data;
  const selected = data?.selected, blocked = enabled && (busy || query.isError || !admitted || value !== null && !selected);
  const retry = () => {if (owner.active && admitted && !denied) void query.refetch();};
  useEffect(() => onReadState(blocked), [blocked, onReadState]);
  if (data && page > Math.max(1, Math.ceil(data.totalCount / 50))) setPage(Math.max(1, Math.ceil(data.totalCount / 50)));
  const rows = data?.rows ?? [], options = [...rows, ...(selected && !rows.some(r => r.id === selected.id) ? [selected] : [])].map(r => ({value: r.id, label: r.name_en, labelAr: r.name_ar, code: r.code, badge: r.is_active ? undefined : "Inactive", disabled: busy}));
  return <div aria-busy={busy}>
    <ERPCombobox ariaLabel={ariaLabel} value={value} options={options} required={required} allowClear={!required} disabled={!enabled || query.isError} placeholder={`Select ${ariaLabel.toLowerCase()}…`} filterFn={() => true}
      onSearchQueryChange={v => {setSearch(v); setPage(1);}} onValueChange={v => {if (!owner.active || busy || !admitted || query.isError) return; const id = v === null ? null : Number(v); if (id !== null && !options.some(o => o.value === id)) return; onReadState(true); onValueChange(id); setSearch(""); setPage(1);}} emptyText={busy ? "Loading permitted choices…" : !admitted ? "Review search criteria before loading choices." : "No permitted choices match"} />
    {busy && <p role="status" className="text-xs text-muted-foreground">Loading {ariaLabel.toLowerCase()} choices…</p>}
    {!safe.success && <p role="alert">Search is too long. Use at most 200 characters.</p>}
    {query.isError && <p role="alert">Choices could not be loaded. Your entries are retained. <Button type="button" variant="outline" disabled={!admitted || denied || query.isFetching} onClick={retry}>Retry {ariaLabel.toLowerCase()} choices</Button></p>}
    {enabled && !blocked && data && <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{data.totalCount} matching choices · page {page}</span><div><Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous {ariaLabel.toLowerCase()} choices</Button><Button type="button" variant="outline" size="sm" disabled={page * 50 >= data.totalCount} onClick={() => setPage(p => p + 1)}>Next {ariaLabel.toLowerCase()} choices</Button></div></div>}
    {enabled && !busy && !query.isError && safe.success && value !== null && !selected && <p role="alert">The selected {ariaLabel.toLowerCase()} is no longer available. Choose another permitted value.</p>}
  </div>;
}
