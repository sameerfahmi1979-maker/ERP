/** DocumentMetadata — key-value metadata grid */
import React from "react";
interface MetaItem { label: string; value: string | null | undefined; labelAr?: string; }
interface DocumentMetadataProps { items: MetaItem[]; columns?: number; }
export function DocumentMetadata({ items, columns = 3 }: DocumentMetadataProps) {
  return (
    <div className="doc-metadata" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {items.map((item, i) => (
        <div key={i} className="doc-metadata-item">
          <label>{item.label}{item.labelAr && <span lang="ar" dir="rtl" style={{ fontFamily: "'Noto Sans Arabic', Arial, sans-serif" }}> / {item.labelAr}</span>}</label>
          <span>{item.value ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}
