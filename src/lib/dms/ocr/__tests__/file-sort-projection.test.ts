import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

it.each([
  ["src/server/actions/dms/ocr.ts", 2],
  ["src/server/actions/dms/document-content.ts", 2],
  ["src/server/actions/dms/ai-analysis.ts", 1],
  ["src/lib/hr/compliance/compliance-dms-ocr.ts", 1],
] as const)("retains created_at in sorted OCR-file projections in %s", (file, expectedCount) => {
  const source = readFileSync(path.resolve(file), "utf8");
  const calls = source.split('.from("dms_document_files")').slice(1)
    .map(segment => segment.split(/\.from\(/)[0])
    .filter(segment => /\.order\("created_at"/.test(segment));
  expect(calls).toHaveLength(expectedCount);
  for (const call of calls) {
    const selected = /\.select\((?:"([^"]+)"|(OCR_FILE_SELECT))\)/.exec(call);
    expect(selected).not.toBeNull();
    const columns = selected![2] ? /const OCR_FILE_SELECT = `([^`]+)`/.exec(source)![1] : selected![1];
    expect(columns.split(",").map(column => column.trim())).toContain("created_at");
  }
});
