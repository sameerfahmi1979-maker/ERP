"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Result = { ok: boolean; error?: string; uncertain?: boolean };

export function useExitMutation<Request>(send: (request: Request) => Promise<Result>, onSuccess?: () => void) {
  const router = useRouter();
  const running = useRef(false);
  const [pending, setPending] = useState<Request | null>(null);
  const [working, setWorking] = useState(false);
  const [refreshing, beginRefresh] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();

  async function record(request: Request) {
    if (running.current) return;
    running.current = true;
    setWorking(true);
    setMessage(undefined);
    try {
      const result = await send(request);
      if (result.ok) {
        setPending(null);
        onSuccess?.();
        setMessage({ ok: true, text: "Settlement action recorded." });
        beginRefresh(() => router.refresh());
      } else {
        setPending(result.uncertain ? request : null);
        setMessage({ ok: false, text: result.error ?? "The settlement action could not be recorded." });
      }
    } catch {
      setPending(request);
      setMessage({ ok: false, text: "The result is unconfirmed. Retry the same request." });
    } finally {
      setWorking(false);
      running.current = false;
    }
  }

  return { record, pending, working, locked: working || refreshing || pending !== null, message, setMessage };
}
