import { reportSafeDiagnostic } from "@/lib/observability/safe-diagnostic";

// Safe local diagnostic output; no telemetry request or third-party service.
if (typeof window !== "undefined") {
  const report = (error: unknown) => reportSafeDiagnostic(error, { route: window.location.pathname, source: "client", build: process.env.NEXT_PUBLIC_ALGT_BUILD_COMMIT, event: "CLIENT_RUNTIME_ERROR" });
  window.addEventListener("error", event => report(event.error));
  window.addEventListener("unhandledrejection", event => report(event.reason));
}
