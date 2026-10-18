// @vitest-environment jsdom
// Actual toolbar handlers; attachment generation, email and browser downloads
// are test doubles. This suite creates no file, provider call or real email.
import "../remediation/f05/setup";
import React from "react";
import {act, cleanup, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import type {ERPSendEmailDialogProps, PreparedEmailInput} from "@/components/erp/email/email-types-ui";
import type {ReportRegistryEntry} from "@/lib/report-center/types";
const m = vi.hoisted(() => ({pdf: vi.fn(), excel: vi.fn(), csv: vi.fn(), send: vi.fn(), success: vi.fn(), error: vi.fn(),
  emailAccess: true, dialog: null as ERPSendEmailDialogProps | null}));
vi.mock("@/lib/export/generate-attachment", () => ({generatePDFAttachment: m.pdf, generateExcelAttachment: m.excel, generateCSVAttachment: m.csv}));
vi.mock("@/server/actions/email", () => ({sendReportEmail: m.send}));
vi.mock("@/hooks/use-legacy-email-access", () => ({useLegacyEmailAccess: () => m.emailAccess}));
vi.mock("sonner", () => ({toast: {success: m.success, error: m.error}}));
vi.mock("@/components/erp/email/erp-send-email-dialog", () => ({ERPSendEmailDialog: (props: ERPSendEmailDialogProps) => {m.dialog = props; return <div>Synthetic email dialog</div>;}}));
import {ReportExportToolbar} from "@/features/report-center/report-export-toolbar";
const registry = {report_code: "SYNTHETIC", report_name_en: "Synthetic", default_orientation: "portrait", default_output_formats: ["pdf", "excel", "csv", "print"], sensitive_profile: "normal"} as unknown as ReportRegistryEntry;
const attachment = {filename: "synthetic.csv", contentType: "text/csv", base64Content: "VEVTVCBPTkxZ", sizeBytes: 9} satisfies PreparedEmailInput["attachment"];
const input: PreparedEmailInput = {to: "controlled@example.invalid", cc: "", bcc: "", subject: "Synthetic", body: "Synthetic", attachmentType: "csv", attachment};
function deferred<T>() {let resolve!: (value: T) => void; const promise = new Promise<T>(done => {resolve = done;}); return {promise, resolve};}
let permitted = true;
function mount() {
  const exportAction = vi.fn();
  const ui = () => <ReportExportToolbar registryEntry={registry} data={{columns: ["name"], rows: [{name: "SYNTHETIC_PRIVATE"}]}} onExport={exportAction} canUseData={() => permitted} rowCount={1} runId={91} />;
  const view = render(ui()); return {...view, exportAction, refresh: () => view.rerender(ui())};
}
function email() {fireEvent.click(screen.getByRole("button", {name: "Email"})); expect(m.dialog).not.toBeNull(); return m.dialog!;}
beforeEach(() => {
  permitted = true; m.emailAccess = true; m.dialog = null;
  [m.pdf, m.excel, m.csv].forEach(mock => mock.mockResolvedValue(attachment)); m.send.mockResolvedValue({success: true});
  vi.stubGlobal("URL", class extends URL {static createObjectURL = vi.fn(() => "blob:synthetic"); static revokeObjectURL = vi.fn();});
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => {cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); [m.pdf, m.excel, m.csv, m.send, m.success, m.error].forEach(mock => mock.mockReset());});
it("current CSV and print remain available with unchanged data", () => {
  const view = mount(); fireEvent.click(screen.getByRole("button", {name: "CSV"}));
  // F08 uses the parent's shared, formula-neutral serializer for every export.
  // The toolbar must not recreate its former independent CSV downloader.
  expect(view.exportAction).toHaveBeenCalledExactlyOnceWith("csv");
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name: "Print"})); expect(view.exportAction).toHaveBeenCalledWith("print");
});
it("retired output cannot initiate CSV, print or email", () => {
  const view = mount(); permitted = false;
  fireEvent.click(screen.getByRole("button", {name: "CSV"})); fireEvent.click(screen.getByRole("button", {name: "Print"})); fireEvent.click(screen.getByRole("button", {name: "Email"}));
  expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(view.exportAction).not.toHaveBeenCalled(); expect(m.dialog).toBeNull();
});
it.each(["pdf", "excel", "csv"] as const)("current %s attachment keeps the existing generation contract", async format => {
  mount(); const props = email(); const prepared = await props.attachmentOptions.find(option => option.type === format)!.generateAttachment();
  expect(prepared).toEqual(attachment); expect(m[format]).toHaveBeenCalledTimes(1); expect(m[format].mock.calls[0][0].data).toEqual([{name: "SYNTHETIC_PRIVATE"}]); expect(m.send).not.toHaveBeenCalled();
});
it.each(["pdf", "excel", "csv"] as const)("retained %s attachment callback cannot start after retirement", async format => {
  mount(); const props = email(); permitted = false;
  await expect(props.attachmentOptions.find(option => option.type === format)!.generateAttachment()).rejects.toThrow("no longer available");
  expect(m[format]).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
});
it("an in-flight attachment is not returned after owner retirement", async () => {
  const pending = deferred<typeof attachment>(); m.pdf.mockReturnValue(pending.promise); mount(); const props = email();
  const prepared = props.attachmentOptions.find(option => option.type === "pdf")!.generateAttachment(); const assertion = expect(prepared).rejects.toThrow("no longer available");
  permitted = false; pending.resolve(attachment); await assertion; expect(m.send).not.toHaveBeenCalled();
});
it("current send preserves payload and its committed outcome", async () => {
  mount(); const props = email(); await expect(props.onPreparedSend!(input)).resolves.toEqual({success: true});
  expect(m.send).toHaveBeenCalledWith(expect.objectContaining({to: ["controlled@example.invalid"], attachment, runId: 91, attachmentFormat: "csv", context: {moduleCode: "REPORTS", recordCount: 1}}));
  expect(m.success).toHaveBeenCalledTimes(1);
});
it("retained prepared send cannot dispatch for a retired report", async () => {
  mount(); const props = email(); permitted = false;
  await expect(props.onPreparedSend!(input)).resolves.toMatchObject({success: false}); expect(m.send).not.toHaveBeenCalled();
});
it("email-permission removal denies a retained handler while the same report remains mounted", async () => {
  const view = mount(); const props = email(); m.emailAccess = false; view.refresh();
  await expect(props.onPreparedSend!(input)).resolves.toMatchObject({success: false});
  await expect(props.attachmentOptions[0].generateAttachment()).rejects.toThrow("no longer available"); expect(m.send).not.toHaveBeenCalled(); expect(m.pdf).not.toHaveBeenCalled();
});
it("unmount retires retained email handlers even with an unchanged parent predicate", async () => {
  const view = mount(); const props = email(); view.unmount();
  await expect(props.onPreparedSend!(input)).resolves.toMatchObject({success: false}); expect(m.send).not.toHaveBeenCalled();
});
it("a dispatched send retains its truthful result without announcing success to a new owner", async () => {
  const pending = deferred<{success: boolean}>(); m.send.mockReturnValue(pending.promise); mount(); const props = email();
  const sending = props.onPreparedSend!(input); expect(m.send).toHaveBeenCalledTimes(1); permitted = false;
  await act(async () => {pending.resolve({success: true});}); await expect(sending).resolves.toEqual({success: true});
  expect(m.success).not.toHaveBeenCalled(); expect(m.error).not.toHaveBeenCalled(); expect(m.send).toHaveBeenCalledTimes(1);
});
it("missing attachment remains a visible no-dispatch failure", async () => {
  mount(); const props = email(); await expect(props.onPreparedSend!({...input, attachment: null})).resolves.toEqual({success: false, error: "Attachment not ready."}); expect(m.send).not.toHaveBeenCalled();
});
