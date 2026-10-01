"use client";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { loadedListValue } from "@/components/erp/table/loaded-list-view";
import { QueryReadBoundary } from "@/components/erp/query-read-boundary";
import { useQuery } from "@tanstack/react-query";

import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  archiveAiModelCostRate,
  createAiModelCostRate,
  getAiModelCostRates,
  updateAiModelCostRate,
  type CostRateRow,
  type CreateCostRateInput,
} from "@/server/actions/dms/ai-observability";
import { Archive, CheckCircle2, PlusCircle } from "lucide-react";
import { useState } from "react";

interface Props {
  refreshKey: number;
}

const EMPTY_FORM: CreateCostRateInput = {
  providerType: "",
  modelId: "",
  displayName: "",
  rateType: "token",
  inputCostPer1mTokens: null,
  outputCostPer1mTokens: null,
  currencyCode: "USD",
  effectiveFrom: new Date().toISOString().slice(0, 10),
  isActive: true,
  requiresConfirmation: true,
  sourceNote: "",
};

export function AiCostRateAdmin({ refreshKey }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CreateCostRateInput>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const uiRead1 = useQuery({
    queryKey: ["ai-model-cost-rates", refreshKey],
    queryFn: async () => {
      const result = await getAiModelCostRates();
      if (!result.success || !result.data) throw new Error(result.error ?? "Failed to load cost rates.");
      return result.data;
    },
    retry: false, gcTime: 0, refetchOnWindowFocus: false,
  });
 const { data: rates, isFetching: loading, error: queryError, refetch } = uiRead1;
  const error = queryError?.message;
  const loadRates = () => refetch();

  const handleCreate = async () => {
    setSubmitting(true);
    setSubmitError(null);
    const res = await createAiModelCostRate(form);
    setSubmitting(false);
    if (res.success) {
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      loadRates();
    } else {
      setSubmitError(res.error ?? "Failed to create.");
    }
  };

  const handleArchive = async (id: number) => {
    await archiveAiModelCostRate(id);
    loadRates();
  };

  const handleConfirm = async (rate: CostRateRow) => {
    await updateAiModelCostRate(rate.id, { requiresConfirmation: false });
    loadRates();
  };

  if (loading) return <QueryReadBoundary queries={[uiRead1]}><div className="text-sm text-muted-foreground">Loading cost rates...</div></QueryReadBoundary>;
  if (error) return <QueryReadBoundary queries={[uiRead1]}><div className="text-sm text-destructive">{error}</div></QueryReadBoundary>;

  return (
    <QueryReadBoundary queries={[uiRead1]}><div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Configure AI model cost rates. Rates must be confirmed by admin before cost estimation is active.
        </p>
        <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-2">
          <PlusCircle className="h-4 w-4" />
          Add Rate
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        {/* UI05 explicit table: authorized loaded rows, original permission-aware actions */}<ERPDataTable tableId="special.dms.ai-observability.ai-cost-rate-admin" data={(rates ?? [])} columns={[{id:"providerType",header:"Provider",accessorFn:r=>loadedListValue(r,"providerType"),meta:{filter:{type:"text"}},enableHiding:false,size:220,cell:({row:{original:r}})=>{
return <>{r.providerType}</>;}},{id:"modelId",header:"Model",accessorFn:r=>loadedListValue(r,"modelId"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:r}})=>{
return <>{r.modelId}</>;}},{id:"rateType",header:"Type",accessorFn:r=>loadedListValue(r,"rateType"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:r}})=>{
return <>{r.rateType}</>;}},{id:"inputCostPer1mTokens",header:"Input cost per 1M",accessorFn:r=>loadedListValue(r,"inputCostPer1mTokens"),meta:{filter:{type:"number"}},enableHiding:true,size:180,cell:({row:{original:r}})=>{
return <>{r.inputCostPer1mTokens !== null ? `$${r.inputCostPer1mTokens}` : "—"}</>;}},{id:"outputCostPer1mTokens",header:"Output cost per 1M",accessorFn:r=>loadedListValue(r,"outputCostPer1mTokens"),meta:{filter:{type:"number"}},enableHiding:true,size:180,cell:({row:{original:r}})=>{
return <>{r.outputCostPer1mTokens !== null ? `$${r.outputCostPer1mTokens}` : "—"}</>;}},{id:"effectiveFrom",header:"Effective",accessorFn:r=>loadedListValue(r,"effectiveFrom"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:r}})=>{
return <>{r.effectiveFrom}</>;}},{id:"isActive",header:"Active",accessorFn:r=>loadedListValue(r,"isActive"),meta:{filter:{type:"text"}},enableHiding:true,size:180,cell:({row:{original:r}})=>{
return <>{r.requiresConfirmation
                    ? <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Unconfirmed</Badge>
                    : <Badge variant="default" className="text-xs">Confirmed</Badge>}{!r.isActive && <Badge variant="secondary" className="text-xs ml-1">Archived</Badge>}</>;}},{id:"actions",header:"Actions",enableSorting:false,meta:{exportable:false},enableHiding:true,size:180,cell:({row:{original:r}})=>{
return <><div className="flex gap-1">
                    {r.requiresConfirmation && r.isActive && (
                      <button
                        onClick={() => handleConfirm(r)}
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
                        title="Mark as confirmed — enables cost estimation"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        Confirm
                      </button>
                    )}
                    {r.isActive && (
                      <button
                        onClick={() => handleArchive(r.id)}
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground border hover:bg-muted/80"
                        title="Archive this rate"
                      >
                        <Archive className="h-3 w-3" />
                      </button>
                    )}
                  </div></>;}}]} enableRowSelection={false} searchPlaceholder="Search loaded records…" initialPageSize={10} />
      </div>

      <ERPChildDialogForm
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Add Cost Rate"
        subtitle="Configure AI model cost rate for cost estimation"
        mode="add"
        size="md"
        isSubmitting={submitting}
        onSubmit={handleCreate}
        submitLabel="Add Rate"
      >
        <div className="grid grid-cols-12 gap-4">
          {submitError && (
            <div className="col-span-12 text-sm text-destructive bg-destructive/10 px-3 py-2 rounded">{submitError}</div>
          )}
          <div className="col-span-6">
            <Label className="text-xs">Provider Type <span className="text-destructive">*</span></Label>
            <Input aria-label="Provider Type" required value={form.providerType} onChange={(e) => setForm((f) => ({ ...f, providerType: e.target.value }))} placeholder="openai" />
          </div>
          <div className="col-span-6">
            <Label className="text-xs">Model ID <span className="text-destructive">*</span></Label>
            <Input aria-label="Model ID" required value={form.modelId} onChange={(e) => setForm((f) => ({ ...f, modelId: e.target.value }))} placeholder="gpt-4.1" />
          </div>
          <div className="col-span-12">
            <Label className="text-xs">Display Name</Label>
            <Input aria-label="Display Name" value={form.displayName ?? ""} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value || null }))} placeholder="GPT-4.1" />
          </div>
          <div className="col-span-4">
            <Label className="text-xs">Rate Type</Label>
            <select aria-label="Rate Type"
              value={form.rateType}
              onChange={(e) => setForm((f) => ({ ...f, rateType: e.target.value as CreateCostRateInput["rateType"] }))}
              className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="token">token</option>
              <option value="page">page</option>
              <option value="unit">unit</option>
              <option value="zero">zero (free)</option>
            </select>
          </div>
          <div className="col-span-4">
            <Label className="text-xs">Input $/1M tokens</Label>
            <Input aria-label="Input $/1M tokens"
              type="number"
              step="0.000001"
              placeholder="e.g. 2.00"
              value={form.inputCostPer1mTokens ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, inputCostPer1mTokens: e.target.value ? Number(e.target.value) : null }))}
            />
          </div>
          <div className="col-span-4">
            <Label className="text-xs">Output $/1M tokens</Label>
            <Input aria-label="Output $/1M tokens"
              type="number"
              step="0.000001"
              placeholder="e.g. 8.00"
              value={form.outputCostPer1mTokens ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, outputCostPer1mTokens: e.target.value ? Number(e.target.value) : null }))}
            />
          </div>
          <div className="col-span-4">
            <Label className="text-xs">Effective From <span className="text-destructive">*</span></Label>
            <Input aria-label="Effective From" required type="date" value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} />
          </div>
          <div className="col-span-4">
            <Label className="text-xs">Currency</Label>
            <Input aria-label="Currency" value={form.currencyCode ?? "USD"} onChange={(e) => setForm((f) => ({ ...f, currencyCode: e.target.value }))} placeholder="USD" />
          </div>
          <div className="col-span-4 flex items-end gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.requiresConfirmation ?? true}
                onChange={(e) => setForm((f) => ({ ...f, requiresConfirmation: e.target.checked }))}
              />
              Requires confirmation
            </label>
          </div>
          <div className="col-span-12">
            <Label className="text-xs">Source Note</Label>
            <Input aria-label="Source Note"
              value={form.sourceNote ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, sourceNote: e.target.value || null }))}
              placeholder="Source of rate information"
            />
          </div>
        </div>
      </ERPChildDialogForm>
    </div></QueryReadBoundary>
  );
}
