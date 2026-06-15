"use client";

import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { getQueryClient } from "@/lib/query/query-client";
import { WorkspaceProvider } from "@/components/workspace/workspace-provider";
import { WorkspaceDraftProvider } from "@/components/workspace/workspace-draft-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  // useState ensures the QueryClient is created once per component mount
  // and is not recreated on re-renders. getQueryClient() returns the browser
  // singleton so multiple AppProviders (e.g. in tests) share the same cache.
  const [queryClient] = useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          {/* WorkspaceDraftProvider wraps WorkspaceProvider so WorkspaceProvider
              can consume the draft store context to clear drafts on tab close */}
          <WorkspaceDraftProvider>
            <WorkspaceProvider>
              {children}
            </WorkspaceProvider>
          </WorkspaceDraftProvider>
          <Toaster richColors closeButton />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
