# ANTIGRAVITY_002E_LIGHT_THEME_DRAWER_SPEC — Light Theme Drawer Specification

This specification documents the token mapping and values required to support polished light-mode sheets in the ERP:

---

## 1. Token Value Mappings

| UI Attribute | Light Mode Setting (Default) | Dark Mode Setting (Adaptive) | Tailwind Enforcer Class |
| :--- | :--- | :--- | :--- |
| **Overlay Backdrop** | Neutral translucent gray (`oklch(0 0 0 / 0.1)`) | Soft dark blur (`oklch(0 0 0 / 0.3)`) | `bg-black/10 transition-opacity supports-backdrop-filter:backdrop-blur-xs` |
| **Drawer Body Canvas** | Pure White (`#ffffff`) | Dark Charcoal (`#141417`) | `bg-background` |
| **Headers & Cards** | Clean Off-White / Card (`#fafafa`) | Deep Grey (`#1a1a1f`) | `bg-card` |
| **Navigation Sidebar** | Very light neutral (`#f8fafc`) | Dark Tinted (`#0f0f12`) | `bg-muted/30` |
| **Input Fields & Dropdowns**| White with subtle borders (`#ffffff`) | Deep Input backgrounds (`#1b1b22`) | `bg-background border-input` |
| **Primary Borders** | Subtle light line (`oklch(0.922 0 0)`) | Subtle dark line (`oklch(1 0 0 / 10%)`) | `border-border` |
| **Focus Rings** | professional Accent Blue | Professional Violet | `focus-visible:ring-ring` |

---

## 2. Accessibility & Typography Contrast
- **Typography Font**: Mapped to standard system sans-serif (`font-sans` referencing Inter variable).
- **Text Color**:
  - English & Arabic Labels: High-contrast Dark Slate (`text-foreground`) in light mode, adaptive Off-White in dark mode.
  - Secondary Metadata (e.g. Subtitles, saved indicators): Soft Muted Grey (`text-muted-foreground`).
- **Focus Rings**: Input focus outlines use standard `@apply ring-ring/50` variables to avoid color clashing.
- **Escape Key**: radix sheet controllers capture keyboard esc events to dismiss sliding views gracefully without losing unsaved fields (user is warned if form is modified).

---
*Refer to the light mode mockup profiles in the [Audit Report](file:///c:/dev/agt-erp/ANTIGRAVITY_002E_DRAWER_UIUX_POLISH_REPORT.md) to inspect the color palette.*
