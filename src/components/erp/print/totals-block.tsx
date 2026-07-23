/** TotalsBlock — subtotal / discount / VAT / grand total */
import React from "react";
export interface TotalRow { label: string; labelAr?: string; value: string; isTotal?: boolean; isBold?: boolean; }
interface TotalsBlockProps { rows: TotalRow[]; currency?: string; }
export function TotalsBlock({ rows, currency }: TotalsBlockProps) {
  return (
    <div className="totals-block avoid-page-break">
      <table>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={row.isTotal ? "total-row" : ""}>
              <td style={{ fontWeight: row.isBold || row.isTotal ? 700 : 400, color: row.isTotal ? "#212121" : "#616161" }}>
                {row.label}
                {row.labelAr && <span lang="ar" dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', Arial, sans-serif", marginRight: "2mm" }}> / {row.labelAr}</span>}
              </td>
              <td style={{ fontWeight: row.isBold || row.isTotal ? 700 : 400 }}>{row.isTotal && currency ? <strong>{currency} {row.value}</strong> : row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
