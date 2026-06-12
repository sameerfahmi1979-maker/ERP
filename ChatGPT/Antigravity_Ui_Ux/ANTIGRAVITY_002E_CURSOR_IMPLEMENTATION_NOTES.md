# ANTIGRAVITY_002E_CURSOR_IMPLEMENTATION_NOTES — Implementation Guide

This document guides subsequent developer operations to integrate these polished components across new modules (e.g. HR, Fleet, Workshop).

---

## 1. Step-by-Step Feature Migration Plan

When migrating an existing center-modal dialog to the right-side theme-aware drawer format:

1. **Import Component Shell**: Remove imports targeting `@/components/ui/dialog` and replace them with:
   ```typescript
   import { 
     ERPDrawerForm, 
     ERPDrawerSectionNav, 
     ERPDrawerBody, 
     ERPDrawerSection, 
     ERPFieldGrid, 
     ERPDrawerFooter 
   } from "@/components/erp/erp-drawer-form";
   ```
2. **Form Layout Mapping**: Wrap the child element inside a standard `<form id={formId} onSubmit={handleSubmit} className="flex flex-1 overflow-hidden h-full">`.
3. **Sidebar Sections definition**: Define a constant array of sections (with unique ID, label, and lucide-react icon classes).
4. **Anchor bindings**: Setup the local active section state (`const [activeSection, setActiveSection] = useState("basic")`) and bind it to the `<ERPDrawerSectionNav>` and `<ERPDrawerSection>` components.
5. **Clean Input tags**: Ensure that no custom inputs hardcode dark backgrounds (`bg-zinc-900`, etc.). Rely on standard styling classes to inherit light/dark modes correctly.

---

## 2. Visual Checklists & Verification Tasks

Ensure compliance by reviewing:
- [ ] **Adaptive theme transitions**: Verify that switching system theme toggles correctly changes drawer background from white (`#ffffff`) to deep oklch dark themes.
- [ ] **Sticky Headers & Footers boundaries**: Ensure headers and footers remain fixed at drawer edges while section fields scroll.
- [ ] **Sidebar Intersection Highlight**: Verify that clicking a side section navigation tag instantly switches the visible grid details without layout jumps.
- [ ] **Asynchronous Actions dropdown**: Ensure the print and PDF options render correctly without breaking dropdown focus.
