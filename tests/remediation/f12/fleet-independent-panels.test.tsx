import { renderToReadableStream } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import FleetPage from "@/app/(protected)/modules/fleet/page";
import FleetAssetPage from "@/app/(protected)/modules/fleet/[id]/page";

const mock = vi.hoisted(() => ({
  auth: vi.fn(), assets: vi.fn(), choices: vi.fn(), asset: vi.fn(), hosted: vi.fn(),
  scopes: vi.fn(), exitTasks: vi.fn(), board: vi.fn(), custody: vi.fn(), custodyChoices: vi.fn(), assetPage: vi.fn(),
}));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); } }));
vi.mock("@/lib/rbac/check", () => ({
  getAuthContext: mock.auth,
  hasPermission: (actor: { permissionCodes: string[] }, code: string) => actor.permissionCodes.includes(code),
}));
vi.mock("@/features/fleet/asset-form", () => ({ NewFleetAsset: () => <p>New asset form</p> }));
vi.mock("@/features/fleet/asset-editor", () => ({ FleetAssetEditor: () => <p>Asset editor</p>, FleetEvidenceForm: () => null }));
vi.mock("@/features/fleet/custody-panel", () => ({ CustodyOccurrenceLookup: () => null, FleetCustodyPanel: () => <p>Authorized custody</p> }));
vi.mock("@/features/fleet/exit-checks", () => ({ FleetExitChecks: () => <p>Authorized exit checks</p> }));
vi.mock("@/features/dms/entity-documents/dms-entity-documents-tab", () => ({ DmsEntityDocumentsTab: () => null }));
vi.mock("@/features/notifications/notification-open", () => ({ NotificationArrival: () => null }));
vi.mock("@/features/operations/admin-overview", () => ({ OperationsAdminOverview: () => null }));
vi.mock("@/server/actions/fleet/assets", () => ({
  listFleetAssets: mock.assets, getFleetChoices: mock.choices, getFleetAsset: mock.asset, getFleetAssetPage: mock.assetPage,
}));
vi.mock("@/server/actions/fleet/custody", () => ({
  listHostedAssets: mock.hosted, getFleetExitScopes: mock.scopes, getFleetExitTasks: mock.exitTasks,
  getFleetBoard: mock.board, getFleetCustody: mock.custody, getCustodyChoices: mock.custodyChoices,
}));

const activeAsset = { id: 7, asset_no: "FLT-007", name: "Scoped test truck", category: "truck", status: "active", plate: "A 7" };
const hostedAsset = { ...activeAsset, id: 17, asset_no: "FLT-017", name: "Hosted test truck" };
const detailAsset = {
  ...activeAsset, company: 31, branch: 22, vin: "SYNTHETICVIN", serial: null, can_manage: true,
  can_see_documents: false, history: [], plates: [], meters: [], evidence: [],
};
const allowed = ["fleet.assets.view", "fleet.custody.manage"];
const custody = { asset_no: hostedAsset.asset_no, asset_name: hostedAsset.name, can_manage: true };

beforeEach(() => {
  vi.resetAllMocks();
  mock.auth.mockResolvedValue({ profile: { id: 1 }, permissionCodes: allowed, isAccountActive: true, roleAssignments: [] });
  mock.assets.mockResolvedValue([activeAsset]);
  mock.asset.mockResolvedValue(detailAsset);
  mock.board.mockResolvedValue([{ asset: 7, status: "held", overdue: false, held: true }]);
  mock.hosted.mockResolvedValue([hostedAsset]);
  mock.scopes.mockResolvedValue([{ company: 31, branch: 22 }]);
  mock.exitTasks.mockResolvedValue([]);
  mock.choices.mockResolvedValue({ scopes: [{ company: 31, branch: 22, label: "Exact home branch" }] });
  mock.custody.mockResolvedValue(custody);
  mock.custodyChoices.mockResolvedValue({ workers: [], sites: [] });
});

function deferredRead(mockRead: ReturnType<typeof vi.fn>, value: unknown) {
  let release!: (result: unknown) => void;
  mockRead.mockReturnValue(new Promise(resolve => { release = resolve; }));
  return () => release(value);
}

