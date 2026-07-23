/** ArabicText — RTL Arabic paragraph */
import React from "react";
interface ArabicTextProps { children: React.ReactNode; style?: React.CSSProperties; className?: string; }
export function ArabicText({ children, style, className }: ArabicTextProps) {
  return (
    <div lang="ar" dir="rtl" className={["text-ar", className].filter(Boolean).join(" ")} style={style}>
      {children}
    </div>
  );
}
