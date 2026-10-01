"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { getQueryClient } from "@/lib/query/query-client";
import { AlgtFluentProvider } from "@/components/design-system/fluent-provider";

// ERP USERS.4 — WorkspaceProvider moved to ErpShell so the server can supply
// a permission-aware defaultRoute. AppProviders only handles global infra.

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AlgtFluentProvider>
        <TooltipProvider>
          {children}
          <Toaster richColors closeButton />
        </TooltipProvider>
        </AlgtFluentProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