async function primaryAndFinal(page: Promise<React.ReactNode>, primary: string, release: () => void) {
  const stream = page.then(tree => renderToReadableStream(tree));
  let beforeRelease = false;
  let markup = "";
  let timeout!: ReturnType<typeof setTimeout>;
  const deadline = new Promise<void>(resolve => { timeout = setTimeout(resolve, 400); });
  const loaded = (async () => {
    const reader = (await stream).getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      markup += decoder.decode(chunk.value, { stream: true });
      if (markup.includes(primary)) break;
    }
    return { reader, decoder };
  })();
  try {
    beforeRelease = await Promise.race([loaded.then(() => markup.includes(primary)), deadline.then(() => false)]);
  } finally {
    clearTimeout(timeout);
    release();
  }
  const { reader, decoder } = await loaded;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    markup += decoder.decode(chunk.value, { stream: true });
  }
  return { beforeRelease, markup };
}

it("renders the scoped Fleet register before hosted, exit, choice and availability reads complete", async () => {
  const release = [
    deferredRead(mock.hosted, [hostedAsset]), deferredRead(mock.scopes, [{ company: 31, branch: 22 }]),
    deferredRead(mock.choices, { scopes: [] }), deferredRead(mock.board, [{ asset: 7, status: "held", held: true, overdue: false }]),
  ];
  const { beforeRelease, markup } = await primaryAndFinal(FleetPage({ searchParams: Promise.resolve({ exitBranch: "22" }) }),
    activeAsset.name, () => release.forEach(finish => finish()));

  expect(beforeRelease).toBe(true);
  expect(markup).toContain("Hosted test truck");
  expect(markup).toContain("Authorized exit checks");
  expect(markup).toContain("Held");
  expect(mock.board.mock.calls).toEqual([[[7]]]);
  expect(mock.exitTasks.mock.calls).toEqual([[31, 22]]);
});

it("renders the primary asset while custody loads and starts exact editor choices independently", async () => {
  const releaseCustody = deferredRead(mock.custody, custody);
  const releaseCustodyChoices = deferredRead(mock.custodyChoices, { workers: [], sites: [] });
  let editorStartedBeforeCustody = false;
  const { beforeRelease, markup } = await primaryAndFinal(FleetAssetPage({
    params: Promise.resolve({ id: "7" }), searchParams: Promise.resolve({ custodyBefore: "18" }),
  }), "SYNTHETICVIN", () => {
    editorStartedBeforeCustody = mock.choices.mock.calls.length === 1;
    releaseCustody();
    releaseCustodyChoices();
  });
  expect(beforeRelease).toBe(true);
  expect(editorStartedBeforeCustody).toBe(true);
  expect(markup).toContain("Exact home branch");
  expect(markup).toContain("Authorized custody");
  expect(mock.custody.mock.calls).toEqual([[7, 18]]);
  expect(mock.custodyChoices.mock.calls).toEqual([[7, ""]]);
});

it("keeps a hosted-only detail in its existing custody response without opening asset editing", async () => {
  mock.asset.mockResolvedValue(null);
  const stream = await renderToReadableStream(await FleetAssetPage({
    params: Promise.resolve({ id: "17" }), searchParams: Promise.resolve({}),
  }));
  const markup = await new Response(stream).text();
  expect(markup).toContain(hostedAsset.name);
  expect(markup).toContain("Authorized custody");
  expect(markup).not.toContain("Asset editor");
  expect(mock.choices).not.toHaveBeenCalled();
});

it("does not render detail for an unrelated record or start an editor lookup", async () => {
  mock.asset.mockResolvedValue(null);
  mock.custody.mockResolvedValue(null);
  await expect(FleetAssetPage({ params: Promise.resolve({ id: "99" }), searchParams: Promise.resolve({}) })).rejects.toThrow("notFound");
  expect(mock.choices).not.toHaveBeenCalled();
  expect(mock.custodyChoices).not.toHaveBeenCalled();
});

