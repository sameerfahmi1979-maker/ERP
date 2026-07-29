"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { DmsByCategory } from "@/server/actions/dms/dashboard";

// Curated categorical palette — the theme's --chart-N tokens are grayscale, which
// makes adjacent bars hard to tell apart, so we use distinct, tasteful hues instead.
const BAR_COLORS = [
  "hsl(217 91% 60%)", // blue
  "hsl(262 60% 63%)", // violet
  "hsl(152 60% 42%)", // emerald
  "hsl(38 92% 50%)", // amber
  "hsl(340 75% 58%)", // rose
  "hsl(190 70% 45%)", // cyan
  "hsl(25 95% 53%)", // orange
  "hsl(215 16% 55%)", // slate
];

type Props = {
  data: DmsByCategory[];
};

export function DmsCategoryBarChart({ data }: Props) {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 32, left: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            width={90}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              fontSize: 12,
            }}
            itemStyle={{ color: "var(--foreground)" }}
            labelStyle={{ fontWeight: 600 }}
            formatter={(v) => [typeof v === "number" ? v : 0, "Documents"]}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18}>
            {data.map((_, i) => (
              <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
