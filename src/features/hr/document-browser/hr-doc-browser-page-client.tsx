"use client";

/**
 * HR.DOC_BROWSER.1 — 3-column HR Employee Document Browser shell.
 *
 * Column 1 (Navigator): employees + expandable dependents (search, status filter)
 * Column 2 (Documents): unified document list for the selected entity
 * Column 3 (Preview):  inline PDF/image preview + metadata + download
 *
 * Columns 1 and 2 are resizable (D5); widths persist in localStorage.
 * Standard pattern — see .cursor/rules/erp-document-browser-standard.mdc.
 */

import { useCallback, useRef, useState, useTransition } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { toast } from "sonner";
import {
  getHrDocBrowserDocuments,
  type HrDocBrowserDocument,
  type HrDocBrowserEmployee,
} from "@/server/actions/hr/doc-browser";
import { HrDocBrowserNavigator } from "./hr-doc-browser-navigator";
import { HrDocBrowserDocList } from "./hr-doc-browser-doc-list";
import { HrDocBrowserPreview } from "./hr-doc-browser-preview";
import { HrDocBrowserResizeHandle } from "./hr-doc-browser-resize-handle";
import type { BrowserEntitySelection } from "./hr-doc-browser-types";

const WIDTHS_STORAGE_KEY = "hr-doc-browser-col-widths-v1";
const NAV_MIN = 200;
const NAV_MAX = 420;
const LIST_MIN = 260;
const LIST_MAX = 560;
const DEFAULT_WIDTHS = { nav: 280, list: 360 };

type ColumnWidths = typeof DEFAULT_WIDTHS;

interface HrDocBrowserPageClientProps {
  employees: HrDocBrowserEmployee[];
}

export function HrDocBrowserPageClient({ employees }: HrDocBrowserPageClientProps) {
  const [selection, setSelection] = useState<BrowserEntitySelection | null>(null);
  const [documents, setDocuments] = useState<HrDocBrowserDocument[]>([]);
  const [selectedDocIndex, setSelectedDocIndex] = useState<number | null>(null);
  const [isLoadingDocs, startDocsTransition] = useTransition();

  // ── Column widths (D5) ──────────────────────────────────────────────────
  // Lazy initializer reads localStorage on the client; SSR renders defaults
  // (suppressHydrationWarning on the width divs absorbs the style diff).
  const [widths, setWidths] = useState<ColumnWidths>(() => {
    if (typeof window === "undefined") return DEFAULT_WIDTHS;
    try {
      const raw = window.localStorage.getItem(WIDTHS_STORAGE_KEY);
      if (!raw) return DEFAULT_WIDTHS;
      const parsed = JSON.parse(raw) as Partial<ColumnWidths>;
      return {
        nav: clamp(Number(parsed.nav) || DEFAULT_WIDTHS.nav, NAV_MIN, NAV_MAX),
        list: clamp(Number(parsed.list) || DEFAULT_WIDTHS.list, LIST_MIN, LIST_MAX),
      };
    } catch {
      return DEFAULT_WIDTHS;
    }
  });
  const dragRef = useRef<{ col: keyof ColumnWidths; startX: number; startW: number } | null>(null);

  const startDrag = useCallback(
    (col: keyof ColumnWidths) => (e: ReactMouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragRef.current = { col, startX: e.clientX, startW: 0 };
      setWidths((current) => {
        if (dragRef.current) dragRef.current.startW = current[col];
        return current;
      });

      const onMove = (ev: MouseEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const delta = ev.clientX - drag.startX;
        const [min, max] = drag.col === "nav" ? [NAV_MIN, NAV_MAX] : [LIST_MIN, LIST_MAX];
        const w = clamp(drag.startW + delta, min, max);
        setWidths((prev) => (prev[drag.col] === w ? prev : { ...prev, [drag.col]: w }));
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.removeProperty("user-select");
        document.body.style.removeProperty("cursor");
        dragRef.current = null;
        setWidths((current) => {
          try {
            localStorage.setItem(WIDTHS_STORAGE_KEY, JSON.stringify(current));
          } catch {
            // storage unavailable — non-fatal
          }
          return current;
        });
      };

      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    []
  );

  // ── Entity selection → load documents ──────────────────────────────────
  const handleSelectEntity = useCallback((entity: BrowserEntitySelection) => {
    setSelection(entity);
    setSelectedDocIndex(null);
    setDocuments([]);
    startDocsTransition(async () => {
      const result = await getHrDocBrowserDocuments(entity.type, entity.id);
      if (result.success && result.data) {
        setDocuments(result.data);
        // Auto-select the first document so the preview is never pointlessly empty
        setSelectedDocIndex(result.data.length > 0 ? 0 : null);
      } else {
        toast.error(result.error ?? "Failed to load documents");
        setDocuments([]);
      }
    });
  }, []);

  const selectedDoc =
    selectedDocIndex != null && selectedDocIndex < documents.length
      ? documents[selectedDocIndex]
      : null;

  return (
    <div className="flex h-[calc(100vh-190px)] min-h-[480px] rounded-lg border border-border/60 bg-background overflow-hidden">
      {/* Column 1 — Navigator */}
      <div style={{ width: widths.nav }} suppressHydrationWarning className="shrink-0 h-full border-r-0">
        <HrDocBrowserNavigator
          employees={employees}
          selection={selection}
          onSelect={handleSelectEntity}
        />
      </div>

      <HrDocBrowserResizeHandle onMouseDown={startDrag("nav")} />

      {/* Column 2 — Document list */}
      <div style={{ width: widths.list }} suppressHydrationWarning className="shrink-0 h-full">
        <HrDocBrowserDocList
          entity={selection}
          documents={documents}
          isLoading={isLoadingDocs}
          selectedIndex={selectedDocIndex}
          onSelect={setSelectedDocIndex}
        />
      </div>

      <HrDocBrowserResizeHandle onMouseDown={startDrag("list")} />

      {/* Column 3 — Preview (flexible) */}
      <div className="flex-1 min-w-0 h-full">
        <HrDocBrowserPreview entity={selection} document={selectedDoc} />
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
