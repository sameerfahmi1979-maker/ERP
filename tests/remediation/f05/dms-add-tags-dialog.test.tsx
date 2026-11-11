// @vitest-environment jsdom
import "./setup";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import type { DmsTagCatalogueQuery } from "@/server/reads/dms-tag-catalogue";
import { DmsAddTagsDialog } from "@/features/dms/documents/sections/dms-add-tags-dialog";

const read = vi.hoisted(() => vi.fn());
vi.mock("@/features/dms/documents/section-read", () => ({ readDmsSection: read }));

const tags = Array.from({ length: 500 }, (_, index) => ({
  id: index + 1, tag_name: `Tag ${String(index + 1).padStart(3, "0")}`, tag_code: null, is_system: index % 2 === 0,
}));
const onAdd = vi.fn();
const onOpenChange = vi.fn();

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><FluentProvider theme={webLightTheme}>
    <DmsAddTagsDialog assignedIds={new Set([1])} onAdd={onAdd} onOpenChange={onOpenChange} />
  </FluentProvider></QueryClientProvider>);
}

beforeEach(() => {
  vi.resetAllMocks();
  read.mockImplementation(async (_kind: string, [{ page, search, kind }]: [DmsTagCatalogueQuery]) => {
    const matches = tags.filter(tag => tag.tag_name.toLowerCase().includes(search.toLowerCase())
      && (kind === "all" || tag.is_system === (kind === "system")));
    return { success: true, data: { tags: matches.slice((page - 1) * 25, page * 25), total: matches.length } };
  });
});
afterEach(cleanup);

it("loads only after opening and adds selections from different pages, searches and filters", async () => {
  mount();
  expect(read).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Add tags" }));
  const dialog = within(screen.getByRole("dialog"));
  const assigned = await dialog.findByRole<HTMLInputElement>("checkbox", { name: "Tag 001, already assigned" });
  expect(assigned.disabled).toBe(true);
  expect(dialog.getAllByRole("checkbox")).toHaveLength(25);
  expect(dialog.getByText("1–25 of 500")).toBeTruthy();
  fireEvent.click(dialog.getByRole("checkbox", { name: "Tag 002" }));
  fireEvent.click(dialog.getByRole("button", { name: "Next" }));
  fireEvent.click(await dialog.findByRole("checkbox", { name: "Tag 026" }));
  expect(dialog.getByText("26–50 of 500")).toBeTruthy();
  fireEvent.change(dialog.getByRole("searchbox", { name: "Search tags" }), { target: { value: "tag 499" } });
  expect(await dialog.findByRole("checkbox", { name: "Tag 499" })).toBeTruthy();
  fireEvent.change(dialog.getByLabelText("Tag type"), { target: { value: "system" } });
  fireEvent.click(await dialog.findByRole("checkbox", { name: "Tag 499" }));
  expect(dialog.getByText("Selected tags (3)")).toBeTruthy();
  fireEvent.click(dialog.getByRole("button", { name: "Remove Tag 026 from selection" }));
  expect(onAdd).not.toHaveBeenCalled();
  fireEvent.click(dialog.getByRole("button", { name: "Add 2 tags" }));
  expect(onAdd).toHaveBeenCalledExactlyOnceWith([tags[1], tags[498]]);
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
  expect(read.mock.calls.map(call => call[1][0])).toContainEqual({ page: 1, search: "tag 499", kind: "system" });
});

it("keeps selections during a failed page read and clears the temporary list on cancel", async () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Add tags" }));
  let dialog = within(screen.getByRole("dialog"));
  fireEvent.click(await dialog.findByRole("checkbox", { name: "Tag 002" }));
  read.mockRejectedValueOnce(new Error("Controlled failure"));
  fireEvent.click(dialog.getByRole("button", { name: "Next" }));
  expect(await dialog.findByRole("alert")).toBeTruthy();
  expect(dialog.getByText("Selected tags (1)")).toBeTruthy();
  fireEvent.click(dialog.getByRole("button", { name: "Try again" }));
  expect(await dialog.findByRole("checkbox", { name: "Tag 026" })).toBeTruthy();
  fireEvent.click(dialog.getByRole("button", { name: "Cancel" }));
  expect(onAdd).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole("dialog", { hidden: true })).toBeNull());
  const opener = await screen.findByRole("button", { name: "Add tags" });
  opener.focus();
  fireEvent.click(opener);
  dialog = within(await screen.findByRole("dialog"));
  expect(dialog.getByText("Selected tags (0)")).toBeTruthy();
  // JSDOM has no layout rectangles for Fluent's focus restoration.
  expect((await dialog.findByLabelText<HTMLInputElement>("Tag 002")).checked).toBe(false);
});
