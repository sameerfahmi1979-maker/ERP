/** BilingualText — side-by-side LTR (EN) + RTL (AR) text */
import React from "react";
interface BilingualTextProps { en: string; ar: string; style?: React.CSSProperties; }
export function BilingualText({ en, ar, style }: BilingualTextProps) {
  return (
    <div className="bilingual-row" style={style}>
      <div lang="en" dir="ltr">{en}</div>
      <div lang="ar" dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', Arial, sans-serif", textAlign: "right" }}>{ar}</div>
    </div>
  );
}
