"use client";

import { usePayrollCommand } from "@/hooks/use-payroll-command";

type Result = { ok: true; refreshRequired?: true } | { ok: false; error?: string; uncertain?: boolean };

export function useExitMutation<Request>(send: (request: Request) => Promise<Result>, onSuccess: () => void) {
  return usePayrollCommand(send, {
    target: "exit",
    onSuccess() {
      onSuccess();
      return "Settlement action recorded.";
    },
    unconfirmed: "The result is unconfirmed. Retry the same request.",
  });
}
