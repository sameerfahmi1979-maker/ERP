import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import type { DmsOcrJobRow } from "@/server/actions/dms/ocr";
vi.mock("@/components/ui/button", () => ({ Button: (props: Record<string, unknown>) => createElement("button", props) }));
vi.mock("@/features/dms/ocr/dms-ocr-status-badge", () => ({ DmsOcrStatusBadge: ({ status }: { status: string }) => createElement("span", null, status) }));
import { RecentOcrJobsList } from "../recent-ocr-jobs-list";
// Deliberately synthetic identifiers; never a live OCR/document fixture.
const base: DmsOcrJobRow = { id: 990137, document_id: 990745, file_id: 990733, job_type: "ocr", provider: "vision", model: "gpt-6.1-sol",
  status: "completed", started_at: "2026-10-17T08:51:13Z", completed_at: "2026-10-17T08:51:42Z", duration_ms: 28900,
  error_message: null, retry_count: 0, created_at: "2026-10-17T08:51:13Z" };
function render(jobs = [base], canRetry = true, retrying = false) {
  return renderToStaticMarkup(createElement(RecentOcrJobsList, { jobs, canRetry, retrying, onRetry: vi.fn(), formatProvider: provider => provider === "vision" ? "GPT Vision" : provider || "—" }));
}
it("renders only the compact list, with accessible column labels and no table toolbar or pagination", () => {
  const html = render();
  for (const value of ["#990137", "GPT Vision", "28.9s", "Recent OCR jobs", 'scope="col"']) expect(html).toContain(value);
  for (const value of ["Search loaded", "Edit filters", "Edit columns", "Rows per page", "Previous", "Next", ">Actions<"]) expect(html).not.toContain(value);
  expect(html).toContain('caption class="sr-only"');
});
it("shows retry only for a permitted failed job and disables it during retry", () => {
  const failed = { ...base, status: "failed" };
  expect(render([failed])).toContain("Retry OCR job #990137");
  expect(render([failed], false)).not.toContain("Retry OCR job");
  expect(render([failed], true, true)).toContain('disabled=""');
});
it("keeps full long errors safely escaped rather than truncating or injecting HTML", () => {
  const message = '<script>alert("x")</script>' + "X".repeat(500);
  const html = render([{ ...base, error_message: message }]);
  expect(html).toContain("X".repeat(500)); expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;");
});
it("handles zero duration, invalid dates and an empty history", () => {
  expect(render([{ ...base, duration_ms: 0, started_at: "invalid" }])).toContain("0.0s");
  expect(render([])).toBe("");
});
it("uses percentage/fixed-layout columns, wrapping and a narrow-container stacked layout", () => {
  const css = readFileSync("src/features/dms/documents/sections/recent-ocr-jobs-list.module.css", "utf8");
  expect(css).toContain("width: 100%"); expect(css).toContain("table-layout: fixed");
  expect(css).toContain("overflow-wrap: anywhere"); expect(css).toContain("@container (max-width: 600px)");
  expect(css).not.toMatch(/min-width:\s*\d{2,}px/);
});
