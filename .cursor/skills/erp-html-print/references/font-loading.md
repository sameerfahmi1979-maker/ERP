# Font Loading Reference

## Required Fonts for ERP Print Templates

| Purpose | Font | Source | License |
|---|---|---|---|
| Latin body text | Arial / Helvetica | System font | System |
| Latin headings | Arial Bold | System font | System |
| Arabic body text | Noto Sans Arabic | Google Fonts | OFL (free) |
| Arabic headings | Noto Sans Arabic Bold | Google Fonts | OFL (free) |
| Formal/certificate | Amiri | Google Fonts | OFL (free) |

## Loading Strategy

### Option 1: Google Fonts CDN (development / non-sensitive)

```css
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700&display=swap');
```

Gotenberg: use `--chromium-allow-list="https://fonts.googleapis.com,https://fonts.gstatic.com"` to allow font loading.

### Option 2: Self-hosted (production / air-gapped)

1. Download `.woff2` files for Noto Sans Arabic and Amiri.
2. Upload to `erp-branding-assets` Supabase Storage (private).
3. Reference via signed URL in `@font-face` CSS.
4. Gotenberg fetches via `--chromium-allow-list` or inline Base64.

### Option 3: Base64 inline (offline / maximum reliability)

```css
@font-face {
  font-family: 'Noto Sans Arabic';
  font-style: normal;
  font-weight: 400;
  src: url('data:font/woff2;base64,<BASE64>') format('woff2');
}
```

Use `src/lib/pdf/fonts.ts` to load the base64 font string from the file system at build time.

## Waiting for Fonts in Gotenberg

Gotenberg uses `waitForExpression` to ensure fonts are loaded before PDF capture:

```
document.fonts.ready
```

Always pass this via the Gotenberg API's `waitForExpression` parameter.
