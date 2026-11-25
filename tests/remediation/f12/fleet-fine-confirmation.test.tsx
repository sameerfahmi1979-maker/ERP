// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { DriverSearch, FineActionForm, textField } from "@/features/fleet/fine-form";

const mock = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn(), readDrivers: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mock.refresh }) }));
vi.mock("@/server/actions/fleet/fines", () => ({ saveFleetFine: mock.save, readFleetFineDrivers: mock.readDrivers }));
vi.mock("@/features/fleet/asset-form", () => ({
  FleetField: ({ label, children }: { label: string; children: ReactNode }) => <label>{label}{children}</label>,
  fleetSelectClass: "",
}));

beforeEach(() => {
  mock.save.mockReset();
  mock.refresh.mockReset();
  mock.readDrivers.mockReset();
});
afterEach(cleanup);

function submitFine() {
  render(<FineActionForm action="verify-driver" target={38} label="Save review"
    values={form => ({ reason: textField(form, "reason") })}>
    <label>Reason<input name="reason" defaultValue="Synthetic evidence" /></label>
  </FineActionForm>);
  fireEvent.click(screen.getByRole("button", { name: "Save review" }));
}

it("keeps a confirmed Fleet save and retries only its failed read refresh", async () => {
  mock.save.mockResolvedValue({ ok: true, id: 72, replayed: false });
  mock.refresh.mockImplementationOnce(() => { throw new Error("Synthetic refresh failure"); });
  submitFine();

  expect(await screen.findByText("Saved.")).toBeTruthy();
  expect(screen.queryByText(/Save unconfirmed/)).toBeNull();
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Save review" }).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Retry refresh" }));

  expect(mock.refresh).toHaveBeenCalledTimes(2);
  expect(mock.save).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button", { name: "Retry refresh" })).toBeNull();
});

it("keeps the original Fleet request after response loss and a denied retry", async () => {
  mock.save.mockRejectedValueOnce(new Error("Synthetic response loss"))
    .mockResolvedValueOnce({ ok: false, error: "Synthetic denial", uncertain: false })
    .mockResolvedValueOnce({ ok: true, id: 72, replayed: true });
  submitFine();

  fireEvent.click(await screen.findByRole("button", { name: "Retry original request" }));
  expect(await screen.findByText("Synthetic denial")).toBeTruthy();
  const input = screen.getByRole<HTMLInputElement>("textbox", { name: "Reason" });
  expect(input.matches(":disabled")).toBe(true);
  fireEvent.change(input, { target: { value: "Edit after response loss" } });
  fireEvent.click(screen.getByRole("button", { name: "Retry original request" }));

  await waitFor(() => expect(mock.save).toHaveBeenCalledTimes(3));
  expect(mock.save.mock.calls[1]).toEqual(mock.save.mock.calls[0]);
  expect(mock.save.mock.calls[2]).toEqual(mock.save.mock.calls[0]);
  expect(await screen.findByText("The original save was confirmed.")).toBeTruthy();
});

it("uses Enter only for the employee lookup inside a Fleet form", async () => {
  mock.readDrivers.mockResolvedValue([{ id: 7, label: "Synthetic employee" }]);
  render(<FineActionForm action="verify-driver" target={38} label="Save review" values={() => ({})}>
    <DriverSearch caseId={38} />
  </FineActionForm>);
  const search = screen.getByRole("textbox", { name: "Find employee by name or number" });
  fireEvent.change(search, { target: { value: "Synthetic" } });
  expect(mock.readDrivers).not.toHaveBeenCalled();
  expect(fireEvent.keyDown(search, { key: "Enter" })).toBe(false);

  expect(await screen.findByRole("option", { name: "Synthetic employee" })).toBeTruthy();
  expect(mock.readDrivers).toHaveBeenCalledExactlyOnceWith(38, "Synthetic");
  expect(mock.save).not.toHaveBeenCalled();
});

it.each(["match-custody", "refresh-damage"] as const)("labels %s as an immediate save", async action => {
  mock.save.mockResolvedValue({ ok: true, id: 72, replayed: false });
  render(<FineActionForm action={action} target={38} label="Update case" values={() => ({ revision: 3 })} />);
  expect(screen.getByText("This action saves the case immediately.")).toBeTruthy();
  expect(mock.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Update case" }));
  expect(await screen.findByText("Saved.")).toBeTruthy();
  expect(mock.save).toHaveBeenCalledOnce();
});
