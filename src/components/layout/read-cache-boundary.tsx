"use client";
import { useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query/query-client";
import { registerPrivateCache } from "@/lib/query/private-cache";
/** Parent key changes for a verified principal/scope change, isolating late old responses. */
export function ReadCacheBoundary({children}:{children:React.ReactNode}) {
  const [client]=useState(makeQueryClient);
  useEffect(()=>registerPrivateCache(client),[client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
