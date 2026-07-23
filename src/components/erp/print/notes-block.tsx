/** NotesBlock — document notes/remarks section */
import React from "react";
interface NotesBlockProps { title?: string; titleAr?: string; notes: string; notesAr?: string; }
export function NotesBlock({ title = "Notes", titleAr, notes, notesAr }: NotesBlockProps) {
  return (
    <div style={{ margin: "4mm 0", fontSize: "9pt" }}>
      <div style={{ fontWeight: 700, marginBottom: "1mm", fontSize: "9pt", color: "#424242" }}>
        {title}{titleAr && <span lang="ar" dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', Arial, sans-serif" }}> / {titleAr}</span>}
      </div>
      <div style={{ color: "#616161", whiteSpace: "pre-line" }}>{notes}</div>
      {notesAr && <div lang="ar" dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', Arial, sans-serif", color: "#616161", marginTop: "1mm", textAlign: "right" }}>{notesAr}</div>}
    </div>
  );
}
