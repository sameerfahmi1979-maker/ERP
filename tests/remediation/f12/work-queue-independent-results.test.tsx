import { renderToReadableStream } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { WorkQueueWorkspace } from "@/features/operations/work-queues/work-queue-workspace";
import type { WorkQueueRead, WorkQueuePage } from "@/lib/operations/work-queue-contract";

const reads = vi.hoisted(() => ({ scopes: vi.fn(), page: vi.fn() }));
vi.mock("@/server/reads/work-queues", () => ({ readWorkQueueScopes: reads.scopes, readWorkQueue: reads.page }));

it("streams the authorized Work Queues filters before the scoped results return", async () => {
  reads.scopes.mockResolvedValue({
    status: "ok", data: [{ company: 17, branch: 22, company_name: "Synthetic employer", branch_name: "Branch One", kinds: ["custody"] }],
  });
  let resolveResult!: (value: WorkQueueRead<WorkQueuePage>) => void;
  reads.page.mockReturnValue(new Promise(resolve => { resolveResult = resolve; }));
  const stream = WorkQueueWorkspace({ params: { scope: "17.22", kind: "custody", q: "open", page: "2" } })
    .then(tree => renderToReadableStream(tree));
  const received = stream.then(async output => {
    const reader = output.getReader();
    const decoder = new TextDecoder();
    let html = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      html += decoder.decode(chunk.value, { stream: true });
      if (html.includes("Apply filters")) break;
    }
    return { html, reader, decoder };
  });
  let deadline!: ReturnType<typeof setTimeout>;
  const waiting = new Promise<false>(resolve => { deadline = setTimeout(() => resolve(false), 400); });
  let first: Awaited<typeof received> | false;
  try {
    first = await Promise.race([received, waiting]);
  } finally {
    clearTimeout(deadline);
    resolveResult({ status: "ok", data: { as_of: "2026-11-22", total: 0, page: 2, page_size: 25, rows: [] } });
  }
  const { reader, decoder, html } = await received;
  let markup = html;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    markup += decoder.decode(chunk.value, { stream: true });
  }

  expect(first && first.html).toContain("Apply filters");
  expect(markup).toContain("No open work matches these filters.");
  expect(reads.page.mock.calls).toEqual([[{ company: 17, branch: 22, kind: "custody", query: "open", page: 2 }]]);
});

