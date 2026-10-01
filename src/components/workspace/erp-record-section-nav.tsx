"use client";

/**
 * ERP GLOBAL UI.4C — ERPRecordSectionNav
 *
 * Full-page version of ERPDrawerSectionNav.
 * Desktop: vertical left sidebar, 240px wide.
 * Mobile/tablet (< lg): horizontal scroll bar at top.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Clock, Info } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IconType = React.ComponentType<any> | React.ReactElement | null | undefined;

/** Render an icon that may be a Lucide forwardRef component OR an already-rendered ReactElement. */
function renderIcon(icon: IconType, className = "h-3.5 w-3.5"): React.ReactNode {
  if (!icon) return null;
  // Already a React element (e.g. <Building2 className="..." />) — render as-is
  if (React.isValidElement(icon)) return icon;
  // Component constructor or forwardRef object — use createElement
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return React.createElement(icon as React.ComponentType<any>, { className });
}

export type ERPRecordSection = {
  id: string;
  label: string;
  description?: string;
  /** Lucide icon component (forwardRef) or rendered ReactElement for the section tab */
  icon?: IconType;
  /** Optional badge count / label shown on section tab */
  badge?: string | number;
  disabled?: boolean;
};

export type ERPRecordAuditInfo = {
  createdBy?: string;
  updatedBy?: string;
  updatedAt?: string;
};

export interface ERPRecordSectionNavProps {
  sections: ERPRecordSection[];
  activeSection: string;
  onSectionChange: (id: string) => void;
  auditInfo?: ERPRecordAuditInfo;
  /** Additional class for the desktop nav container */
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ERPRecordSectionNav({
  sections,
  activeSection,
  onSectionChange,
  auditInfo,
  className,
}: ERPRecordSectionNavProps) {
  const mobileNav = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const nav = mobileNav.current;
    const selected = nav?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!nav || !selected || !nav.clientWidth) return;
    // Scroll only this section strip, never the form/body return position.
    const parent = nav.getBoundingClientRect(), child = selected.getBoundingClientRect();
    if (child.left < parent.left) nav.scrollLeft += child.left - parent.left;
    else if (child.right > parent.right) nav.scrollLeft += child.right - parent.right;
  }, [activeSection]);
  return (
    <>
      {/* ── Desktop: vertical left sidebar ── */}
      <div
        className={cn(
          "hidden lg:flex flex-col w-[204px] shrink-0 border-r border-border bg-muted/30 h-full",
          className
        )}
      >
        <div className="flex-1 p-4 overflow-y-auto space-y-1">
          <div className="text-xs font-bold text-muted-foreground/80 tracking-wider uppercase px-2.5 mb-2">
            Sections
          </div>

          {sections.map((section) => (
            <SectionButton
              key={section.id}
              section={section}
              isActive={activeSection === section.id}
              onSectionChange={onSectionChange}
            />
          ))}
        </div>

        {auditInfo && <AuditBlock auditInfo={auditInfo} />}
      </div>

      {/* ── Mobile/tablet: horizontal scroll bar ── */}
      <div
        ref={mobileNav}
        className={cn(
          "lg:hidden flex shrink-0 border-b border-border bg-muted/30 overflow-x-auto",
          "scrollbar-none px-3 py-1.5 gap-1"
        )}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            aria-current={activeSection === section.id ? "true" : undefined}
            disabled={section.disabled}
            onClick={() => !section.disabled && onSectionChange(section.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 min-h-11 rounded-sm text-sm font-medium whitespace-nowrap transition-all",
              "focus:outline-none focus:ring-1 focus:ring-ring shrink-0",
              activeSection === section.id
                ? "bg-primary/10 text-primary border-b-2 border-primary"
                : section.disabled
                ? "text-muted-foreground/40 cursor-not-allowed"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
            )}
          >
            {renderIcon(section.icon)}
            <span>{section.label}</span>
            {section.badge !== undefined && (
              <Badge
                variant="secondary"
                className={cn(
                  "text-xs h-4 min-w-[1rem] px-1 py-0 font-medium",
                  activeSection === section.id
                    ? "bg-muted text-foreground border-border"
                    : ""
                )}
              >
                {section.badge}
              </Badge>
            )}
          </button>
        ))}
      </div>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionButton({
  section,
  isActive,
  onSectionChange,
}: {
  section: ERPRecordSection;
  isActive: boolean;
  onSectionChange: (id: string) => void;
}) {
  return (
    <button
      type="button"
      aria-current={isActive ? "true" : undefined}
      disabled={section.disabled}
      onClick={() => !section.disabled && onSectionChange(section.id)}
      title={section.description}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-sm transition-all text-left font-medium",
        "focus:outline-none focus:ring-1 focus:ring-ring",
        isActive
          ? "bg-primary/10 text-primary font-semibold border-l-2 border-primary"
          : section.disabled
          ? "text-muted-foreground/40 cursor-not-allowed"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
      )}
    >
      <span className="shrink-0 w-3.5 h-3.5 flex items-center justify-center">
        {renderIcon(section.icon)}
      </span>

      {/* Label */}
      <span className="flex-1 truncate">{section.label}</span>

      {/* Badge */}
      {section.badge !== undefined && (
        <Badge
          variant="secondary"
          className={cn(
            "text-xs h-4 min-w-[1rem] px-1 py-0 font-medium shrink-0",
            isActive ? "bg-muted text-foreground border-border" : ""
          )}
        >
          {section.badge}
        </Badge>
      )}
    </button>
  );
}

function AuditBlock({ auditInfo }: { auditInfo: ERPRecordAuditInfo }) {
  return (
    <div className="border-t border-border p-4 space-y-2">
      <div className="text-xs font-bold text-muted-foreground/80 tracking-wider uppercase mb-1">
        Audit
      </div>
      {auditInfo.updatedAt && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3 shrink-0" />
          <span className="truncate">Saved {auditInfo.updatedAt}</span>
        </div>
      )}
      {auditInfo.updatedBy && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3 w-3 shrink-0" />
          <span className="truncate">By {auditInfo.updatedBy}</span>
        </div>
      )}
    </div>
  );
}
