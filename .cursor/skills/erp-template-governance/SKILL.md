# ERP Template Governance Skill

## Purpose
Use this skill when creating, versioning, approving, retiring, or auditing ERP print templates.

## When To Use
- "Create a new PDF template for [document type]"
- "Update the invoice template"
- "Retire the old HR letter template"
- "Why is the template not generating PDFs?"
- "Who approved this template?"

## Template Lifecycle

```
draft → in_review → approved → published
                 ↑          ↓
              rejected    retired
```

- **Only `approved` or `published` templates** may generate external PDFs.
- **`draft`/`rejected`** templates can be previewed in the designer but cannot generate official PDFs.
- **Editing a `published` template** creates a new `draft` version — the old published version remains active until the new version is approved.
- **Retiring** a template archives it — historical PDFs generated with that template remain accessible.

## Template Registry Fields

See `src/lib/pdf/types.ts` `PdfTemplateRegistration` type.

Minimum required fields:
- `template_key` — unique string identifier (e.g., `hr-employment-letter-en`)
- `template_name` — human-readable name
- `module` — e.g., `HR`, `FINANCE`, `DMS`
- `document_type` — e.g., `employment_letter`, `invoice`
- `renderer` — `gotenberg` | `jspdf` | `print`
- `locale` — `en` | `ar` | `en-ar`
- `direction` — `ltr` | `rtl` | `auto`
- `governance_status` — `draft` | `in_review` | `approved` | `published` | `retired`

## Template Versioning Rules

1. Do NOT edit a template in-place after it has been `approved` or `published`.
2. Create a new version via `createTemplateDraftVersion()` — increments `version_no`.
3. The new version starts in `draft` status.
4. The previous version remains active until the new one is approved and published.
5. All `erp_generated_pdf_documents` rows retain `template_id` + `template_version` for historical accuracy.

## References
- `references/branding-rules.md`
- `references/template-versioning.md`
- `references/output-center-architecture.md`
