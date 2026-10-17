"use client";
import {useEffect, useRef, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {z} from "zod";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
import {readJson, ReadError, retryAuthorizedRead} from "@/lib/reads/client";
import {canonicalReadParams} from "./use-server-page";
import {hrDocumentBrowserCriteriaSchema, hrDocumentBrowserIdentity, hrBrowserEmployeesPage, hrBrowserDependentsPage, hrBrowserDocumentsPage,
  hrBrowserFilesPage, hrBrowserFilesUnavailable, hrBrowserTooLarge, type HrDocumentBrowserCriteria, type HrDocumentBrowserResponse} from "@/lib/reads/hr-document-browser-schema";

const schemas = {employees: z.union([hrBrowserEmployeesPage, hrBrowserTooLarge]), dependents: hrBrowserDependentsPage,
  documents: z.union([hrBrowserDocumentsPage, hrBrowserTooLarge]), files: z.union([hrBrowserFilesPage, hrBrowserFilesUnavailable])};
type Operation = HrDocumentBrowserCriteria["operation"];
type Response<K extends Operation> = z.infer<(typeof schemas)[K]>;
export type HrBrowserSeed = {identity: string; data: z.infer<typeof hrBrowserEmployeesPage>};
export const hrBrowserPrefix = (identity: string) => ["hr", "employees", "document-browser", identity] as const;
const retiredSeeds = new WeakSet<HrDocumentBrowserResponse>();
export function retireHrBrowserSeed(seed?: HrBrowserSeed) {if (seed) retiredSeeds.add(seed.data);}
export function useHrDocumentBrowser<K extends Operation>(auth: AuthContext, input: HrDocumentBrowserCriteria & {operation: K}, options: {seed?: HrBrowserSeed; onDenied?: () => void; enabled?: boolean} = {}) {
  const identity = hrDocumentBrowserIdentity(auth), criteria = hrDocumentBrowserCriteriaSchema.parse(input);
  const serialized = canonicalReadParams(criteria), key = [...hrBrowserPrefix(identity), criteria.operation, serialized];
  const owner = JSON.stringify(key), committed = useRef(owner), previous = useRef(key), qc = useQueryClient();
  const [deniedOwner, setDeniedOwner] = useState<string | null>(null);
  const allowed = hasPermission(auth, "hr.employees.view") && (hasPermission(auth, "dms.documents.view") || hasPermission(auth, "dms.admin"));
  const seed = options.seed;
  const query = useQuery<Response<K>, Error>({queryKey: key, staleTime: 30000, retry: retryAuthorizedRead, refetchOnWindowFocus: true,
    enabled: options.enabled !== false && allowed && deniedOwner !== owner,
    initialData: options.enabled !== false && allowed && seed && seed.identity === identity && !retiredSeeds.has(seed.data) && canonicalReadParams(seed.data.criteria) === serialized ? seed.data as Response<K> : undefined,
    initialDataUpdatedAt: seed ? Date.parse(seed.data.asOf) : undefined,
    queryFn: async ({signal}) => {
      const result = await readJson<{success: true; data: unknown}>("hr-document-browser", JSON.parse(serialized), signal);
      const data = schemas[criteria.operation].parse(result.data);
      if (canonicalReadParams(data.criteria) !== serialized) throw Error("Browser response did not match its request");
      return data as Response<K>;
    }});
  const denied = !allowed || deniedOwner === owner || query.error instanceof ReadError && [401, 403].includes(query.error.status);
  if (denied && deniedOwner !== owner) setDeniedOwner(owner);
  useEffect(() => {
    committed.current = owner;
    if (JSON.stringify(previous.current) !== owner) {
      const old = previous.current; void qc.cancelQueries({queryKey: old, exact: true}); qc.removeQueries({queryKey: old, exact: true}); previous.current = key;
    }
    return () => {if (committed.current === owner) committed.current = "";};
    // Canonical owner captures every read input; only this prior request retires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, qc]);
  useEffect(() => {
    if (seed && (denied || query.isError)) retiredSeeds.add(seed.data);
    if (denied) {void qc.cancelQueries({queryKey: key, exact: true}); qc.removeQueries({queryKey: key, exact: true}); options.onDenied?.();}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [denied, owner, query.isError, seed, options.onDenied, qc]);
  return {...query, denied, identity, data: options.enabled === false || denied || query.isError || query.isFetching ? undefined : query.data,
    retry: () => {if (options.enabled !== false && committed.current === owner && !denied && qc.getQueryState(key)?.fetchStatus !== "fetching") void query.refetch({cancelRefetch: false});}};
}
