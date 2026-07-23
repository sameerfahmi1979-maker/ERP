# Renderer Decision Matrix

| Document Type | Renderer | Why |
|---|---|---|
| Invoice / Quotation | Gotenberg | Branding, RTL, layout complexity |
| Purchase Order | Gotenberg | Branding, RTL, layout complexity |
| HR Employment Letter | Gotenberg | Letterhead, signature, Arabic |
| Salary Certificate | Gotenberg | Official, requires PDF history |
| NOC Letter | Gotenberg | Official, QR verification |
| Employee Profile Export | Gotenberg | Multi-section, photos |
| DMS Document Export | Gotenberg | Branding, multiple pages |
| Long-Form Report | Gotenberg + Paged.js | Pagination, TOC, footnotes |
| ID Card / Certificate | Gotenberg + pdfme | Fixed-position overlays |
| Simple data grid export | jsPDF + autoTable | No branding needed, fast, client-side |
| Arabic data grid export | html2canvas → jsPDF | Arabic font rendering requirement |
| Immediate browser print | window.print() | No storage, instant feedback |
| PDF merge / stamp | pdf-lib | Post-processing step |
| PDF/A compliance | Gotenberg + veraPDF | Archival requirement |
