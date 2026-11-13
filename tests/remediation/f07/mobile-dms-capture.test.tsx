// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import type { MobileDraft } from "@/features/dms/mobile/mobile-dms-draft";

const mocks = vi.hoisted(() => ({
  owner: { identity: { authUserId: "", scopeVersion: "test" }, isLive: () => true, admits: () => true },
  store: new Map<string, MobileDraft>(),
  admit: vi.fn(),
  transfer: vi.fn(),
  complete: vi.fn(),
  acknowledge: vi.fn(),
  startAi: vi.fn(),
}));

vi.mock("@/components/layout/read-cache-boundary", () => ({ useReadCacheOwner: () => mocks.owner }));
vi.mock("@/features/dms/upload/dms-upload-scope-picker", () => ({ DmsUploadScopePicker: () => null }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: mocks.transfer }) } }) }));
vi.mock("@/server/actions/dms/upload-sessions", () => ({
  createDmsUploadSession: mocks.admit,
  completeDmsTempUpload: mocks.complete,
  acknowledgeDmsSingleUpload: mocks.acknowledge,
}));
vi.mock("@/server/actions/dms/ai-intake", () => ({ startAiIntakeFromUploadSession: mocks.startAi }));
vi.mock("@/features/dms/mobile/mobile-dms-draft", async importOriginal => ({
  ...await importOriginal<typeof import("@/features/dms/mobile/mobile-dms-draft")>(),
  mobileDraftStorage: async (key: string, draft?: MobileDraft | null) => {
    if (draft === undefined) return mocks.store.get(key);
    if (draft === null) mocks.store.delete(key);
    else mocks.store.set(key, draft);
  },
}));

import { MobileDmsCapture } from "@/features/dms/mobile/mobile-dms-capture";
import { buildMobileDocument, normalizeMobileFile } from "@/features/dms/mobile/mobile-dms-draft";

const user = "a7000000-0000-4000-8000-000000000001";
const context = { entityType: "site", entityId: 7 };
const session = { id: 9, session_code: "SYNTHETIC", mime_type: "application/pdf" };
const admission = { success: true, data: { session, path: "sessions/synthetic/file.pdf", token: "test", uploadRequired: true } };
const mount = (authUserId = user) => {
  mocks.owner.identity.authUserId = authUserId;
  return render(<MobileDmsCapture user={authUserId} context={context} canStartAi />);
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.store.clear();
  mocks.admit.mockResolvedValue(admission);
  mocks.transfer.mockResolvedValue({ error: null });
  mocks.complete.mockResolvedValue({ success: true, data: session });
  mocks.acknowledge.mockResolvedValue({ success: true });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ sessionCode: session.session_code, intakeStatus: "review_pending" }) })));
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.stubGlobal("crypto", {
    randomUUID: () => "d7000000-0000-4000-8000-000000000001",
    subtle: { digest: async () => new Uint8Array(32).buffer },
  });
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: (_key: string, callback: () => Promise<void>) => callback() } });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:synthetic" });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => {} });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each(["admit", "transfer", "complete", "acknowledge"] as const)("recovers the same draft after a lost %s response", async stage => {
  mocks[stage].mockRejectedValueOnce(new Error("Synthetic connection loss"));
  const first = mount();
  const picker = screen.getByLabelText("Choose a PDF or photos") as HTMLInputElement;
  await waitFor(() => expect(picker.disabled).toBe(false));
  const file = new File(["synthetic"], "file.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => new Uint8Array(9).buffer });
  fireEvent.change(picker, { target: { files: [file] } });
  fireEvent.click(await screen.findByRole("button", { name: "Upload document" }));
  await screen.findByRole("alert");
  expect(mocks.acknowledge).toHaveBeenCalledTimes(stage === "acknowledge" ? 1 : 0);
  first.unmount();

  const other = mount("a7000000-0000-4000-8000-000000000002");
  await waitFor(() => expect((screen.getByLabelText("Choose a PDF or photos") as HTMLInputElement).disabled).toBe(false));
  expect(screen.queryByRole("button", { name: "Retry upload" })).toBeNull();
  other.unmount();

  mocks.admit.mockResolvedValue({ ...admission, data: { ...admission.data, uploadRequired: stage === "admit" } });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Retry upload" }));
  const review = await screen.findByRole("link", { name: "Review document" });
  expect(review.getAttribute("href")).toBe(`/dms/intake/${session.session_code}`);
  expect(mocks.admit.mock.calls[1]).toEqual(mocks.admit.mock.calls[0]);
  expect(mocks.transfer).toHaveBeenCalledOnce();
  expect(mocks.acknowledge).toHaveBeenCalledTimes(stage === "acknowledge" ? 2 : 1);
  expect(mocks.complete).toHaveBeenCalledTimes(stage === "transfer" ? 0 : 1);
  expect(mocks.startAi).not.toHaveBeenCalled();
  expect(mocks.store.get(`${user}:site:7`)).toMatchObject({ files: [], uploaded: { id: session.id } });
  expect(mocks.store.get(`${user}:site:7`)?.submission).toBeUndefined();
});

