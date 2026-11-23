"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useReadCacheOwner, type ReadCacheIdentity } from "@/components/layout/read-cache-boundary";
import { AGENTS, MODULES, agentsInModule, registeredModules, type Agent, type AgentCenterSnapshot, type AgentModule, type Outcome } from "@/lib/ai-agent-center/contracts";
import { dubaiTime, getConfirmedHandoff } from "@/lib/ai-agent-center/progress";
import { classifyFeed, readWithinAuthority, retainNewest, SAFE_REFRESH_MS } from "@/lib/ai-agent-center/live";
import { readJson, ReadError, retryAuthorizedRead } from "@/lib/reads/client";
import { AgentCenterInspector, type InspectorTab } from "./agent-center-inspector";
import { AgentCenterWorkflow, type AgentState } from "./agent-center-workflow";
import { AgentCenterControls } from "./agent-center-controls";

const outcomes = [
  { id: "filed", label: "Filed" }, { id: "duplicate", label: "Duplicates skipped" },
  { id: "review", label: "Awaiting review" }, { id: "failed", label: "Failed" },
] as const;

type CaseReadData = Pick<AgentCenterSnapshot, "selectedCase" | "confirmedAt"> & { handoff: ReturnType<typeof getConfirmedHandoff> };
const NAMESPACE = "ai-agent-center";
const noSubscription = () => () => {};

function deniedRead(error: unknown) {
  return error instanceof ReadError && (error.status === 401 || error.status === 403);
}

function agentStates(snapshot: AgentCenterSnapshot): Partial<Record<Agent["key"], AgentState>> {
  const checkpoint = snapshot.checkpoint;
  return {
    intake: checkpoint ? checkpoint.paused || !checkpoint.policyEnabled
      ? { label: checkpoint.paused ? "Paused" : "Off", status: "paused" }
      : snapshot.laneActivity.intakeRunning ? { label: "Processing a source", status: "running" }
        : { label: "Source check recorded", status: "idle" } : undefined,
    extraction: snapshot.laneActivity.extractionRunning ? { label: "Running AI Fill", status: "running" } : undefined,
    validation: snapshot.laneActivity.reviewWaiting ? { label: "Awaiting approval", status: "review" } : undefined,
  };
}

