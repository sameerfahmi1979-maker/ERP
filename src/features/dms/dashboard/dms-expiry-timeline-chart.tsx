"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import type { DmsExpiryBucket } from "@/server/actions/dms/dashboard";

const EXPIRY_COLORS = [
  "hsl(0 72% 55%)",    // ≤7d — red
  "hsl(25 95% 53%)",   // 8–14d — orange
  "hsl(38 92% 50%)",   // 15–30d — amber
  "hsl(84 70% 45%)",   // 31–60d — yellow-green
  "hsl(142 70% 45%)",  // 61–90d — green
];

type Props = {
  data: DmsExpiryBucket[];
};

export function DmsExpiryTimelineChart({ data }: Props) {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
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
          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {data.map((_, i) => (
              <Cell key={i} fill={EXPIRY_COLORS[i % EXPIRY_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
