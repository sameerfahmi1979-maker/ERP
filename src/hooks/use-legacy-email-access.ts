"use client";
import { useQuery } from "@tanstack/react-query";
import { getLegacyEmailExportAccess } from "@/server/actions/email";

/** Display hint only. The send action always rechecks current authority. */
export function useLegacyEmailAccess() {
  const { data } = useQuery({
    queryKey: ["security", "legacy-email-export-access"],
    queryFn: getLegacyEmailExportAccess,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  return data === true;
}
