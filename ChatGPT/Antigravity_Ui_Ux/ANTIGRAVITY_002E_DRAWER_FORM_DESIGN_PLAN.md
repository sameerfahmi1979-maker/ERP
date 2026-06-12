# ANTIGRAVITY_002E_DRAWER_FORM_DESIGN_PLAN — Enterprise Drawer Forms

This document specifies the technical design, architectural guidelines, and component hierarchy for right-side drawer forms in the ERP application.

---

## 1. Responsive Size Benchmarks

The sliding sheet component will wrapper the existing form schemas. It must scale fluidly across desktop, tablet, and mobile views:

| Viewport Device | Width Setting | Scrolling Behavior | Layout Pattern |
| :--- | :--- | :--- | :--- |
| **Desktop (>= 1280px)** | `78vw` to `82vw` (Min `960px`, Max `1450px`) | Drawer container fixed. Body scrolls internally. | 2-column sidebar layout (Nav left, fields right). |
| **Tablet (768px - 1024px)** | `90vw` to `95vw` | Body scrolls internally. Header/Footer sticky. | Single column grid mapping. |
| **Mobile (< 768px)** | `100vw` (Full viewport) | Full viewport scrolling. Mobile navigation panel. | Stacked single-column fields. |

---

## 2. Component Architecture & Reusability

We define a modular structure in `@/components/erp/drawer-form` to encapsulate these features:

### A. Component Hierarchy

```text
ERPDrawerForm (Root Context Provider)
 ├── ERPDrawerHeader
 │    ├── Form Mode Badge (Add/Edit/View/Draft)
 │    ├── Status Indicator & Audit Summary
 │    └── Actions Dropdown (Export, Share, Print)
 ├── ERPDrawerBody
 │    ├── ERPDrawerSectionNav (Left vertical sections list)
 │    └── ERPDrawerContent
 │         ├── ERPDrawerSection (Grouped fields e.g., Legal & Tax)
 │         └── ERPFieldGrid (12-column dynamic responsive layout)
 └── ERPDrawerFooter
      ├── Unsaved Changes Indicator
      ├── Draft Action Buttons
      └── ERPValidationSummary (Collapsible panel for forms errors)
```

---

## 3. Form States & Layout Mechanics

### Sticky Layout
- **Sticky Header**: Fixed at `top-0` with a blurred backdrop (`backdrop-blur bg-background/95`) and custom border line. It must show the core record title (e.g. "Alliance Gulf Transport") and ID (e.g. "ORG-102").
- **Sticky Footer**: Fixed at `bottom-0`. It contains the main validation summaries and submit buttons.
- **Scroll Area**: The body uses a scroll area (`src/components/ui/scroll-area.tsx`) to manage internal scrolling smoothly without affecting the page shell.

### Left-Hand Navigation Panel
For forms with over 15 input fields, a vertical side navigation panel (width: `220px`) sits on the left side of the drawer body.
- Clicking an item smooth-scrolls the right-hand panel to the corresponding form section.
- Utilizes an intersection observer to highlight the active section as the user scrolls.

### Draft Status & Warning Banners
- If the current entity state is `draft` (loaded from Supabase), a warning banner appears at the very top of the scrollable form body:
  > **Draft Mode**: This record has not been finalized yet. Validation rules are relaxed until final submit.
- The footer changes primary actions to display `Save as Draft` and `Finalize & Submit`.

---

## 4. UI Code Skeleton Example

This visual component structure will be mapped to our prototype file `drawer-form-prototype.tsx` for easy import:

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ERPDrawerForm({ open, onOpenChange, title, subtitle, children }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="p-0 sm:max-w-[80vw] w-full flex flex-col h-screen max-w-[1450px] min-w-[960px]">
        {/* Sticky Header */}
        <SheetHeader className="p-6 border-b flex flex-row items-center justify-between bg-card shrink-0">
          <div>
            <SheetTitle className="text-xl font-bold">{title}</SheetTitle>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          {/* Actions & Badge Slot */}
        </SheetHeader>
        
        {/* Scrollable Body */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```
---
*Refer to the design mockups in the [Review Document](file:///C:/Users/Sameer%20Fahmi/.gemini/antigravity-ide/brain/877f08ff-e7ab-491b-9981-49c418e4cfad/uiux_planning_and_mockups.md) to inspect the final look and spacing hierarchy.*
