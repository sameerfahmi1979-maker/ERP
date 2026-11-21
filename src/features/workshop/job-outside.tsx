"use client";

import { type JobWorkRequest, type OutsideWorkspace } from "@/lib/workshop/labour-contract";
import { JobWorkForm, dateTime, number, option, text, timeLabel } from "./job-work-form";

export function JobOutside({ data }: { data: OutsideWorkspace }) {
  const proof = (type: string, label: string) => option("file", label, data.documents.filter(doc => doc.type === type)
    .map(doc => ({ id: doc.file, label: doc.number + " · " + doc.title })));
  function attach(values: JobWorkRequest["data"]) {
    const original = data.documents.find(doc => doc.file === values.file);
    const { file, ...fields } = values;
    return file && original ? { ...fields, evidence: { document: original.document, version: original.version, file: original.file } } : fields;
  }
  return <section className="space-y-4 rounded-lg border bg-card p-4">
    <h2 className="text-lg font-semibold">Outside repair</h2>
    {data.qc_blocked && <p className="rounded-md border border-amber-600/40 px-3 py-2 text-sm">Resolve open outside work before completing technical release.</p>}
    {data.prepare && ["planned", "in-progress"].includes(data.job_state) && <details>
      <summary className="mb-2 cursor-pointer font-medium">Prepare supplier work</summary>
      <JobWorkForm parent={data.job} family="outside" action="prepare" label="Prepare outside work" fields={[
        option("supplier", "Approved supplier", data.vendors.map(vendor => ({
          id: vendor.id, label: vendor.name + (vendor.requires_comparison ? " · Comparison required" : ""),
        }))), text("reference", "Service commitment reference"), text("comparison", "Comparison reference", true),
        dateTime("promised_return", "Promised return"), number("estimate", "Approved estimate (AED)"),
      ]} />
    </details>}
    {!data.orders.length && <p className="text-sm text-muted-foreground">No outside orders on this cycle.</p>}
    {data.orders.map(order => {
      const identity = { outside: order.id, revision: order.revision };
      return <article key={order.id} className="space-y-3 rounded-md border p-3 text-sm">
        <h3 className="font-semibold">{order.reference} · {order.state.replaceAll("-", " ")}{order.supplier_name && ` · ${order.supplier_name}`}</h3>
        <p>Promised return {timeLabel(order.promised_return)}{order.returned && ` · Returned ${timeLabel(order.returned)}`}{order.late && " · Late"}</p>
        {order.estimate !== null && <p>Estimate AED {order.estimate.toFixed(2)}{order.actual !== null && ` · Actual AED ${order.actual.toFixed(2)}`}</p>}
        {order.outcome && <p>Supplier outcome · {order.outcome.replaceAll("-", " ")}{order.invoice && ` · Invoice ${order.invoice}`}</p>}
        {order.finance_receipt && <p>Finance staging receipt #{order.finance_receipt.id} · Awaiting Finance interface</p>}
        {order.events.length > 0 && <details>
          <summary className="cursor-pointer font-medium">Custody and evidence history</summary>
          <ul className="mt-2 space-y-2 border-l pl-3">{order.events.map((event, index) => <li key={index}>
            <span className="capitalize">{event.action.replaceAll("-", " ")}</span> · {timeLabel(event.at ?? event.recorded_at)} · {event.by}
            {event.milestone && ` · ${event.milestone}`}{event.reason && <p className="text-muted-foreground">{event.reason}</p>}
            {event.proof && <a className="text-primary hover:underline" href={`/api/dms/file?fileId=${event.proof.file}`}>Signed original</a>}
          </li>)}</ul>
        </details>}
        {order.can_approve && <JobWorkForm parent={data.job} family="outside" action="approve" label="Approve supplier commitment" constants={identity} />}
        {order.can_approve_variance && <JobWorkForm parent={data.job} family="outside" action="approve-variance" label="Approve actual cost variance" constants={identity} />}
        {data.manage && ["prepared", "approved"].includes(order.state) && <details>
          <summary className="mb-2 cursor-pointer">Cancel unstarted supplier work</summary>
          <JobWorkForm parent={data.job} family="outside" action="cancel" label="Cancel commitment" constants={identity} />
        </details>}
        {data.manage && order.state === "approved" && <JobWorkForm parent={data.job} family="outside" action="dispatch" label="Record supplier handover"
          constants={identity} map={attach} fields={[dateTime("occurred", "Actual handover"), proof("FLEET_WORKSHOP_OUTSIDE_HANDOVER", "Signed handover")]} />}
        {data.manage && order.state === "with-vendor" && <div className="space-y-3">
          <JobWorkForm parent={data.job} family="outside" action="milestone" label="Record supplier progress" constants={identity}
            fields={[dateTime("occurred", "Progress time"), text("milestone", "Milestone")]} />
          <JobWorkForm parent={data.job} family="outside" action="complete" label="Record supplier completion" constants={identity} map={attach}
            fields={[dateTime("occurred", "Supplier completion"), option("outcome", "Result", [
              { id: "completed", label: "Completed" }, { id: "partial", label: "Partial" }, { id: "not-repaired", label: "Repair unsuccessful" },
            ]), number("actual", "Actual supplier cost (AED)"), text("invoice", "Supplier invoice reference"),
            proof("FLEET_WORKSHOP_OUTSIDE_SERVICE", "Signed work and cost evidence")]} />
        </div>}
        {data.manage && order.state === "work-complete" && <JobWorkForm parent={data.job} family="outside" action="return" label="Record physical return"
          constants={identity} map={attach} fields={[dateTime("occurred", "Actual return"), proof("FLEET_WORKSHOP_OUTSIDE_RETURN", "Signed return original")]} />}
        {order.can_stage_finance && <JobWorkForm parent={data.job} family="outside" action="stage-finance" label="Stage verified cost for Finance" constants={identity} />}
      </article>;
    })}
  </section>;
}
