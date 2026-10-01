"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ValidatedTaskForm } from "@/components/workspace/validated-task-form";
import { ConfiguredRow } from "@/components/erp/table/list-controls";
import { DmsListTools, useDmsListView, type DmsListField } from "@/features/dms/dms-list-view";
import { bulkRenameDocumentsToStandardFileNames, type BulkRenameResult } from "@/server/actions/dms/standard-file-name";

const FIELDS: DmsListField[] = [
  {id:"document",label:"Document",path:"documentId",type:"number",required:true,width:120},
  {id:"before",label:"Before",path:"oldName",width:260},
  {id:"after",label:"Proposed name",path:"newName",width:260},
  {id:"status",label:"Result",path:"resultLabel",width:200},
];

export function DmsStandardFileNameBulkRenamePanel() {
  const id = useId();
  const [limit, setLimit] = useState("100");
  const [result, setResult] = useState<{data:BulkRenameResult; dryRun:boolean; limit:number} | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const view = useDmsListView("bulk-rename-samples", (result?.data.samples ?? []).map(row=>({...row,
    resultLabel:row.qualityIssue ? "Skipped: quality check" : result?.dryRun ? "Would rename" : "Processed — see run totals",
  })), FIELDS);
  const previewReady = result?.dryRun && result.limit === Number(limit) && result.data.updated > 0;
  return <section aria-labelledby={`${id}-heading`} className="rounded-sm border bg-card p-4 space-y-4">
    <h3 id={`${id}-heading`} className="text-base font-semibold">Standard file names</h3>
    <p className="text-sm text-muted-foreground">Build file names from document type, owner, document number and expiry. Preview the proposed names before applying a batch. The operation rechecks records at execution time; filters below do not select which records will be renamed.</p>
    <ValidatedTaskForm className="space-y-3" onSubmit={async data => {
      const dryRun = data.get("operation") !== "rename";
      if (!dryRun && (!previewReady || !window.confirm(`Apply standard names to up to ${Number(limit)} eligible documents? This may affect existing file names. The preview is not a locked selection.`))) return;
      setFailure(null); setResult(null);
      const response = await bulkRenameDocumentsToStandardFileNames({limit:Number(limit),dryRun});
      if (!response.success || !response.data) { setFailure("The operation did not complete. Preview again and check your access before retrying."); return; }
      setResult({data:response.data,dryRun,limit:Number(limit)});
    }}>
      <div className="flex flex-wrap items-end gap-3">
        <label htmlFor={`${id}-limit`} className="grid gap-1 text-sm">Batch size
          <Input id={`${id}-limit`} name="batch_size" type="number" required min={1} max={500} step={1} value={limit} onChange={e=>setLimit(e.target.value)} className="w-28" />
        </label>
        <Button type="submit" name="operation" value="preview" variant="outline">Preview names</Button>
        <Button type="submit" name="operation" value="rename" disabled={!previewReady}>Apply names</Button>
      </div>
    </ValidatedTaskForm>
    {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
    {result && <div className="space-y-3 border-t pt-3">
      <p role="status" className="text-sm">{result.dryRun ? "Preview" : "Last run"}: {result.data.processed} processed · {result.data.updated} {result.dryRun ? "would rename" : "renamed"} · {result.data.skipped} skipped · {result.data.errors.length} errors.</p>
      {result.data.errors.length>0 && <p role="alert" className="text-sm text-destructive">Some records could not be processed. Their names may be unchanged. Preview again before retrying; contact your administrator if the problem continues.</p>}
      <p className="text-xs text-muted-foreground">The server returns a sample, not a complete per-file execution log. A proposed name below does not prove that an individual file was renamed.</p>
      <DmsListTools view={view} search />
      <div role="region" aria-label="File name samples" tabIndex={0} className="max-w-full overflow-auto rounded-sm border">
        <table className="w-full text-sm" style={{minWidth:view.visible.reduce((sum,c)=>sum+c.width,0)}}>
          <colgroup>{view.visible.map(c=><col key={c.id} style={{width:c.width}} />)}</colgroup>
          <thead><tr>{view.visible.map(c=><th key={c.id} className="text-left px-3 py-2 bg-muted/30">{c.label}</th>)}</tr></thead>
          <tbody>{view.rows.map((row,i)=><ConfiguredRow columns={view.columns} key={`${row.documentId}:${i}`} className="border-t">
            <td data-column="document" className="p-3">#{row.documentId}</td>
            <td data-column="before" className="p-3 break-all">{row.oldName}</td>
            <td data-column="after" className="p-3 break-all">{row.newName}</td>
            <td data-column="status" className="p-3">{row.resultLabel}</td>
          </ConfiguredRow>)}{!view.rows.length && <tr><td colSpan={view.visible.length} className="p-6 text-center text-muted-foreground">No sample rows match this view.</td></tr>}</tbody>
        </table>
      </div>
    </div>}
  </section>;
}
