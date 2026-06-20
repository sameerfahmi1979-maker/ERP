"""
ALGT ERP — Azure Document Intelligence Manual Generator
Generates: Manuals/Azure_Document_Intelligence_Manual.pdf
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm, mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.pdfgen import canvas
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate
import datetime

# ── Color palette (ERP brand) ──────────────────────────────────────────────────
BRAND_DARK    = colors.HexColor("#0F172A")   # slate-900
BRAND_BLUE    = colors.HexColor("#1D4ED8")   # blue-700
BRAND_LIGHT   = colors.HexColor("#EFF6FF")   # blue-50
BRAND_VIOLET  = colors.HexColor("#7C3AED")   # violet-600
ACCENT_GREEN  = colors.HexColor("#15803D")   # green-700
ACCENT_AMBER  = colors.HexColor("#B45309")   # amber-700
ACCENT_RED    = colors.HexColor("#B91C1C")   # red-700
GRAY_50       = colors.HexColor("#F8FAFC")
GRAY_100      = colors.HexColor("#F1F5F9")
GRAY_200      = colors.HexColor("#E2E8F0")
GRAY_400      = colors.HexColor("#94A3B8")
GRAY_600      = colors.HexColor("#475569")
GRAY_700      = colors.HexColor("#334155")
WHITE         = colors.white

OUTPUT_PATH = r"Manuals\Azure_Document_Intelligence_Manual.pdf"

# ── Page number drawing ────────────────────────────────────────────────────────
def on_page(canvas_obj, doc):
    canvas_obj.saveState()
    w, h = A4
    # Header bar
    canvas_obj.setFillColor(BRAND_DARK)
    canvas_obj.rect(0, h - 1.5*cm, w, 1.5*cm, fill=1, stroke=0)
    canvas_obj.setFillColor(WHITE)
    canvas_obj.setFont("Helvetica-Bold", 8)
    canvas_obj.drawString(1.5*cm, h - 1.0*cm, "ALGT ERP — Azure Document Intelligence Manual")
    canvas_obj.setFont("Helvetica", 7)
    canvas_obj.setFillColor(GRAY_400)
    canvas_obj.drawRightString(w - 1.5*cm, h - 1.0*cm, f"Confidential · {datetime.date.today().strftime('%B %Y')}")
    # Footer
    canvas_obj.setFillColor(GRAY_200)
    canvas_obj.rect(0, 0, w, 1.0*cm, fill=1, stroke=0)
    canvas_obj.setFillColor(GRAY_600)
    canvas_obj.setFont("Helvetica", 7)
    if doc.page > 1:
        canvas_obj.drawCentredString(w / 2, 0.35*cm, f"Page {doc.page}")
    canvas_obj.drawString(1.5*cm, 0.35*cm, "Alliance Gulf Transport Group · Internal ERP Documentation")
    canvas_obj.restoreState()

def on_cover_page(canvas_obj, doc):
    """Cover page — no header/footer."""
    pass

# ── Styles ─────────────────────────────────────────────────────────────────────
def build_styles():
    base = getSampleStyleSheet()
    return {
        "h1": ParagraphStyle("h1", parent=base["Heading1"],
            fontSize=22, textColor=BRAND_DARK, spaceAfter=12,
            spaceBefore=20, leading=28, fontName="Helvetica-Bold"),
        "h2": ParagraphStyle("h2", parent=base["Heading2"],
            fontSize=15, textColor=BRAND_BLUE, spaceAfter=8,
            spaceBefore=16, leading=20, fontName="Helvetica-Bold",
            borderPad=4),
        "h3": ParagraphStyle("h3", parent=base["Heading3"],
            fontSize=11, textColor=BRAND_DARK, spaceAfter=6,
            spaceBefore=10, leading=15, fontName="Helvetica-Bold"),
        "body": ParagraphStyle("body", parent=base["Normal"],
            fontSize=9.5, textColor=GRAY_700, spaceAfter=6,
            leading=14, fontName="Helvetica"),
        "body_justify": ParagraphStyle("body_j", parent=base["Normal"],
            fontSize=9.5, textColor=GRAY_700, spaceAfter=6,
            leading=14, fontName="Helvetica", alignment=TA_JUSTIFY),
        "bullet": ParagraphStyle("bullet", parent=base["Normal"],
            fontSize=9.5, textColor=GRAY_700, spaceAfter=4,
            leading=13, fontName="Helvetica", leftIndent=16,
            bulletIndent=4),
        "code": ParagraphStyle("code", parent=base["Code"],
            fontSize=8, textColor=BRAND_DARK, spaceAfter=4,
            leading=12, fontName="Courier", backColor=GRAY_100,
            borderPad=6, leftIndent=8),
        "caption": ParagraphStyle("caption", parent=base["Normal"],
            fontSize=8, textColor=GRAY_400, spaceAfter=4,
            leading=11, fontName="Helvetica-Oblique", alignment=TA_CENTER),
        "note": ParagraphStyle("note", parent=base["Normal"],
            fontSize=9, textColor=ACCENT_AMBER, spaceAfter=6,
            leading=13, fontName="Helvetica", leftIndent=12),
        "success": ParagraphStyle("success", parent=base["Normal"],
            fontSize=9, textColor=ACCENT_GREEN, spaceAfter=6,
            leading=13, fontName="Helvetica", leftIndent=12),
        "warning": ParagraphStyle("warning", parent=base["Normal"],
            fontSize=9, textColor=ACCENT_RED, spaceAfter=6,
            leading=13, fontName="Helvetica", leftIndent=12),
        "toc_h1": ParagraphStyle("toc1", parent=base["Normal"],
            fontSize=10, textColor=BRAND_DARK, leading=14,
            fontName="Helvetica-Bold", leftIndent=0, spaceAfter=3),
        "toc_h2": ParagraphStyle("toc2", parent=base["Normal"],
            fontSize=9, textColor=GRAY_600, leading=13,
            fontName="Helvetica", leftIndent=14, spaceAfter=2),
    }

S = build_styles()

# ── Helper builders ────────────────────────────────────────────────────────────
def H1(text): return Paragraph(text, S["h1"])
def H2(text): return Paragraph(text, S["h2"])
def H3(text): return Paragraph(text, S["h3"])
def P(text):  return Paragraph(text, S["body"])
def PJ(text): return Paragraph(text, S["body_justify"])
def B(text):  return Paragraph(f"• &nbsp; {text}", S["bullet"])
def Code(text): return Paragraph(text.replace(" ", "&nbsp;"), S["code"])
def Note(text): return Paragraph(f"💡 &nbsp; {text}", S["note"])
def Warn(text): return Paragraph(f"⚠ &nbsp; {text}", S["warning"])
def OK(text):   return Paragraph(f"✓ &nbsp; {text}", S["success"])
def SP(n=8): return Spacer(1, n)
def HR(): return HRFlowable(width="100%", thickness=0.5, color=GRAY_200, spaceAfter=8, spaceBefore=4)

def section_header(text):
    """Blue left-border section header."""
    data = [[Paragraph(text, S["h2"])]]
    t = Table(data, colWidths=["100%"])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), BRAND_LIGHT),
        ("LEFTPADDING",   (0,0), (-1,-1), 10),
        ("TOPPADDING",    (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LINEAFTER",     (0,0), (0,-1), 4, BRAND_BLUE),  # not right, use left workaround
        ("LINEBEFORE",    (0,0), (0,-1), 4, BRAND_BLUE),
    ]))
    return t

def info_table(rows, col_widths=None):
    """Two-column key-value table."""
    if col_widths is None:
        col_widths = [5*cm, 11*cm]
    data = [[Paragraph(f"<b>{k}</b>", S["body"]), Paragraph(v, S["body"])] for k, v in rows]
    t = Table(data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (0,-1), GRAY_100),
        ("TEXTCOLOR",     (0,0), (0,-1), BRAND_DARK),
        ("FONTNAME",      (0,0), (0,-1), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,-1), 9),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("GRID",          (0,0), (-1,-1), 0.3, GRAY_200),
        ("ROWBACKGROUNDS",(0,0), (-1,-1), [WHITE, GRAY_50]),
    ]))
    return t

def model_table(rows):
    """Model comparison table with header."""
    header = [
        Paragraph("<b>Model ID</b>", S["body"]),
        Paragraph("<b>Best For</b>", S["body"]),
        Paragraph("<b>Arabic</b>", S["body"]),
        Paragraph("<b>Notes</b>", S["body"]),
    ]
    data = [header]
    for row in rows:
        data.append([Paragraph(c, S["body"]) for c in row])
    t = Table(data, colWidths=[3.8*cm, 4.5*cm, 2*cm, 5.2*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0), BRAND_DARK),
        ("TEXTCOLOR",     (0,0), (-1,0), WHITE),
        ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,-1), 8.5),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 6),
        ("GRID",          (0,0), (-1,-1), 0.3, GRAY_200),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), [WHITE, GRAY_50]),
    ]))
    return t

def checklist_table(rows):
    data = [[Paragraph("✓" if ok else "✗", ParagraphStyle("ck", fontSize=10,
             textColor=ACCENT_GREEN if ok else ACCENT_RED, fontName="Helvetica-Bold")),
             Paragraph(step, S["body"]),
             Paragraph(note, S["body"])] for (ok, step, note) in rows]
    t = Table(data, colWidths=[0.8*cm, 7*cm, 7.7*cm])
    t.setStyle(TableStyle([
        ("FONTSIZE",      (0,0), (-1,-1), 9),
        ("TOPPADDING",    (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("LEFTPADDING",   (0,0), (-1,-1), 4),
        ("GRID",          (0,0), (-1,-1), 0.3, GRAY_200),
        ("ROWBACKGROUNDS",(0,0), (-1,-1), [WHITE, GRAY_50]),
    ]))
    return t

# ══════════════════════════════════════════════════════════════════════════════
#  COVER PAGE
# ══════════════════════════════════════════════════════════════════════════════
def build_cover():
    story = []
    # Top brand block
    top = Table([[""]], colWidths=["100%"], rowHeights=[3.5*cm])
    top.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), BRAND_DARK)]))
    story.append(top)
    story.append(SP(20))

    # Azure icon row (text-based)
    icon_data = [["☁", "Azure Document Intelligence"]]
    icon_t = Table(icon_data, colWidths=[2*cm, 14*cm])
    icon_t.setStyle(TableStyle([
        ("FONTSIZE",     (0,0), (0,0), 36),
        ("TEXTCOLOR",    (0,0), (0,0), BRAND_BLUE),
        ("FONTSIZE",     (1,0), (1,0), 26),
        ("FONTNAME",     (1,0), (1,0), "Helvetica-Bold"),
        ("TEXTCOLOR",    (1,0), (1,0), BRAND_DARK),
        ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(icon_t)
    story.append(SP(6))

    story.append(Paragraph(
        "Complete Integration Manual for ALGT ERP",
        ParagraphStyle("sub", fontSize=14, textColor=GRAY_600, fontName="Helvetica",
                        spaceAfter=4, leading=18)))
    story.append(SP(2))
    story.append(HRFlowable(width="100%", thickness=2, color=BRAND_BLUE, spaceAfter=16))

    # Document info card
    meta_data = [
        ["Product", "ALGT ERP — Document Management System (DMS)"],
        ["Module", "AI Settings → Azure Document Intelligence Provider"],
        ["Version", "1.0 — DMS ARABIC FIX.1"],
        ["Date", datetime.date.today().strftime("%d %B %Y")],
        ["Classification", "Internal — ERP Administration"],
        ["Author", "ALGT ERP Engineering"],
    ]
    meta_t = Table([[Paragraph(f"<b>{k}</b>", S["body"]), Paragraph(v, S["body"])] for k,v in meta_data],
                   colWidths=[4.5*cm, 11.5*cm])
    meta_t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (0,-1), BRAND_DARK),
        ("TEXTCOLOR",     (0,0), (0,-1), WHITE),
        ("BACKGROUND",    (1,0), (1,-1), GRAY_50),
        ("FONTSIZE",      (0,0), (-1,-1), 9),
        ("TOPPADDING",    (0,0), (-1,-1), 7),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ("LEFTPADDING",   (0,0), (-1,-1), 10),
        ("GRID",          (0,0), (-1,-1), 0.3, GRAY_200),
    ]))
    story.append(meta_t)
    story.append(SP(24))

    # Summary blurb
    summary_box = Table([[Paragraph(
        "This manual describes how to configure, integrate, and operate "
        "Microsoft Azure Document Intelligence within the ALGT ERP system for "
        "Arabic-optimized OCR, UAE document extraction, and bilingual AI processing.",
        ParagraphStyle("sum", fontSize=10, textColor=GRAY_700, leading=15,
                        fontName="Helvetica", alignment=TA_JUSTIFY)
    )]], colWidths=["100%"])
    summary_box.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), BRAND_LIGHT),
        ("LINEBEFORE",    (0,0), (0,-1), 4, BRAND_BLUE),
        ("TOPPADDING",    (0,0), (-1,-1), 12),
        ("BOTTOMPADDING", (0,0), (-1,-1), 12),
        ("LEFTPADDING",   (0,0), (-1,-1), 14),
        ("RIGHTPADDING",  (0,0), (-1,-1), 12),
    ]))
    story.append(summary_box)
    story.append(PageBreak())
    return story

# ══════════════════════════════════════════════════════════════════════════════
#  DOCUMENT CONTENT
# ══════════════════════════════════════════════════════════════════════════════
def build_content():
    story = []

    # ── 1. Introduction ────────────────────────────────────────────────────────
    story.append(H1("1. Introduction"))
    story.append(PJ(
        "Azure Document Intelligence (formerly Azure Form Recognizer) is Microsoft's cloud AI "
        "service for extracting structured data from documents. It uses pre-trained and "
        "custom machine-learning models to read printed text, handwriting, and structured forms "
        "in over 100 languages — with exceptional support for Arabic."
    ))
    story.append(SP())
    story.append(PJ(
        "The ALGT ERP system operates across UAE-based logistics, transport, offshore/onshore "
        "operations, HR, and government compliance workflows. Most UAE official documents — "
        "Emirates ID cards, trade licenses, labor contracts, and government certificates — "
        "are bilingual Arabic/English or Arabic-only. Standard PDF text-extraction tools "
        "often fail to read Arabic correctly due to right-to-left (RTL) encoding, "
        "bitmapped Arabic fonts, and custom character mappings."
    ))
    story.append(SP())
    story.append(PJ(
        "Azure Document Intelligence solves these problems with a native Arabic OCR engine "
        "that correctly handles RTL text direction, Arabic Unicode, Tashkeel diacritics, "
        "and bilingual document layouts."
    ))
    story.append(SP(10))

    # Why Azure DI
    story.append(H2("1.1  Why Azure Document Intelligence for Arabic?"))
    why_rows = [
        ("✓ Native Arabic OCR", "Trained on millions of Arabic documents including UAE government IDs and trade licenses"),
        ("✓ RTL Text Direction", "Reads right-to-left Arabic text correctly without character reversal"),
        ("✓ Bilingual Layout", "Handles mixed Arabic/English documents with correct reading order per column"),
        ("✓ UAE ID Pre-trained", "prebuilt-idDocument model is specifically trained on Emirates ID card layouts"),
        ("✓ Arabic Handwriting", "Recognizes Arabic handwritten signatures and annotations"),
        ("✓ Tashkeel Support", "Preserves Arabic diacritics (harakat) that distinguish word meanings"),
        ("✓ Lower AI Cost", "Per-page pricing is much lower than GPT-4.1 vision for large document batches"),
        ("✓ Faster Processing", "Async polling model returns results in 2-10 seconds vs 15-30s for GPT-4.1 vision"),
    ]
    why_t = Table([[Paragraph(k, S["body"]), Paragraph(v, S["body"])] for k,v in why_rows],
                  colWidths=[5.5*cm, 10*cm])
    why_t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (0,-1), colors.HexColor("#ECFDF5")),
        ("TEXTCOLOR",     (0,0), (0,-1), ACCENT_GREEN),
        ("FONTNAME",      (0,0), (0,-1), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0), (-1,-1), 9),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("GRID",          (0,0), (-1,-1), 0.3, GRAY_200),
        ("ROWBACKGROUNDS",(0,0), (-1,-1), [WHITE, colors.HexColor("#F0FDF4")]),
    ]))
    story.append(why_t)
    story.append(PageBreak())

    # ── 2. Prerequisites ───────────────────────────────────────────────────────
    story.append(H1("2. Prerequisites"))
    story.append(H2("2.1  Azure Account"))
    story.append(P("You need an active Microsoft Azure subscription with billing enabled."))
    story.append(B("Azure Portal: <b>portal.azure.com</b>"))
    story.append(B("Recommended region: <b>UAE North</b> (Dubai) or East US 2 for lowest latency"))
    story.append(B("Pricing tier: <b>S0 (Standard)</b> — required for pre-built models and Arabic support"))
    story.append(SP())

    story.append(H2("2.2  ALGT ERP Access"))
    story.append(B("ALGT ERP Admin access with role: <b>system_admin</b> or <b>group_admin</b>"))
    story.append(B("Access to: <b>Admin → Settings → AI Settings</b>"))
    story.append(B("Access to the server <b>.env.local</b> file (or deployment environment variables)"))
    story.append(SP())

    story.append(H2("2.3  Permissions Required in ERP"))
    perm_data = [
        ("settings.ai.view",   "View AI provider configurations in Admin"),
        ("settings.ai.manage", "Add and edit AI provider configurations"),
        ("dms.documents.upload","Upload documents through DMS"),
        ("dms.admin",          "Run OCR and AI operations (or any role with dms.documents.ai.run)"),
    ]
    story.append(info_table(perm_data, [5.5*cm, 10*cm]))
    story.append(PageBreak())

    # ── 3. Creating Azure Resource ─────────────────────────────────────────────
    story.append(H1("3. Creating the Azure Resource"))
    story.append(H2("3.1  Step-by-Step Azure Setup"))

    steps = [
        ("Step 1: Sign in", "Go to portal.azure.com and sign in with your Azure account."),
        ("Step 2: Create resource", 'Click \"+ Create a resource\" → search for \"Document Intelligence\" → click Create.'),
        ("Step 3: Configure", "Fill in: Subscription, Resource Group (create new if needed), Region: UAE North, Name: algt-erp-doc-intelligence, Pricing tier: S0"),
        ("Step 4: Review + Create", "Click \"Review + Create\" → wait for validation → click \"Create\". Deployment takes 1-2 minutes."),
        ("Step 5: Get credentials", "Go to the new resource → Keys and Endpoint. Copy: Endpoint URL and Key 1."),
    ]
    for step, desc in steps:
        step_t = Table([[
            Paragraph(f"<b>{step}</b>", ParagraphStyle("st", fontSize=9, textColor=WHITE, fontName="Helvetica-Bold", leading=13)),
            Paragraph(desc, S["body"])
        ]], colWidths=[3.5*cm, 12*cm])
        step_t.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (0,0), BRAND_BLUE),
            ("TOPPADDING",    (0,0), (-1,-1), 7),
            ("BOTTOMPADDING", (0,0), (-1,-1), 7),
            ("LEFTPADDING",   (0,0), (-1,-1), 8),
            ("GRID",          (0,0), (-1,-1), 0.3, GRAY_200),
        ]))
        story.append(step_t)
        story.append(SP(3))

    story.append(SP(8))
    story.append(H2("3.2  Recommended Azure Configuration"))
    story.append(info_table([
        ("Resource Name",  "algt-erp-doc-intelligence (or any descriptive name)"),
        ("Region",         "UAE North (Dubai) — lowest latency for UAE documents"),
        ("Pricing Tier",   "S0 Standard — required for pre-built models"),
        ("API Version",    "2024-11-30 (latest stable as of June 2026)"),
        ("Endpoint Format","https://[resource-name].cognitiveservices.azure.com"),
    ]))
    story.append(SP(8))
    story.append(Warn(
        "Never share your Azure Key 1 or Key 2. Store them ONLY as environment variables. "
        "The ALGT ERP system stores only the variable name (secret_ref) in the database — "
        "never the actual key value."
    ))
    story.append(PageBreak())

    # ── 4. Available Models ────────────────────────────────────────────────────
    story.append(H1("4. Available Models"))
    story.append(P(
        "Azure Document Intelligence provides several pre-built models. Choose the right "
        "model based on your document type for best Arabic extraction accuracy."
    ))
    story.append(SP(8))

    story.append(model_table([
        ["prebuilt-read",       "Any document, Arabic PDFs, scanned letters, mixed bilingual docs",
         "⭐⭐⭐⭐⭐", "Best general Arabic OCR. Reads RTL text, handwriting, tables. START HERE."],
        ["prebuilt-idDocument", "Emirates ID, Passport, Driving License, Residence Permit",
         "⭐⭐⭐⭐⭐", "Pre-trained on UAE ID card layouts. Extracts name, ID#, nationality, DOB, expiry automatically."],
        ["prebuilt-invoice",    "Tax Invoices, Arabic invoices, supplier bills",
         "⭐⭐⭐⭐", "Handles Arabic invoice RTL column structure. Extracts vendor, amount, VAT, line items."],
        ["prebuilt-document",   "Contracts, certificates, agreements, reports",
         "⭐⭐⭐⭐", "Extracts headings, paragraphs, tables, key-value pairs from Arabic structured documents."],
        ["prebuilt-layout",     "Complex Arabic tables, forms with mixed layout",
         "⭐⭐⭐⭐", "Best for Arabic forms with tables. Returns full page layout with bounding boxes."],
    ]))
    story.append(SP(8))

    # Recommendation box
    rec_t = Table([[
        Paragraph("RECOMMENDATION", ParagraphStyle("rh", fontSize=9, textColor=WHITE,
                   fontName="Helvetica-Bold", leading=13)),
        Paragraph(
            "Start with <b>prebuilt-read</b> as your default model. "
            "It handles all document types correctly for Arabic text. "
            "Create a second provider config with <b>prebuilt-idDocument</b> "
            "specifically for Emirates ID and passport processing.",
            S["body"])
    ]], colWidths=[4*cm, 11.5*cm])
    rec_t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (0,0), BRAND_VIOLET),
        ("BACKGROUND",    (1,0), (1,0), colors.HexColor("#F5F3FF")),
        ("TOPPADDING",    (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("LEFTPADDING",   (0,0), (-1,-1), 10),
        ("GRID",          (0,0), (-1,-1), 0.3, GRAY_200),
    ]))
    story.append(rec_t)
    story.append(PageBreak())

    # ── 5. Environment Variables ───────────────────────────────────────────────
    story.append(H1("5. Environment Variable Setup"))
    story.append(P(
        "Before configuring the provider in the ERP Admin, add your Azure key to the server "
        "environment. This keeps the API key secure — it never touches the database."
    ))
    story.append(SP(8))

    story.append(H2("5.1  Local Development (.env.local)"))
    story.append(P("Open the file <b>c:\\dev\\agt-erp\\.env.local</b> and add:"))
    story.append(Code("AZURE_DOCUMENT_INTELLIGENCE_KEY=abc123...your_key_here...xyz"))
    story.append(SP(4))
    story.append(Code("# Optional: if using a second config for ID documents"))
    story.append(Code("AZURE_DI_ID_DOCUMENT_KEY=abc123...your_key_here...xyz"))
    story.append(SP(8))

    story.append(H2("5.2  Production / Staging Deployment"))
    story.append(P("Add the environment variable to your deployment environment:"))
    story.append(B("Vercel: Project Settings → Environment Variables → Add Variable"))
    story.append(B("Docker: Add to docker-compose.yml environment section"))
    story.append(B("Server: Add to systemd service file or server .env file"))
    story.append(SP(8))

    story.append(H2("5.3  Environment Variable Naming Convention"))
    story.append(info_table([
        ("Variable Name",     "AZURE_DOCUMENT_INTELLIGENCE_KEY"),
        ("Secret Ref in ERP", "AZURE_DOCUMENT_INTELLIGENCE_KEY (must match exactly)"),
        ("Value",             "Your Azure Key 1 from Keys and Endpoint page"),
        ("Never store in DB", "The ERP database stores only the variable NAME, never the value"),
    ]))
    story.append(SP(8))
    story.append(Note(
        "After adding the environment variable, restart your Next.js development server "
        "(npm run dev) for it to take effect. In production, redeploy or restart the service."
    ))
    story.append(PageBreak())

    # ── 6. ERP Admin Configuration ─────────────────────────────────────────────
    story.append(H1("6. Configuring in ALGT ERP Admin"))
    story.append(P(
        "Once your Azure resource is created and the environment variable is set, "
        "add the provider through the ERP Admin panel."
    ))
    story.append(SP(8))

    story.append(H2("6.1  Navigate to AI Settings"))
    story.append(B("Open your browser and go to: <b>/admin/settings/ai</b>"))
    story.append(B("Sign in as system_admin or group_admin"))
    story.append(B('Click the <b>"Add Provider"</b> button in the AI Providers section'))
    story.append(SP(8))

    story.append(H2("6.2  Provider Configuration Fields"))
    story.append(P("Fill in the \"Add AI Provider\" form with the following values:"))
    story.append(SP(6))

    config_data = [
        ("Config Code",      "ARABIC_OCR_AZURE", "Unique identifier used in code"),
        ("Provider Type",    "azure_document_intelligence", "Must match exactly"),
        ("Provider Name",    "Azure Document Intelligence (Arabic OCR)", "Display name"),
        ("API Endpoint",     "https://[resource].cognitiveservices.azure.com", "From Azure portal"),
        ("Model ID",         "prebuilt-read", "Start with this; see Section 4 for options"),
        ("API Version",      "2024-11-30", "Latest stable version"),
        ("Purpose",          "ocr", "Select OCR from the dropdown"),
        ("Secret Ref",       "AZURE_DOCUMENT_INTELLIGENCE_KEY", "Must match your .env variable name"),
        ("Is Active",        "ON", "Toggle enabled"),
        ("Is Enabled",       "ON", "Toggle enabled"),
        ("Requires Review",  "OFF", "OCR output is for internal use"),
    ]
    cfg_t = Table([[
        Paragraph(f"<b>{f}</b>", S["body"]),
        Paragraph(f"<b><font color='#1D4ED8'>{v}</font></b>", S["body"]),
        Paragraph(n, ParagraphStyle("note2", fontSize=8, textColor=GRAY_400, fontName="Helvetica", leading=11))
    ] for f,v,n in config_data], colWidths=[4.5*cm, 5.5*cm, 5.5*cm])
    cfg_t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (0,-1), GRAY_100),
        ("FONTSIZE",      (0,0), (-1,-1), 9),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("GRID",          (0,0), (-1,-1), 0.3, GRAY_200),
        ("ROWBACKGROUNDS",(0,0), (-1,-1), [WHITE, GRAY_50]),
    ]))
    story.append(cfg_t)
    story.append(SP(10))

    story.append(H2("6.3  Setting the Secret Key"))
    story.append(B('After saving the provider, click the <b>"Set Secret"</b> button on the provider row.'))
    story.append(B("Paste your <b>Azure Key 1</b> in the dialog."))
    story.append(B("Click Save — the key is encrypted/masked. The DB stores only a preview (first 4 chars + ***)."))
    story.append(B("The actual key is read from the environment variable at runtime."))
    story.append(SP(8))

    story.append(H2("6.4  Testing the Connection"))
    story.append(B('Click <b>"Test Connection"</b> on the provider row.'))
    story.append(B("The system sends a minimal test request to Azure and confirms the endpoint is reachable."))
    story.append(B("A green checkmark appears if the test passes."))
    story.append(SP(6))
    story.append(Warn(
        "If Test Connection fails: verify your Azure endpoint URL is correct (ends in .cognitiveservices.azure.com), "
        "check that Key 1 is correct and not expired, and confirm the environment variable name matches Secret Ref exactly."
    ))
    story.append(PageBreak())

    # ── 7. How It Works in the ERP ──────────────────────────────────────────────
    story.append(H1("7. How Azure Document Intelligence Works in the ERP"))
    story.append(H2("7.1  Processing Architecture"))
    story.append(PJ(
        "Azure Document Intelligence is used as an alternative to GPT-4.1 Vision for "
        "document OCR. The system automatically detects whether Azure DI is configured "
        "and uses it for text extraction. GPT-4.1 Vision is then used for classification "
        "and metadata extraction using the extracted text."
    ))
    story.append(SP(8))

    # Flow diagram as table
    flow_steps = [
        ("1", "User uploads document", "DMS Upload Inbox → Click Upload & AI Fill", BRAND_BLUE),
        ("2", "System checks Azure DI", "getAzureDocumentIntelligenceProvider() checks for ARABIC_OCR_AZURE config", BRAND_VIOLET),
        ("3", "Azure DI OCR", "Document sent to Azure → analyzeWithAzureOcr() → poll result → extract Arabic text", BRAND_VIOLET),
        ("4", "GPT-4.1 Classification", "Azure OCR text passed to GPT-4.1 → classify document type + extract metadata", BRAND_BLUE),
        ("5", "Draft created", "AI-filled intake review form created with Arabic text correctly extracted", ACCENT_GREEN),
        ("6", "Human review", "User reviews AI suggestions → Approve & Save → Document becomes active", ACCENT_GREEN),
    ]
    flow_data = [[
        Paragraph(f"<b>{n}</b>", ParagraphStyle("fn", fontSize=11, textColor=WHITE, fontName="Helvetica-Bold", leading=14, alignment=TA_CENTER)),
        Paragraph(f"<b>{title}</b>", ParagraphStyle("ft", fontSize=9, textColor=WHITE, fontName="Helvetica-Bold", leading=12)),
        Paragraph(detail, ParagraphStyle("fd", fontSize=8.5, textColor=colors.HexColor("#E2E8F0"), fontName="Helvetica", leading=12)),
    ] for n, title, detail, col in flow_steps]
    flow_t = Table(flow_data, colWidths=[1*cm, 5*cm, 9.5*cm])
    flow_colors = [step[3] for step in flow_steps]
    for i, col in enumerate(flow_colors):
        flow_t.setStyle(TableStyle([
            ("BACKGROUND", (0,i), (1,i), col),
            ("BACKGROUND", (2,i), (2,i), colors.HexColor("#1E293B")),
        ]))
    flow_t.setStyle(TableStyle([
        ("TOPPADDING",    (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("GRID",          (0,0), (-1,-1), 0.5, BRAND_DARK),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(flow_t)
    story.append(SP(10))

    story.append(H2("7.2  Fallback Behavior"))
    story.append(P(
        "If Azure Document Intelligence is not configured or returns an error, "
        "the system automatically falls back to the existing GPT-4.1 Vision pipeline. "
        "This ensures no document upload is broken even if Azure DI is unavailable."
    ))
    story.append(info_table([
        ("Azure DI configured + working", "Uses Azure DI for OCR → GPT-4.1 for classification"),
        ("Azure DI not configured",       "Falls back to GPT-4.1 Vision (existing behavior — unchanged)"),
        ("Azure DI returns empty text",   "Falls back to GPT-4.1 Vision automatically"),
        ("Azure DI request times out",    "Falls back to GPT-4.1 Vision, logs safe error code"),
    ]))
    story.append(PageBreak())

    # ── 8. Async Polling ───────────────────────────────────────────────────────
    story.append(H1("8. Technical Details — Async Polling"))
    story.append(PJ(
        "Azure Document Intelligence uses an asynchronous processing model. "
        "When you submit a document, Azure returns a 202 Accepted response with an "
        "Operation-Location header. The system then polls this URL until the result is ready."
    ))
    story.append(SP(8))

    story.append(info_table([
        ("Submit request",    "POST to /documentModels/{model}:analyze → returns 202 + Operation-Location"),
        ("Poll interval",     "Every 2 seconds"),
        ("Maximum polls",     "25 attempts (50 seconds maximum wait)"),
        ("Timeout",           "60 seconds total request timeout"),
        ("Status values",     "notStarted → running → succeeded / failed"),
        ("Text extraction",   "From paragraphs[] array (preserves RTL order) → fallback to pages[].lines[]"),
    ]))
    story.append(SP(8))

    story.append(H2("8.1  Supported Document Formats"))
    story.append(B("<b>PDF</b> — all types: digital, scanned, image-based, Arabic-encoded"))
    story.append(B("<b>JPEG / JPG</b> — photos of documents, ID cards, certificates"))
    story.append(B("<b>PNG</b> — screenshots, scanned images"))
    story.append(B("<b>TIFF / TIF</b> — high-resolution scans"))
    story.append(B("<b>BMP</b> — bitmap images"))
    story.append(B("<b>HEIF</b> — iPhone photos (common for UAE ID card photos)"))
    story.append(SP(4))
    story.append(Note(
        "Maximum file size: 500 MB. Maximum pages: 2000 pages per document. "
        "For best Arabic OCR accuracy, use 300 DPI minimum resolution."
    ))
    story.append(PageBreak())

    # ── 9. Second Provider for Emirates ID ─────────────────────────────────────
    story.append(H1("9. Optional: Second Provider for Emirates ID"))
    story.append(PJ(
        "For maximum accuracy on Emirates ID cards and passports, create a second "
        "provider configuration using the prebuilt-idDocument model. This model is "
        "specifically pre-trained on UAE identity document layouts."
    ))
    story.append(SP(8))

    story.append(H2("9.1  Emirates ID Provider Configuration"))
    story.append(info_table([
        ("Config Code",   "ARABIC_OCR_AZURE_ID"),
        ("Provider Type", "azure_document_intelligence"),
        ("Provider Name", "Azure Document Intelligence (ID Documents)"),
        ("API Endpoint",  "https://[resource].cognitiveservices.azure.com"),
        ("Model ID",      "prebuilt-idDocument"),
        ("API Version",   "2024-11-30"),
        ("Purpose",       "ocr"),
        ("Secret Ref",    "AZURE_DOCUMENT_INTELLIGENCE_KEY"),
        ("Is Active",     "ON"),
        ("Is Enabled",    "ON"),
    ]))
    story.append(SP(8))

    story.append(H2("9.2  What prebuilt-idDocument Extracts from Emirates ID"))
    id_fields = [
        ("FirstName",      "First name — English and Arabic"),
        ("LastName",       "Last name — English and Arabic"),
        ("DocumentNumber", "Emirates ID number (format: 784-XXXX-XXXXXXX-X)"),
        ("DateOfBirth",    "Date of birth — Gregorian"),
        ("DateOfExpiration","Card expiry date"),
        ("Nationality",    "Nationality — English code (UAE, IND, PAK, etc.)"),
        ("Sex",            "Gender (M/F)"),
        ("CountryRegion",  "Issuing country (ARE for UAE)"),
    ]
    story.append(info_table(id_fields, [5*cm, 10.5*cm]))
    story.append(PageBreak())

    # ── 10. Arabic OCR Quality Guide ────────────────────────────────────────────
    story.append(H1("10. Arabic OCR Quality Guide"))
    story.append(H2("10.1  Factors That Affect Arabic OCR Accuracy"))

    quality_data = [
        ("Factor",          "Impact on Accuracy",  "Recommended Action"),
        ("Image Resolution","Very High",            "Use minimum 300 DPI. 600 DPI for small text."),
        ("File Format",     "Medium",               "PDF > PNG > JPEG (avoid heavy JPEG compression)"),
        ("Document Angle",  "High",                 "Scan documents flat, <5 degree tilt"),
        ("Lighting",        "High",                 "Even lighting, no shadows over Arabic text"),
        ("Paper Quality",   "Medium",               "Clean paper, no coffee stains or folds over text"),
        ("Font Type",       "High",                 "Printed fonts: excellent. Handwriting: good. Decorative: fair."),
        ("Color vs B&W",    "Low",                  "Both work well. Color adds context for stamps."),
    ]
    qt = Table([[Paragraph(c, ParagraphStyle("qh", fontSize=8.5,
                fontName="Helvetica-Bold" if i==0 else "Helvetica",
                textColor=WHITE if i==0 else GRAY_700, leading=12)) for c in row]
                for i, row in enumerate(quality_data)],
               colWidths=[4.5*cm, 3.5*cm, 7.5*cm])
    qt.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0), BRAND_DARK),
        ("TEXTCOLOR",     (0,0), (-1,0), WHITE),
        ("FONTSIZE",      (0,0), (-1,-1), 8.5),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 6),
        ("GRID",          (0,0), (-1,-1), 0.3, GRAY_200),
        ("ROWBACKGROUNDS",(0,1), (-1,-1), [WHITE, GRAY_50]),
    ]))
    story.append(qt)
    story.append(SP(10))

    story.append(H2("10.2  What Azure DI Handles Correctly for Arabic"))
    story.append(OK("Arabic Unicode text — all Arabic character sets (U+0600-U+06FF)"))
    story.append(OK("Right-to-left text direction — correct reading order preserved"))
    story.append(OK("Tashkeel diacritics — فَتْحَة، كَسْرَة، ضَمَّة preserved when visible"))
    story.append(OK("Mixed Arabic/English in same line — bilingual documents handled"))
    story.append(OK("Arabic tables — RTL table structure preserved in extraction"))
    story.append(OK("Eastern Arabic numerals — ٠١٢٣٤٥٦٧٨٩ correctly recognized"))
    story.append(OK("Arabic dates — ١٤/٠٧/١٤٤٥ recognized (note: Hijri vs Gregorian requires post-processing)"))
    story.append(SP(6))

    story.append(H2("10.3  Known Limitations"))
    story.append(Warn("Very small Arabic text (<6pt) — may have reduced accuracy"))
    story.append(Warn("Highly decorative Arabic calligraphy — may have reduced accuracy"))
    story.append(Warn("Torn or water-damaged documents — standard limitation for all OCR"))
    story.append(Warn("Hijri calendar dates — extracted as text; Gregorian conversion requires post-processing (handled by GPT-4.1 prompt)"))
    story.append(PageBreak())

    # ── 11. UAE Document Types ──────────────────────────────────────────────────
    story.append(H1("11. UAE Document Types — Recommended Models"))

    doc_models = [
        ("بطاقة الهوية الإماراتية", "Emirates ID",         "prebuilt-idDocument", "Extracts ID#, name (Ar+En), DOB, expiry, nationality. Pre-trained on UAE ID layout."),
        ("جواز سفر",               "Passport",            "prebuilt-idDocument", "Extracts passport#, name, nationality, MRZ lines, DOB, expiry, issue date."),
        ("رخصة تجارية",            "Trade License",       "prebuilt-read",        "Reads license#, company name (Ar+En), activities, issuing authority, dates."),
        ("تأشيرة / إقامة",         "Visa / Residency",    "prebuilt-idDocument", "Extracts visa#, entry date, expiry, sponsor name, entry type."),
        ("عقد عمل",               "Labor Contract",      "prebuilt-document",    "Extracts parties, dates, job title, salary, terms. Key-value pair extraction."),
        ("فاتورة ضريبية",          "Tax Invoice",         "prebuilt-invoice",     "Extracts vendor, buyer, TRN, invoice#, date, amounts, VAT, line items."),
        ("عقد إيجار",              "Tenancy Contract",    "prebuilt-document",    "Extracts landlord, tenant, property, rent, EJARI number, dates."),
        ("شهادة صحية",            "Medical Certificate", "prebuilt-read",        "General text extraction. Fitness result, dates, issuing authority."),
        ("وثيقة تأمين",           "Insurance Policy",    "prebuilt-document",    "Policy number, coverage dates, amounts, insured party, conditions."),
        ("وكالة قانونية",          "Power of Attorney",   "prebuilt-document",    "Principal, agent, scope, dates, notary information."),
    ]
    doc_t = Table([[
        Paragraph(f"<b>{ar}</b>", ParagraphStyle("ar", fontSize=9, textColor=BRAND_DARK, fontName="Helvetica-Bold", leading=13)),
        Paragraph(en, S["body"]),
        Paragraph(f"<font color='#1D4ED8'><b>{model}</b></font>", S["body"]),
        Paragraph(note, ParagraphStyle("dn", fontSize=8, textColor=GRAY_600, fontName="Helvetica", leading=11)),
    ] for ar, en, model, note in doc_models],
    colWidths=[4.5*cm, 3.5*cm, 4*cm, 3.5*cm])
    doc_t.setStyle(TableStyle([
        ("FONTSIZE",      (0,0), (-1,-1), 8.5),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 6),
        ("GRID",          (0,0), (-1,-1), 0.3, GRAY_200),
        ("BACKGROUND",    (0,0), (0,-1), BRAND_LIGHT),
        ("ROWBACKGROUNDS",(0,0), (-1,-1), [WHITE, GRAY_50]),
    ]))
    story.append(doc_t)
    story.append(PageBreak())

    # ── 12. Cost Reference ─────────────────────────────────────────────────────
    story.append(H1("12. Azure Pricing Reference (June 2026)"))
    story.append(P(
        "Azure Document Intelligence pricing is per page. Costs are significantly lower "
        "than GPT-4.1 Vision for high-volume document processing."
    ))
    story.append(SP(8))

    price_data = [
        ["Model",                    "Price per Page",  "Notes"],
        ["prebuilt-read",            "$0.001",          "0–500,000 pages/month"],
        ["prebuilt-idDocument",      "$0.001",          "0–500,000 pages/month"],
        ["prebuilt-invoice",         "$0.010",          "Higher due to complex extraction"],
        ["prebuilt-document",        "$0.001",          "0–500,000 pages/month"],
        ["prebuilt-layout",          "$0.001",          "0–500,000 pages/month"],
        ["GPT-4.1 Vision (compare)", "$0.05–$0.15",     "Per page estimate — 50–150x more expensive"],
    ]
    price_t = Table([[Paragraph(c, ParagraphStyle("ph", fontSize=9,
                     fontName="Helvetica-Bold" if i==0 else "Helvetica",
                     textColor=WHITE if i==0 else (BRAND_DARK if j==0 else GRAY_700),
                     leading=12)) for j,c in enumerate(row)]
                    for i, row in enumerate(price_data)],
                   colWidths=[5*cm, 4.5*cm, 6*cm])
    price_t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,0), BRAND_DARK),
        ("BACKGROUND",    (0,-1),(-1,-1), colors.HexColor("#FEF9C3")),
        ("FONTSIZE",      (0,0), (-1,-1), 9),
        ("TOPPADDING",    (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
        ("GRID",          (0,0), (-1,-1), 0.3, GRAY_200),
        ("ROWBACKGROUNDS",(0,1), (-1,-2), [WHITE, GRAY_50]),
    ]))
    story.append(price_t)
    story.append(SP(8))
    story.append(Note(
        "Pricing based on Azure pricing page (June 2026) for UAE North region. "
        "The first 500 pages per month may be included in the free tier. "
        "Check portal.azure.com/pricing for current rates."
    ))
    story.append(PageBreak())

    # ── 13. Troubleshooting ─────────────────────────────────────────────────────
    story.append(H1("13. Troubleshooting"))

    issues = [
        ("Test Connection fails",
         "API key not set in .env.local\nEndpoint URL is incorrect\nAzure resource is in a different region",
         "Check AZURE_DOCUMENT_INTELLIGENCE_KEY in .env.local. Verify endpoint exactly matches Azure portal (no trailing slash). Restart Next.js server after env changes."),
        ("Arabic text returns as question marks or boxes",
         "Using wrong OCR provider (pdf-parse instead of Azure DI)\nDocument has non-Unicode Arabic encoding",
         "Ensure ARABIC_OCR_AZURE config is Active + Enabled. Re-run OCR on the document from the document record → OCR tab → Re-run OCR (AI)."),
        ("Empty text returned from Azure DI",
         "Document is image-only with no content\nFile format not supported\nLow image quality",
         "System automatically falls back to GPT-4.1 Vision. Check document quality (300 DPI minimum). Verify file is not corrupted."),
        ("Operation timeout after 50 seconds",
         "Azure region is far from your server\nVery large document (100+ pages)\nAzure service degradation",
         "Consider switching to UAE North region for lower latency. For large documents, split into batches. Check Azure status at status.azure.com."),
        ("model_id error in Azure response",
         "Typo in Model ID field\nModel ID not available in your Azure region",
         "Valid models: prebuilt-read, prebuilt-idDocument, prebuilt-invoice, prebuilt-document, prebuilt-layout. Check Azure region supports the model."),
        ("Right-to-left text order wrong",
         "Using pdf-parse instead of Azure DI\nDocument has mixed RTL/LTR without proper Unicode markers",
         "Azure DI handles RTL correctly. If still wrong after Azure DI is active, the issue is in the downstream processing. Report to ERP engineering team."),
    ]

    for issue, causes, solution in issues:
        issue_t = Table([[
            Paragraph(f"<b>Issue:</b> {issue}", ParagraphStyle("iss", fontSize=9.5,
                      textColor=ACCENT_RED, fontName="Helvetica-Bold", leading=13)),
        ]], colWidths=["100%"])
        issue_t.setStyle(TableStyle([
            ("BACKGROUND",    (0,0), (-1,-1), colors.HexColor("#FEF2F2")),
            ("LEFTPADDING",   (0,0), (-1,-1), 10),
            ("TOPPADDING",    (0,0), (-1,-1), 7),
            ("BOTTOMPADDING", (0,0), (-1,-1), 7),
            ("LINEBEFORE",    (0,0), (0,-1), 3, ACCENT_RED),
        ]))
        story.append(issue_t)

        detail_t = Table([[
            Paragraph(f"<b>Causes:</b><br/>{causes.replace(chr(10), '<br/>')}", S["body"]),
            Paragraph(f"<b>Solution:</b><br/>{solution}", S["body"]),
        ]], colWidths=[7.5*cm, 8*cm])
        detail_t.setStyle(TableStyle([
            ("FONTSIZE",      (0,0), (-1,-1), 9),
            ("TOPPADDING",    (0,0), (-1,-1), 6),
            ("BOTTOMPADDING", (0,0), (-1,-1), 6),
            ("LEFTPADDING",   (0,0), (-1,-1), 10),
            ("GRID",          (0,0), (-1,-1), 0.3, GRAY_200),
            ("BACKGROUND",    (0,0), (0,0), GRAY_50),
            ("BACKGROUND",    (1,0), (1,0), colors.HexColor("#F0FDF4")),
        ]))
        story.append(detail_t)
        story.append(SP(6))

    story.append(PageBreak())

    # ── 14. UAT Checklist ───────────────────────────────────────────────────────
    story.append(H1("14. UAT Acceptance Checklist"))
    story.append(P(
        "Use this checklist to verify Azure Document Intelligence is correctly "
        "integrated in your ALGT ERP system."
    ))
    story.append(SP(8))

    uat_rows = [
        (True,  "Azure resource created in UAE North region",          "S0 Standard tier"),
        (True,  "AZURE_DOCUMENT_INTELLIGENCE_KEY set in .env.local",   "Env var name matches Secret Ref"),
        (True,  "ARABIC_OCR_AZURE provider added in Admin → AI Settings", "Config Code: ARABIC_OCR_AZURE"),
        (True,  "Provider type is azure_document_intelligence",         "Not azure_openai or openai"),
        (True,  "Model ID set to prebuilt-read",                       "Default model for general Arabic"),
        (True,  "Provider is Active and Enabled",                       "Both toggles ON"),
        (True,  "Test Connection passes with green checkmark",          "Azure key and endpoint valid"),
        (False, "Upload Arabic Trade License → OCR returns Arabic text","Run OCR (AI) on document"),
        (False, "Arabic company name visible in extracted text field",   "Full Arabic Unicode preserved"),
        (False, "Upload Emirates ID → Arabic name extracted",           "name_ar field populated"),
        (False, "Upload Arabic-only document → English summary generated","AI summary explains content"),
        (False, "Smart Links suggest correct party for Arabic company name", "Arabic name matching works"),
        (False, "Fallback works: disable provider → GPT-4.1 runs instead", "No errors when Azure DI off"),
    ]
    story.append(checklist_table(uat_rows))
    story.append(SP(8))
    story.append(Note(
        "Mark items as complete by verifying each in your test environment before "
        "enabling Azure Document Intelligence in production."
    ))
    story.append(PageBreak())

    # ── 15. Quick Reference ─────────────────────────────────────────────────────
    story.append(H1("15. Quick Reference Card"))
    story.append(SP(4))

    qr_data = [
        ["Config Code",      "ARABIC_OCR_AZURE"],
        ["Provider Type",    "azure_document_intelligence"],
        ["Default Model",    "prebuilt-read"],
        ["ID Model",         "prebuilt-idDocument (Emirates ID, Passport)"],
        ["Invoice Model",    "prebuilt-invoice"],
        ["API Version",      "2024-11-30"],
        ["Env Variable",     "AZURE_DOCUMENT_INTELLIGENCE_KEY"],
        ["Admin URL",        "/admin/settings/ai"],
        ["Max File Size",    "500 MB"],
        ["Max Pages",        "2000 pages"],
        ["Timeout",          "60 seconds (25 polls × 2s interval)"],
        ["Fallback",         "GPT-4.1 Vision (automatic if Azure DI unavailable)"],
        ["Pricing",          "$0.001 per page (prebuilt-read / prebuilt-idDocument)"],
        ["Azure Portal",     "portal.azure.com → Document Intelligence"],
        ["Azure Status",     "status.azure.com"],
    ]
    qr_t = Table([[
        Paragraph(f"<b>{k}</b>", S["body"]),
        Paragraph(f"<font color='#1D4ED8'><b>{v}</b></font>" if any(c.isupper() and c.isalpha() for c in v[:3]) else v, S["body"])
    ] for k,v in qr_data], colWidths=[5*cm, 10.5*cm])
    qr_t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (0,-1), BRAND_DARK),
        ("TEXTCOLOR",     (0,0), (0,-1), WHITE),
        ("FONTSIZE",      (0,0), (-1,-1), 9),
        ("TOPPADDING",    (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING",   (0,0), (-1,-1), 10),
        ("GRID",          (0,0), (-1,-1), 0.3, GRAY_200),
        ("ROWBACKGROUNDS",(0,0), (-1,-1), [WHITE, GRAY_50]),
    ]))
    story.append(qr_t)
    story.append(SP(16))
    story.append(HR())
    story.append(SP(8))
    story.append(Paragraph(
        "ALGT ERP — Internal Technical Documentation · Version 1.0 · DMS ARABIC FIX.1",
        ParagraphStyle("footer_final", fontSize=8, textColor=GRAY_400,
                        fontName="Helvetica", alignment=TA_CENTER)))
    story.append(Paragraph(
        f"Generated: {datetime.date.today().strftime('%d %B %Y')} · Alliance Gulf Transport Group",
        ParagraphStyle("footer_final2", fontSize=8, textColor=GRAY_400,
                        fontName="Helvetica", alignment=TA_CENTER)))

    return story

# ══════════════════════════════════════════════════════════════════════════════
#  MAIN — Build PDF
# ══════════════════════════════════════════════════════════════════════════════
def main():
    w, h = A4
    margin = 1.5*cm

    doc = SimpleDocTemplate(
        OUTPUT_PATH,
        pagesize=A4,
        rightMargin=margin,
        leftMargin=margin,
        topMargin=2.5*cm,
        bottomMargin=1.8*cm,
        title="Azure Document Intelligence Manual — ALGT ERP",
        author="ALGT ERP Engineering",
        subject="Azure Document Intelligence Integration Manual",
        creator="ALGT ERP Manual Generator v1.0",
    )

    story = []
    story.extend(build_cover())
    story.extend(build_content())

    doc.build(story, onFirstPage=on_cover_page, onLaterPages=on_page)
    print(f"PDF generated successfully: {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
