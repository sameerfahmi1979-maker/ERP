import type { Instrumentation } from "next";
import { reportSafeDiagnostic } from "@/lib/observability/safe-diagnostic";

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startPreparationDispatcher } = await import('@/server/dms-preparation-dispatcher');
    startPreparationDispatcher();
  }
}

export const onRequestError: Instrumentation.onRequestError = (error, _request, context) => {
  // Framework route template, not the raw URL, headers, cookies or action arguments.
  reportSafeDiagnostic(error, { route: context.routePath, source: "server", build: process.env.NEXT_PUBLIC_ALGT_BUILD_COMMIT, event: "SERVER_REQUEST_ERROR" });
};
