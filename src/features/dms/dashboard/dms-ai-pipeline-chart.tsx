"use client";
import {BarChart,Bar,Cell,XAxis,YAxis,Tooltip,ResponsiveContainer} from "recharts";
import type {DmsAiPipelineSlice} from "@/lib/reads/dms-dashboard-schema";
const STATUS_COLORS:Record<string,string>={ai_complete:"hsl(152 60% 42%)",ocr_done:"hsl(217 91% 60%)",pending_review:"hsl(38 92% 50%)",ocr_pending:"hsl(25 95% 53%)"};
/** Independent original predicates overlap: a pie/remainder would imply a
 * partition that the data does not have. Keep the existing card and palette. */
export function DmsAiPipelineChart({data}:{data:DmsAiPipelineSlice[]}){
  return <div className="h-48"><ResponsiveContainer width="100%" height="100%">
    <BarChart data={data} layout="vertical" margin={{top:4,right:12,left:4,bottom:0}}>
      <XAxis type="number" allowDecimals={false} tick={{fontSize:11,fill:"var(--muted-foreground)"}}/>
      <YAxis type="category" dataKey="label" width={135} tick={{fontSize:11,fill:"var(--muted-foreground)"}}/>
      <Tooltip contentStyle={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:"8px",fontSize:12}} formatter={v=>[typeof v==="number"?v.toLocaleString():String(v??""),"Documents"]}/>
      <Bar dataKey="count" radius={[0,4,4,0]} maxBarSize={20} isAnimationActive={false}>{data.map(r=><Cell key={r.status} fill={STATUS_COLORS[r.status]} stroke="transparent"/>)}</Bar>
    </BarChart>
  </ResponsiveContainer></div>;
}
