"use client";

import { useRef, useState, useTransition } from "react";
import { refreshPayrollWorkspace } from "@/server/actions/hr/payroll-workspace-refresh";
import type { PayrollRefreshTarget } from "@/server/payroll-workspace-refresh";

type Result =
  | { ok: true; refreshRequired?: true }
  | { ok: false; error?: string; uncertain?: boolean };
type Success<Response> = Extract<Response, { ok: true }>;

export function usePayrollCommand<Request, Response extends Result>(
  send: (request: Request) => Promise<Response>,
  options: {
    target?: PayrollRefreshTarget;
    onSuccess: (request: Request) => string;
    updateView?: (receipt: Success<Response>) => void;
    unconfirmed: string;
  },
) {
  const inFlight = useRef(false);
  const pending = useRef<Request | null>(null);
  const confirmed = useRef<Success<Response> | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(false);
  const [refreshing, beginRefresh] = useTransition();
  const [refreshError, setRefreshError] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  function updateView(receipt: Success<Response>) {
    const update = options.updateView;
    if (!update) {
      confirmed.current = null;
      setRefreshError(false);
      return;
    }
    beginRefresh(() => {
      try {
        update(receipt);
        confirmed.current = null;
        setRefreshError(false);
      } catch {
        confirmed.current = receipt;
        setRefreshError(true);
      }
    });
  }

  async function submit(build?: () => Request | null) {
    if (inFlight.current || refreshing || confirmed.current) return;
    const retained = pending.current;
    const request = retained ?? build?.();
    if (!request) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    let receipt: Success<Response> | null = null;
    try {
      const result = await send(request);
      if (!result.ok) {
        // A denial on retry can happen before the server checks the prior receipt.
        pending.current = result.uncertain ? request : retained;
        setRetry(pending.current !== null);
        setMessage({ text: result.error ?? options.unconfirmed, error: true });
        return;
      }

      pending.current = null;
      setRetry(false);
      receipt = result as Success<Response>;
      setMessage({ text: options.onSuccess(request), error: false });
      if (receipt.refreshRequired) {
        confirmed.current = receipt;
        setRefreshError(true);
      } else {
        updateView(receipt);
      }
    } catch {
      if (receipt) {
        confirmed.current = receipt;
        setRefreshError(true);
        setMessage({ text: "Payroll action recorded.", error: false });
      } else {
        pending.current = request;
        setRetry(true);
        setMessage({ text: options.unconfirmed, error: true });
      }
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  async function retryRefresh() {
    const receipt = confirmed.current;
    if (inFlight.current || !receipt) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (receipt.refreshRequired && (!options.target || !await refreshPayrollWorkspace(options.target))) return;
      updateView(receipt);
    } catch {
      setRefreshError(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return { submit, retryRefresh, busy: busy || refreshing, retry, refreshError, locked: busy || refreshing || retry || refreshError, message, setMessage };
}
