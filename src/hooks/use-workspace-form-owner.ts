"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useWorkspaceContext } from "@/components/workspace/workspace-provider";

/** A mounted form belongs to its rendered route, never the next navigation target. */
export function useWorkspaceFormOwner(ownerRoute?: string) {
  const context = useWorkspaceContext();
  const pathname = usePathname();
  const [ownerId] = useState(() => {
    const route = ownerRoute ?? pathname;
    return context?.state.tabs.find(tab => route
      ? tab.route.split("?")[0] === route.split("?")[0]
      : tab.id === context.state.activeTabId)?.id ?? null;
  });
  return context?.state.tabs.find(tab => tab.id === ownerId) ?? null;
}
