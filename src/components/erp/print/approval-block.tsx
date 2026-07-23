/** ApprovalBlock — approval trail entries */
import React from "react";
export interface ApprovalEntry { role: string; name?: string; action: string; date?: string; remarks?: string; }
interface ApprovalBlockProps { entries: ApprovalEntry[]; title?: string; }
export function ApprovalBlock({ entries, title = "Approval History" }: ApprovalBlockProps) {
  return (
    <div className="avoid-page-break" style={{ margin: "4mm 0", fontSize: "8.5pt" }}>
      {title && <div style={{ fontWeight: 700, marginBottom: "2mm", fontSize: "9pt", color: "#424242" }}>{title}</div>}
      <table className="print-table">
        <thead><tr><th>Role</th><th>Name</th><th>Action</th><th>Date</th><th>Remarks</th></tr></thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i}>
              <td>{e.role}</td><td>{e.name ?? "—"}</td><td>{e.action}</td><td>{e.date ?? "—"}</td><td>{e.remarks ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
