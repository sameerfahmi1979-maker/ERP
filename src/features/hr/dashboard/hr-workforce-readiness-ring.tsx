"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

type Props = {
  ready: number;
  notReady: number;
  blocked: number;
  isLoading?: boolean;
  hasAccess?: boolean;
};

const COLORS = {
  ready: "hsl(152 60% 42%)",
  notReady: "hsl(38 92% 50%)",
  blocked: "hsl(0 72% 55%)",
};

export function HrWorkforceReadinessRing({ ready, notReady, blocked, isLoading, hasAccess = true }: Props) {
  const total = ready + notReady + blocked;
  const readyPct = total > 0 ? Math.round((ready / total) * 100) : null;

  const data = [
    { key: "ready", label: "Ready", value: ready, color: COLORS.ready },
    { key: "notReady", label: "Not ready", value: notReady, color: COLORS.notReady },
    { key: "blocked", label: "Blocked", value: blocked, color: COLORS.blocked },
  ].filter((d) => d.value > 0);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="px-4 pt-4 pb-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Workforce Readiness
        </p>
        <p className="text-[11px] text-muted-foreground/80">Deployable right now</p>
      </div>

      {!hasAccess ? (
        <div className="flex flex-1 items-center justify-center px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">Restricted</p>
        </div>
      ) : isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-24 w-24 rounded-full border-4 border-dashed border-muted animate-pulse" />
        </div>
      ) : total === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">No assignment data yet</p>
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-1 px-2 pb-2">
          <div className="relative h-28 w-28 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={38}
                  outerRadius={54}
                  paddingAngle={2}
                  startAngle={90}
                  endAngle={-270}
                >
                  {data.map((d) => (
                    <Cell key={d.key} fill={d.color} stroke="transparent" />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold tabular-nums leading-none">{readyPct}%</span>
              <span className="text-[9px] text-muted-foreground">ready</span>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-1.5 pr-2">
            <LegendRow color={COLORS.ready} label="Ready" value={ready} />
            <LegendRow color={COLORS.notReady} label="Not ready" value={notReady} />
            <LegendRow color={COLORS.blocked} label="Blocked" value={blocked} />
          </div>
        </div>
      )}
    </div>
  );
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span
          className={cn("h-2 w-2 rounded-full shrink-0")}
          style={{ backgroundColor: color }}
        />
        {label}
      </span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
