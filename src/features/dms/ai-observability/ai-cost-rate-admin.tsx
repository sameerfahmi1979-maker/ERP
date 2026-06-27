"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getAiModelCostRates,
  createAiModelCostRate,
  archiveAiModelCostRate,
  updateAiModelCostRate,
  type CostRateRow,
  type CreateCostRateInput,
} from "@/server/actions/dms/ai-observability";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { PlusCircle, Archive, CheckCircle2 } from "lucide-react";

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
  const [rates, setRates] = useState<CostRateRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CreateCostRateInput>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadRates = useCallback(() => {
    setLoading(true);
    getAiModelCostRates()
      .then((res) => {
        if (res.success && res.data) setRates(res.data);
        else setError(res.error ?? "Failed to load.");
      })
      .catch(() => setError("Failed to load cost rates."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(loadRates, [loadRates, refreshKey]);

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

  if (loading) return <div className="text-sm text-muted-foreground">Loading cost rates...</div>;
  if (error) return <div className="text-sm text-destructive">{error}</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Configure AI model cost rates. Rates must be confirmed by admin before cost estimation is active.
        </p>
        <Button size="sm" onClick={() => setDialogOpen(true)} className="gap-2">
          <PlusCircle className="h-4 w-4" />
          Add Rate
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Provider</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Model</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">In $/1M</th>
              <th className="px-3 py-2 text-right font-medium text-muted-foreground">Out $/1M</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Effective</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(rates ?? []).map((r) => (
              <tr key={r.id} className={`border-b last:border-0 hover:bg-muted/30 ${!r.isActive ? "opacity-50" : ""}`}>
                <td className="px-3 py-2 font-mono">{r.providerType}</td>
                <td className="px-3 py-2 font-mono">{r.modelId}</td>
                <td className="px-3 py-2">{r.rateType}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.inputCostPer1mTokens !== null ? `$${r.inputCostPer1mTokens}` : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.outputCostPer1mTokens !== null ? `$${r.outputCostPer1mTokens}` : "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{r.effectiveFrom}</td>
                <td className="px-3 py-2">
                  {r.requiresConfirmation
                    ? <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Unconfirmed</Badge>
                    : <Badge variant="default" className="text-xs">Confirmed</Badge>}
                  {!r.isActive && <Badge variant="secondary" className="text-xs ml-1">Archived</Badge>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
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
                  </div>
                </td>
              </tr>
            ))}
            {(!rates || rates.length === 0) && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">No cost rates configured.</td>
              </tr>
            )}
          </tbody>
        </table>
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
            <Input value={form.providerType} onChange={(e) => setForm((f) => ({ ...f, providerType: e.target.value }))} placeholder="openai" />
          </div>
          <div className="col-span-6">
            <Label className="text-xs">Model ID <span className="text-destructive">*</span></Label>
            <Input value={form.modelId} onChange={(e) => setForm((f) => ({ ...f, modelId: e.target.value }))} placeholder="gpt-4.1" />
          </div>
          <div className="col-span-12">
            <Label className="text-xs">Display Name</Label>
            <Input value={form.displayName ?? ""} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value || null }))} placeholder="GPT-4.1" />
          </div>
          <div className="col-span-4">
            <Label className="text-xs">Rate Type</Label>
            <select
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
            <Input
              type="number"
              step="0.000001"
              placeholder="e.g. 2.00"
              value={form.inputCostPer1mTokens ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, inputCostPer1mTokens: e.target.value ? Number(e.target.value) : null }))}
            />
          </div>
          <div className="col-span-4">
            <Label className="text-xs">Output $/1M tokens</Label>
            <Input
              type="number"
              step="0.000001"
              placeholder="e.g. 8.00"
              value={form.outputCostPer1mTokens ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, outputCostPer1mTokens: e.target.value ? Number(e.target.value) : null }))}
            />
          </div>
          <div className="col-span-4">
            <Label className="text-xs">Effective From <span className="text-destructive">*</span></Label>
            <Input type="date" value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} />
          </div>
          <div className="col-span-4">
            <Label className="text-xs">Currency</Label>
            <Input value={form.currencyCode ?? "USD"} onChange={(e) => setForm((f) => ({ ...f, currencyCode: e.target.value }))} placeholder="USD" />
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
            <Input
              value={form.sourceNote ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, sourceNote: e.target.value || null }))}
              placeholder="Source of rate information"
            />
          </div>
        </div>
      </ERPChildDialogForm>
    </div>
  );
}
