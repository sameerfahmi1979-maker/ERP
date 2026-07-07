"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";
import type { DmsDocumentsByDay } from "@/server/actions/dms/dashboard";

type Props = {
  data: DmsDocumentsByDay[];
  rangeDays: 7 | 30 | 90;
};

export function DmsDocumentsOverTimeChart({ data, rangeDays }: Props) {
  const tickFormat = rangeDays <= 7 ? "dd MMM" : rangeDays <= 30 ? "dd MMM" : "dd MMM";
  const maxTicks = rangeDays <= 7 ? 7 : rangeDays <= 30 ? 10 : 12;

  const formatted = data.map((d) => ({
    ...d,
    label: format(parseISO(d.date), tickFormat),
  }));

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={formatted} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="docsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            interval={Math.floor(formatted.length / maxTicks) || 0}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={28}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: 12,
            }}
            itemStyle={{ color: "hsl(var(--foreground))" }}
            labelStyle={{ fontWeight: 600 }}
            formatter={(v) => [typeof v === "number" ? v : 0, "Documents"]}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            fill="url(#docsGradient)"
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