export function AgentCenterPageClient({ initial, seedOwner, canInspectControls }: {
  initial: AgentCenterSnapshot; seedOwner: ReadCacheIdentity; canInspectControls: boolean;
}) {
  const [companyId, setCompanyId] = useState(initial.scope.companyId);
  const [branchId, setBranchId] = useState<number | null>(initial.scope.branchId);
  const [module, setModule] = useState<AgentModule>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [offset, setOffset] = useState(0);
  const [selection, setSelection] = useState<Pick<AgentCenterSnapshot["cases"][number], "id" | "title"> | null>(null);
  const caseId = selection?.id ?? null;
  const [agent, setAgent] = useState<Agent["key"]>("intake");
  const [tab, setTab] = useState<InspectorTab>("activity");
  const [now, setNow] = useState(Date.parse(initial.confirmedAt));
  const cache = useReadCacheOwner();
  const queryClient = useQueryClient();
  const ownerMatches = cache?.admits(seedOwner) === true;
  const getDenialVersion = () => cache?.readDenialVersion(NAMESPACE) ?? 0;
  const denialVersion = useSyncExternalStore(cache?.subscribe ?? noSubscription, getDenialVersion, getDenialVersion);
  const seedAllowed = ownerMatches && denialVersion === 0;
  const home = companyId === initial.scope.companyId && branchId === initial.scope.branchId &&
    !search && !outcome && offset === 0;
  const activityKey = [NAMESPACE, cache?.generation, companyId, branchId, "activity", search, outcome, offset] as const;
  const caseKey = [NAMESPACE, cache?.generation, companyId, branchId, "case", caseId] as const;

  async function readSnapshot(criteria: { search?: string; outcome?: Outcome | null; caseId?: string | null; offset?: number }, signal: AbortSignal) {
    if (!cache) throw new DOMException("Read scope was retired.", "AbortError");
    const result = await readWithinAuthority({
      active: () => cache.admits(seedOwner) && !signal.aborted,
      denialVersion: getDenialVersion,
      revoke: () => cache.denyReadNamespace(NAMESPACE, queryClient.getQueryCache().findAll({ queryKey: [NAMESPACE] })),
    }, () => readJson<{ data: AgentCenterSnapshot }>(NAMESPACE, { companyId, branchId, ...criteria }, signal), deniedRead);
    return result.data;
  }

  const refresh = {
    retry: retryAuthorizedRead,
    refetchInterval: (current: { state: { error: unknown } }) => deniedRead(current.state.error) ? false as const : SAFE_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  };
  const activityQuery = useQuery<AgentCenterSnapshot>({
    ...refresh,
    queryKey: activityKey,
    enabled: ownerMatches,
    initialData: home && seedAllowed ? initial : undefined,
    initialDataUpdatedAt: Date.parse(initial.confirmedAt),
    queryFn: async ({ signal }) => {
      const incoming = await readSnapshot({ search, outcome, offset }, signal);
      return retainNewest(queryClient.getQueryData<AgentCenterSnapshot>(activityKey), incoming);
    },
  });
  const caseQuery = useQuery<CaseReadData>({
    ...refresh,
    queryKey: caseKey,
    enabled: ownerMatches && !!caseId,
    queryFn: async ({ signal }) => {
      const incoming = await readSnapshot({ caseId }, signal);
      const prior = queryClient.getQueryData<CaseReadData>(caseKey);
      const result = { selectedCase: incoming.selectedCase, confirmedAt: incoming.confirmedAt, handoff: null };
      const newest = retainNewest(prior, result);
      if (newest !== result || !prior || classifyFeed(prior.confirmedAt, Date.parse(newest.confirmedAt), false) !== "live") return newest;
      return { ...newest, handoff: getConfirmedHandoff(prior.selectedCase, newest.selectedCase) };
    },
  });
  const denied = deniedRead(activityQuery.error) || deniedRead(caseQuery.error);
  const queryCache = queryClient.getQueryCache();
  const activityCurrent = cache?.readDataIsCurrent(NAMESPACE, queryCache.find({ queryKey: activityKey, exact: true }));
  const caseCurrent = cache?.readDataIsCurrent(NAMESPACE, queryCache.find({ queryKey: caseKey, exact: true }));
  const snapshot = !denied && ownerMatches && activityCurrent ? activityQuery.data : null;
  const caseData = !denied && ownerMatches && caseCurrent ? caseQuery.data : null;
  const choices = denied || !ownerMatches ? [] : snapshot?.choices ?? (seedAllowed ? initial.choices : []);
  const feed = classifyFeed(snapshot?.confirmedAt ?? null, now, activityQuery.isError);
  const branches = choices.find(choice => choice.id === companyId)?.branches ?? [];
  const selectedCase = caseData?.selectedCase?.id === caseId ? caseData.selectedCase : null;
  const caseReference = selectedCase?.dmsNumber ?? selection?.title ?? null;
  const activeAgent = selectedCase?.stage ?? agent;
  const lane = AGENTS.find(item => item.key === activeAgent)!;
  const states = snapshot ? agentStates(snapshot) : {};
  const moduleAgents = agentsInModule(module, AGENTS);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  function clearScopeSelection() {
    setSelection(null);
    setOutcome(null);
    setOffset(0);
    setTab("activity");
  }

  function selectCase(item: Pick<AgentCenterSnapshot["cases"][number], "id" | "title">) {
    setSelection({ id: item.id, title: item.title });
    setTab("case");
  }

  function selectOutcome(value: Outcome | null) {
    setOutcome(value === outcome ? null : value);
    setOffset(0);
    setTab("activity");
  }

  return <div className="agent-center">
    <header className="ac-titlebar">
      <h1>AI Agent Center</h1>
      <div className="ac-scope-controls">
        <span className="ac-live" data-state={feed}>
          {{ live: "Live", loading: "Loading", delayed: "Delayed", stale: "Stale" }[feed]}
        </span>
        {snapshot && <span>Updated <time dateTime={snapshot.confirmedAt}>{dubaiTime(snapshot.confirmedAt)} GST</time></span>}
        {choices.length > 0 && <>
          <select className="ac-select" aria-label="Company" value={companyId} onChange={event => {
            setCompanyId(Number(event.target.value));
            setBranchId(null);
            clearScopeSelection();
          }}>
            {choices.map(choice => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
          </select>
          <select className="ac-select" aria-label="Branch" value={branchId ?? ""} onChange={event => {
            setBranchId(event.target.value ? Number(event.target.value) : null);
            clearScopeSelection();
          }}>
            <option value="">All branches</option>
            {branches.map(branch => <option key={branch.id} value={branch.id}>{branch.label}</option>)}
          </select>
        </>}
      </div>
    </header>
    <div className="ac-toolbar">
      <div className="ac-tabs" role="group" aria-label="Module">
        {MODULES.map(item => <button key={item.id} type="button" aria-pressed={module === item.id}
          disabled={item.id !== "all" && !registeredModules().includes(item.id)}
          onClick={() => setModule(item.id)}>{item.label}</button>)}
      </div>
      <form className="ac-search" role="search" onSubmit={event => {
        event.preventDefault();
        setSearch(searchInput.trim());
        setOutcome(null);
        setOffset(0);
        setTab("activity");
      }}>
        <button type="submit" aria-label="Search for a case"><Search size={17} aria-hidden="true" /></button>
        <input aria-label="Find a case" placeholder="Find a case" maxLength={200} value={searchInput}
          onChange={event => setSearchInput(event.target.value)} />
      </form>
    </div>
    {snapshot && moduleAgents.length > 0 ? <>
      <div className="ac-totals" aria-label="Today's results">
        <strong>Today</strong>
        {outcomes.map(item => <button key={item.id} type="button" data-outcome={item.id} aria-pressed={outcome === item.id}
          disabled={snapshot.totals[item.id] === null} onClick={() => selectOutcome(item.id)}>
          <strong>{snapshot.totals[item.id] ?? "—"}</strong> {item.label}
        </button>)}
      </div>
      <div className="ac-grid">
        <div className="ac-workflow-column">
          <AgentCenterWorkflow states={states} selectedAgent={activeAgent} measurement={snapshot.intakeProgress}
            selectedCase={selectedCase ? { ...selectedCase, title: caseReference ?? "Selected case" } : null}
            handoff={caseData?.handoff ?? null} onSelect={key => {
              setAgent(key);
              if (key !== selectedCase?.stage) {
                setSelection(null);
                setTab("activity");
              }
            }} onSelectCase={() => setTab("case")} />
          <AgentCenterControls key={`${companyId}:${branchId}:${lane.id}`} lane={lane} companyId={companyId}
            branchId={branchId} scopeLabel={`${snapshot.scope.company} · ${snapshot.scope.branch}`}
            runtimeLabel={states[lane.key]?.label ?? "Status unavailable"} canInspect={canInspectControls} />
        </div>
        <AgentCenterInspector snapshot={{ ...snapshot, selectedCase }} caseReference={caseReference} tab={tab} onTab={setTab}
          caseLoading={!!caseId && caseQuery.isPending}
          onRetryCase={caseQuery.isError ? () => void caseQuery.refetch() : undefined}
          listLabel={outcomes.find(item => item.id === outcome)?.label ?? (search ? "Search results" : "Recent cases")}
          onSelect={selectCase} filtered={!!search || !!outcome} offset={offset} onClearList={() => {
            setSearch(""); setSearchInput(""); selectOutcome(null);
          }}
          onPrevious={() => setOffset(value => Math.max(0, value - 50))}
          onMore={() => setOffset(value => Math.min(5000, value + 50))} />
      </div>
    </> : <section className="ac-status" aria-live="polite">
      <p>{denied || !ownerMatches ? "Your access to this scope could not be verified." : activityQuery.isError
        ? "Agent Center records are unavailable." : "Loading authorized activity…"}</p>
      {denied || !ownerMatches ? <button type="button" onClick={() => window.location.reload()}>Reload authorized scopes</button>
        : activityQuery.isError && <button type="button" onClick={() => void activityQuery.refetch()}>Retry</button>}
    </section>}
  </div>;
}