it("loads only the Fleet identity and current configuration on first open", async () => {
  mock.asset.mockResolvedValueOnce({
    ...detailAsset, can_see_documents: true,
    history: [{ id: 8, kind: "configuration", effective_on: "2026-04-01", reason: "Initial configuration", facts: {} }],
  });
  mock.auth.mockResolvedValueOnce({ profile: { id: 1 }, permissionCodes: [...allowed, "dms.documents.view"] });
  const markup = await new Response(await renderToReadableStream(await FleetAssetPage({
    params: Promise.resolve({ id: "7" }), searchParams: Promise.resolve({}),
  }))).text();

  expect(markup).toContain("SYNTHETICVIN");
  expect(markup).toContain("Asset history");
  expect(markup).toContain("Documents and verification");
  expect(markup).not.toContain("Initial configuration");
  expect(mock.assetPage).not.toHaveBeenCalled();
});

it("streams the selected history page without blocking identity and retains the custody cursor", async () => {
  const release = deferredRead(mock.assetPage, { section: "history", has_more: true, rows: [
    { id: 8, kind: "ownership", effective_on: "2026-04-01", reason: "Original owner", facts: {} },
  ] });
  const { beforeRelease, markup } = await primaryAndFinal(FleetAssetPage({
    params: Promise.resolve({ id: "7" }),
    searchParams: Promise.resolve({ custodyBefore: "18", assetPanel: "history", assetPage: "2" }),
  }), "SYNTHETICVIN", release);

  expect(beforeRelease).toBe(true);
  expect(markup).toContain("Original owner");
  expect(markup).toContain("custodyBefore=18&amp;assetPanel=history&amp;assetPage=3");
  expect(mock.assetPage.mock.calls).toEqual([[7, "history", 2]]);
});

it("distinguishes a failed history read from an empty page", async () => {
  mock.assetPage.mockResolvedValueOnce(null);
  const markup = await new Response(await renderToReadableStream(await FleetAssetPage({
    params: Promise.resolve({ id: "7" }), searchParams: Promise.resolve({ assetPanel: "history" }),
  }))).text();
  expect(markup).toContain("This history page could not be loaded.");
  expect(markup).not.toContain("No matching records");
});

it("does not request proof choices when the actor lacks permission to link", async () => {
  mock.asset.mockResolvedValueOnce({ ...detailAsset, can_see_documents: true, can_link: false });
  mock.auth.mockResolvedValueOnce({ profile: { id: 1 }, permissionCodes: [...allowed, "dms.documents.view"] });
  const markup = await new Response(await renderToReadableStream(await FleetAssetPage({
    params: Promise.resolve({ id: "7" }), searchParams: Promise.resolve({ assetPanel: "proof" }),
  }))).text();
  expect(markup).toContain("Documents and verification");
  expect(markup).not.toContain("Verify registration or insurance");
  expect(mock.assetPage).not.toHaveBeenCalled();
});

it("does not read exit tasks for an unrecognized or repeated branch selection", async () => {
  for (const exitBranch of ["24", ["22", "24"]]) {
    const stream = await renderToReadableStream(await FleetPage({ searchParams: Promise.resolve({ exitBranch }) }));
    expect(await new Response(stream).text()).toContain(activeAsset.name);
  }
  expect(mock.exitTasks).not.toHaveBeenCalled();
});

it("keeps the 26-row lookahead and checks availability for the visible 25", async () => {
  const rows = Array.from({ length: 26 }, (_, index) => ({ ...activeAsset, id: index + 1, name: "Fleet row " + (index + 1) }));
  mock.assets.mockResolvedValue(rows);
  const stream = await renderToReadableStream(await FleetPage({ searchParams: Promise.resolve({ q: "  test  ", exitBranch: "22" }) }));
  const markup = await new Response(stream).text();
  expect(markup).toContain("Fleet row 25");
  expect(markup).not.toContain("Fleet row 26");
  expect(markup).toContain("q=test&amp;page=2&amp;exitBranch=22");
  expect(mock.assets).toHaveBeenCalledWith("test", 0);
  expect(mock.board).toHaveBeenCalledWith(rows.slice(0, 25).map(row => row.id));
});
