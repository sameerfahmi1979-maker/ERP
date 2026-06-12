# ANTIGRAVITY_PROMPT_002E_DRAWER_UIUX_POLISH — Polish Enterprise Right-Side Drawer Forms

## 0. Required Antigravity Persona

Act as a senior enterprise ERP UI/UX director, shadcn/ui design-system engineer, Next.js App Router frontend architect, accessibility reviewer, and visual QA specialist.

You are polishing an existing ERP drawer form prototype/design created in Antigravity.

This is UI/UX polishing only.

Do not change backend logic.

Do not change database.

Do not change Supabase Auth.

Do not change RLS.

Do not change server actions.

Do not implement business modules.

Do not replace the ERP app.

---

## 1. Current Good Result

The current right-side drawer concept is approved.

Good points:

- Drawer slides from right side.
- Drawer covers about 80% of screen.
- Background app remains visible and blurred/dimmed.
- Left internal section navigation is good.
- Header/title area is good.
- Sticky footer actions are good.
- The form is much better than the previous small center modal.

Keep this structure.

---

## 2. Main Issue to Fix

The current drawer opens in **black/dark mode**.

The user wants a more polished enterprise ERP UI.

Required direction:

- Default drawer should be **light mode / white enterprise style**.
- Dark mode can still be supported, but should not be forced.
- The drawer should follow the app theme.
- If the app is in light mode, drawer must be light.
- If the app is in dark mode, drawer can use polished dark mode.

Do not force black background.

---

## 3. Visual Target

Create a cleaner enterprise style similar to:

- Atoms-style ERP admin
- Microsoft Dynamics
- Zoho One
- Odoo Enterprise
- SAP Fiori clarity
- Oracle NetSuite seriousness

Avoid:

- full black drawer as default
- overly dark background
- weak contrast
- cramped fields
- childish gradients
- default unpolished shadcn look
- overlarge controls
- too much empty space

---

## 4. Light Theme Drawer Requirements

Default light drawer should use:

```text
Drawer background: #ffffff or near-white
Page overlay: soft blur / neutral translucent gray
Header background: white
Section nav background: very light gray / neutral
Body background: white or subtle #f8fafc
Field background: white
Border: subtle neutral border
Primary color: professional blue / existing app accent
Text: high contrast dark gray
Muted text: soft gray
```

The drawer should look premium, clean, and enterprise-grade.

---

## 5. Drawer Layout Polish

Keep the 80% drawer width but improve:

- Header spacing
- Internal section nav width
- Active section style
- Form field spacing
- Section title style
- Footer action spacing
- Divider lines
- Button hierarchy
- Scroll behavior
- Empty area balance

Recommended layout:

```text
Drawer width: 80vw
Max width: 1480px
Min width: 960px
Height: 100vh
Header height: 72px to 88px
Section nav width: 220px to 260px
Footer height: 72px to 84px
```

---

## 6. Header Polish

Drawer header should include:

- Title: Create Organization Profile
- Subtitle: Register a new legal corporate company
- Mode badge: Add / Edit / View
- Optional status badge: Draft / Active
- Actions menu
- Close button

Header style:

- Light background
- Border bottom
- Clean title hierarchy
- Optional compact metadata
- No heavy black header unless dark mode is active

---

## 7. Left Section Navigation Polish

The section nav should look enterprise-grade.

Requirements:

- Light neutral background
- Small uppercase label: FORM SECTIONS
- Icons aligned
- Active item with soft blue background
- Active item strong text
- Non-active item subtle text
- Hover state
- Completed section indicator optional
- Error indicator per section optional

For example:

```text
FORM SECTIONS
[Basic Info] active
[Address & Contact]
[Legal & Licensing]
[Tax & Compliance]
[Internal Notes]
```

---

## 8. Form Body Polish

Improve form body:

- Section header should be clear:
  - BASIC IDENTIFICATION
  - ADDRESS & CONTACT
  - LEGAL & LICENSING
  - TAX & COMPLIANCE
- Use a thin divider after section header.
- Use 2-column or 3-column grid depending field size.
- Required fields clearly marked.
- Labels should be compact but readable.
- Inputs should be consistent height.
- Help text under complex fields where needed.

Recommended:

```text
2 columns for normal fields
3 columns only for short fields
Full width for notes/address/remarks
```

---

## 9. Footer Polish

Sticky footer should be light and professional.

Include:

Left side:

- Unsaved changes indicator
- Draft status if relevant
- Last saved timestamp placeholder if relevant

Right side:

- Cancel
- Save as Draft
- Save & Close
- Create / Update / Submit

Button style:

- Primary button clear and professional
- Secondary buttons subtle
- Cancel not too dominant

---

## 10. Draft Workflow Visual Polish

Add visual design for:

- Draft badge
- Draft warning banner
- Save as Draft button
- Submit Final button
- Validation summary if required fields missing
- Resume Draft indicator

Design only, do not implement backend draft logic unless explicitly approved later.

---

## 11. Export / Email Actions Polish

The drawer actions menu should include polished UI for:

- Print
- Download PDF
- Download Excel
- Download CSV
- Send by Email

Design a clean actions dropdown in the drawer header.

Add a visual-only email send dialog/drawer prototype if practical:

- To
- CC
- Subject
- Message
- Attachment type
- Letterhead selector
- Send button

Do not implement email backend.

---

## 12. Letterhead Selector UX Polish

Add visual design for letterhead selection in export/email flow.

Must support:

- Alliance Gulf Transport & Construction L.L.C
- Alliance Scrap Trading L.L.C
- future companies

Show:

- company logo placeholder
- company address preview
- TRN/license preview
- selected letterhead badge

Design only.

---

## 13. Theme-Aware Requirement

The drawer must support both light and dark modes.

But:

- Default in current app light mode must be light.
- Do not hardcode black background.
- Use Tailwind theme tokens or CSS variables.
- Use classes like:
  - `bg-background`
  - `text-foreground`
  - `border-border`
  - `bg-muted`
  - `text-muted-foreground`
- Use `dark:` variants only for dark theme.

Do not create a design that is dark-only.

---

## 14. Accessibility Requirements

Improve:

- focus ring visibility
- keyboard navigation
- ESC to close
- clear close button
- label associations
- contrast ratio
- readable text size
- scrollable body with sticky header/footer

---

## 15. Deliverables

Create/update the UI/UX planning/prototype outputs:

```text
ANTIGRAVITY_002E_DRAWER_UIUX_POLISH_REPORT.md
ANTIGRAVITY_002E_LIGHT_THEME_DRAWER_SPEC.md
ANTIGRAVITY_002E_DRAWER_COMPONENT_BLUEPRINT.md
ANTIGRAVITY_002E_CURSOR_IMPLEMENTATION_NOTES.md
```

If creating prototypes, place them safely in:

```text
uiux_prototypes/002E/
```

Do not wire prototypes into live backend.

---

## 16. Required Screenshot Outputs

If possible, create screenshots of:

```text
drawer_light_mode_organization.png
drawer_light_mode_branch.png
drawer_dark_mode_optional.png
drawer_export_email_menu.png
drawer_letterhead_selector.png
```

---

## 17. Final Instruction

Polish the existing Antigravity drawer design.

Keep the right-side 80% drawer concept.

Make it theme-aware and light-mode enterprise by default.

Do not touch backend/database/auth/RLS.

Stop after UI/UX reports and optional prototypes.