it("keeps the last offline draft page until the user removes it", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  const first = mount();
  const picker = screen.getByLabelText("Choose a PDF or photos") as HTMLInputElement;
  await waitFor(() => expect(picker.disabled).toBe(false));
  fireEvent.change(picker, { target: { files: [new File(["synthetic"], "page.jpg", { type: "image/jpeg" })] } });
  await screen.findByText("Draft saved on this device.");
  fireEvent.click(screen.getByRole("button", { name: "Upload document" }));
  await screen.findByText(/Retry when you have a connection/);
  expect(mocks.admit).not.toHaveBeenCalled();
  first.unmount();

  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Remove page 1" }));
  await waitFor(() => expect(mocks.store.has(`${user}:site:7`)).toBe(false));
  expect(screen.queryByRole("button", { name: "Upload document" })).toBeNull();
});

it("prepares HEIC through the device decoder and sends a JPEG to the DMS contract", async () => {
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(4000);
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockReturnValue(3000);
  Object.defineProperty(HTMLImageElement.prototype, "decode", { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage, fillRect: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => callback(new Blob(["synthetic-jpeg"], { type: "image/jpeg" })));
  const result = await normalizeMobileFile(new File(["synthetic-heic"], "page.HEIC", { type: "image/heic" }));
  expect(result).toMatchObject({ name: "page.jpg", type: "image/jpeg" });
  expect(drawImage).toHaveBeenCalledWith(expect.any(HTMLImageElement), 0, 0, 3000, 2250);
  expect(await buildMobileDocument([result])).toBe(result);
});

it("makes a two-page PDF in the user's chosen photo order", async () => {
  const wide = new File(["wide"], "wide.jpg", { type: "image/jpeg" });
  const tall = new File(["tall"], "tall.jpg", { type: "image/jpeg" });
  vi.spyOn(URL, "createObjectURL").mockImplementation(file => `blob:${(file as File).name}`);
  const photo = (image: HTMLImageElement) => image.src.endsWith("wide.jpg") ? { width: 30, height: 20 } : { width: 20, height: 30 };
  vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockImplementation(function (this: HTMLImageElement) { return photo(this).width; });
  vi.spyOn(HTMLImageElement.prototype, "naturalHeight", "get").mockImplementation(function (this: HTMLImageElement) { return photo(this).height; });
  Object.defineProperty(HTMLImageElement.prototype, "decode", { configurable: true, value: vi.fn().mockResolvedValue(undefined) });
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage, fillRect: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(function (this: HTMLCanvasElement) {
    return createCanvas(this.width, this.height).toDataURL("image/jpeg");
  });

  const pdf = await buildMobileDocument([tall, wide]);
  const bytes = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(pdf);
  });
  expect(pdf).toMatchObject({ type: "application/pdf" });
  expect(bytes.match(/\/Type \/Page\b/g)).toHaveLength(2);
  expect(drawImage.mock.calls.map(([image, , , width, height]) => [image.src, width, height])).toEqual([
    ["blob:tall.jpg", 20, 30],
    ["blob:wide.jpg", 30, 20],
  ]);
});
