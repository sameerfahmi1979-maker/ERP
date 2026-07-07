"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type { DmsAiPipelineSlice } from "@/server/actions/dms/dashboard";

const STATUS_COLORS: Record<string, string> = {
  ai_complete: "hsl(var(--chart-2))",
  ocr_done: "hsl(var(--chart-1))",
  pending_review: "hsl(var(--chart-4))",
  ocr_pending: "hsl(var(--chart-3))",
  not_processed: "hsl(var(--muted-foreground))",
};

type Props = {
  data: DmsAiPipelineSlice[];
  total: number;
};

export function DmsAiPipelineChart({ data, total }: Props) {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="label"
            cx="40%"
            cy="50%"
            innerRadius={52}
            outerRadius={76}
            paddingAngle={2}
          >
            {data.map((slice, i) => (
              <Cell
                key={i}
                fill={STATUS_COLORS[slice.status] ?? "hsl(var(--muted-foreground))"}
                stroke="transparent"
              />
            ))}
          </Pie>
          <text
            x="40%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-foreground"
            style={{ fontSize: 18, fontWeight: 700 }}
          >
            {total.toLocaleString()}
          </text>
          <text
            x="40%"
            y="62%"
            textAnchor="middle"
            dominantBaseline="middle"
            style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          >
            total
          </text>
          <Tooltip
            contentStyle={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: 12,
            }}
            formatter={(v, name) => [typeof v === "number" ? v.toLocaleString() : String(v ?? ""), String(name ?? "")]}
          />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingLeft: 8 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
