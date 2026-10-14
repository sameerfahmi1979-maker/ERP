"use client";
import {ERPCombobox} from "@/components/erp/combobox";
import {Button} from "@/components/ui/button";
import {Label} from "@/components/ui/label";
import type {ReportCriterionControl} from "@/hooks/use-report-criteria";

export function ReportCriterionPicker({label, control, hasValue, disabled}: {label: string; control: ReportCriterionControl; hasValue: boolean; disabled: boolean}) {
  const message = control.denied ? "Choices are unavailable with your current access."
    : control.invalid ? "Enter a search of at most 200 characters and clear any invalid selection."
    : control.busy ? "Checking choices…"
    : control.error ? "Choices could not be loaded. Retry or clear this selection."
    : control.selectionUnavailable ? "This selection is unavailable for the current filters or access. Clear it or select another choice."
    : control.totalCount === 0 ? "No matching choices." : null;
  return <div className="space-y-1">
    <Label className="text-xs text-muted-foreground">{label}</Label>
    <ERPCombobox key={control.owner} ariaLabel={label} value={control.value} options={control.options} showCode
      placeholder={`Select ${label.toLowerCase()}...`} disabled={disabled || control.denied}
      onValueChange={control.select} onSearchQueryChange={control.search} filterFn={() => true}
      emptyText={control.ready ? "No matching choices." : "Choices have not been verified."} />
    {message && <p role={control.error || control.invalid || control.selectionUnavailable || control.denied ? "alert" : "status"} className="text-xs text-muted-foreground">{message}</p>}
    <div className="flex flex-wrap items-center gap-1 text-xs">
      {hasValue && <Button type="button" size="sm" variant="ghost" disabled={disabled} aria-label={`Clear ${label}`} onClick={() => control.select(null)}>Clear</Button>}
      {!control.denied && (control.error || control.selectionUnavailable) && <Button type="button" size="sm" variant="outline" disabled={disabled || control.busy || control.invalid} onClick={control.retry} aria-label={`Retry ${label} choices`}>Retry</Button>}
      {control.totalCount !== null && control.totalCount > 25 && <>
        <Button type="button" size="sm" variant="ghost" aria-label={`Previous ${label} choices`} disabled={disabled || !control.ready || control.page <= 1} onClick={() => control.move(control.page - 1)}>Previous</Button>
        <span>Page {control.page} · {control.totalCount} matches</span>
        <Button type="button" size="sm" variant="ghost" aria-label={`Next ${label} choices`} disabled={disabled || !control.ready || control.page * 25 >= control.totalCount} onClick={() => control.move(control.page + 1)}>Next</Button>
      </>}
    </div>
  </div>;
}
