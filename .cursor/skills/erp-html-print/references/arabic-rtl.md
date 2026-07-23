# Arabic RTL Reference

## Required Setup

Every Arabic or bilingual document must:

1. Set `<html lang="ar" dir="rtl">` for pure Arabic documents.
2. Set `<html lang="en" dir="ltr">` for pure English documents.
3. Use `<div dir="rtl">` / `<div dir="ltr">` for inline blocks within a mixed document.

## Font Loading

Arabic text REQUIRES a font with Arabic glyph support. Approved fonts:

- **Noto Sans Arabic** — recommended (free, Google Fonts, wide glyph coverage)
- **Amiri** — classical style, good for certificates and formal letters
- **Cairo** — modern, neutral, good for business documents

Load via CSS `@font-face` from `erp-branding-assets` storage or Google Fonts CDN:

```css
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700&display=swap');

body {
  font-family: 'Noto Sans Arabic', Arial, sans-serif;
}
```

## Bidirectional Text Rules

```css
/* Auto direction for mixed content */
.bidi-auto {
  direction: auto;
  unicode-bidi: plaintext;
}

/* Force RTL section */
.rtl-block {
  direction: rtl;
  text-align: right;
}

/* Force LTR section */
.ltr-block {
  direction: ltr;
  text-align: left;
}
```

## Bilingual Layout Pattern

```tsx
<div className="bilingual-row">
  <div className="ltr-block" lang="en">{englishText}</div>
  <div className="rtl-block" lang="ar">{arabicText}</div>
</div>
```

```css
.bilingual-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8mm;
}
```

## Common Mistakes

- ❌ Using Helvetica or Times New Roman for Arabic (no glyphs → garbled output)
- ❌ Forgetting `dir="rtl"` on the Arabic container (text renders LTR incorrectly)
- ❌ Using `text-align: left` globally then expecting Arabic to right-align
- ❌ Mirroring logos and images in RTL (use `[dir=rtl] img { transform: none }`)
