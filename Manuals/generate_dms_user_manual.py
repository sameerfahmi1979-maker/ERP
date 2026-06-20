"""
ALGT ERP — DMS User Manual Generator
Output: Manuals/DMS_User_Manual.pdf
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
import datetime

OUTPUT_PATH = r"Manuals\DMS_User_Manual.pdf"

DARK      = colors.HexColor("#0F172A")
BLUE      = colors.HexColor("#1D4ED8")
BLUE_L    = colors.HexColor("#EFF6FF")
VIOLET    = colors.HexColor("#7C3AED")
VIOLET_L  = colors.HexColor("#F5F3FF")
GREEN     = colors.HexColor("#15803D")
GREEN_L   = colors.HexColor("#F0FDF4")
AMBER     = colors.HexColor("#B45309")
AMBER_L   = colors.HexColor("#FFFBEB")
RED       = colors.HexColor("#B91C1C")
TEAL      = colors.HexColor("#0F766E")
SLATE_50  = colors.HexColor("#F8FAFC")
SLATE_100 = colors.HexColor("#F1F5F9")
SLATE_200 = colors.HexColor("#E2E8F0")
SLATE_400 = colors.HexColor("#94A3B8")
SLATE_600 = colors.HexColor("#475569")
SLATE_700 = colors.HexColor("#334155")
WHITE     = colors.white

def on_page(canvas_obj, doc):
    canvas_obj.saveState()
    w, h = A4
    canvas_obj.setFillColor(DARK)
    canvas_obj.rect(0, h-1.5*cm, w, 1.5*cm, fill=1, stroke=0)
    canvas_obj.setFillColor(WHITE)
    canvas_obj.setFont("Helvetica-Bold", 8)
    canvas_obj.drawString(1.5*cm, h-1.0*cm, "ALGT ERP — DMS User Manual")
    canvas_obj.setFillColor(SLATE_400)
    canvas_obj.setFont("Helvetica", 7)
    canvas_obj.drawRightString(w-1.5*cm, h-1.0*cm, f"User Guide · {datetime.date.today().strftime('%B %Y')}")
    canvas_obj.setFillColor(SLATE_200)
    canvas_obj.rect(0, 0, w, 1.0*cm, fill=1, stroke=0)
    canvas_obj.setFillColor(SLATE_600)
    canvas_obj.setFont("Helvetica", 7)
    if doc.page > 1:
        canvas_obj.drawCentredString(w/2, 0.35*cm, f"Page {doc.page}")
    canvas_obj.drawString(1.5*cm, 0.35*cm, "Alliance Gulf Transport Group · Internal Use Only")
    canvas_obj.restoreState()

def on_cover(canvas_obj, doc): pass

base = getSampleStyleSheet()
S = {
    "h1":   ParagraphStyle("h1",  parent=base["Heading1"], fontSize=20, textColor=DARK,
                            fontName="Helvetica-Bold", spaceAfter=10, spaceBefore=18, leading=26),
    "h2":   ParagraphStyle("h2",  parent=base["Heading2"], fontSize=13, textColor=BLUE,
                            fontName="Helvetica-Bold", spaceAfter=7, spaceBefore=14, leading=18),
    "h3":   ParagraphStyle("h3",  parent=base["Heading3"], fontSize=10.5, textColor=DARK,
                            fontName="Helvetica-Bold", spaceAfter=5, spaceBefore=9, leading=14),
    "body": ParagraphStyle("body",parent=base["Normal"], fontSize=9.5, textColor=SLATE_700,
                            spaceAfter=5, leading=14, fontName="Helvetica"),
    "bj":   ParagraphStyle("bj",  parent=base["Normal"], fontSize=9.5, textColor=SLATE_700,
                            spaceAfter=5, leading=14, fontName="Helvetica", alignment=TA_JUSTIFY),
    "b":    ParagraphStyle("b",   parent=base["Normal"], fontSize=9.5, textColor=SLATE_700,
                            spaceAfter=4, leading=13, fontName="Helvetica", leftIndent=14, bulletIndent=4),
    "note": ParagraphStyle("note",parent=base["Normal"], fontSize=9, textColor=AMBER,
                            spaceAfter=5, leading=13, fontName="Helvetica", leftIndent=12),
    "warn": ParagraphStyle("warn",parent=base["Normal"], fontSize=9, textColor=RED,
                            spaceAfter=5, leading=13, fontName="Helvetica", leftIndent=12),
    "ok":   ParagraphStyle("ok",  parent=base["Normal"], fontSize=9, textColor=GREEN,
                            spaceAfter=5, leading=13, fontName="Helvetica", leftIndent=12),
    "step": ParagraphStyle("step",parent=base["Normal"], fontSize=10, textColor=WHITE,
                            fontName="Helvetica-Bold", leading=14, alignment=TA_CENTER),
}

def H1(t): return Paragraph(t, S["h1"])
def H2(t): return Paragraph(t, S["h2"])
def H3(t): return Paragraph(t, S["h3"])
def P(t):  return Paragraph(t, S["body"])
def PJ(t): return Paragraph(t, S["bj"])
def B(t):  return Paragraph(f"▸ &nbsp;{t}", S["b"])
def Note(t): return Paragraph(f"💡 {t}", S["note"])
def Warn(t): return Paragraph(f"⚠ {t}", S["warn"])
def OK(t):   return Paragraph(f"✓ {t}", S["ok"])
def SP(n=8): return Spacer(1, n)
def HR(): return HRFlowable(width="100%", thickness=0.5, color=SLATE_200, spaceAfter=6, spaceBefore=4)

def box(text, bg=BLUE_L, border=BLUE):
    t = Table([[Paragraph(text, S["body"])]], colWidths=["100%"])
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1), bg),
        ("LINEBEFORE",(0,0),(0,-1), 4, border),
        ("TOPPADDING",(0,0),(-1,-1), 9),
        ("BOTTOMPADDING",(0,0),(-1,-1), 9),
        ("LEFTPADDING",(0,0),(-1,-1), 12),
        ("RIGHTPADDING",(0,0),(-1,-1), 10),
    ]))
    return t

def step_flow(steps):
    """Numbered step flow."""
    items = []
    for i, (title, desc) in enumerate(steps):
        row = Table([[
            Paragraph(str(i+1), ParagraphStyle("sn", fontSize=13, textColor=WHITE,
                      fontName="Helvetica-Bold", alignment=TA_CENTER, leading=16)),
            Paragraph(f"<b>{title}</b><br/>{desc}", ParagraphStyle("sd", fontSize=9.5,
                      textColor=SLATE_700, fontName="Helvetica", leading=13, spaceAfter=0)),
        ]], colWidths=[1.2*cm, 14.3*cm])
        row.setStyle(TableStyle([
            ("BACKGROUND",(0,0),(0,0), BLUE if i%2==0 else VIOLET),
            ("TOPPADDING",(0,0),(-1,-1), 9),
            ("BOTTOMPADDING",(0,0),(-1,-1), 9),
            ("LEFTPADDING",(0,0),(-1,-1), 8),
            ("GRID",(0,0),(-1,-1), 0.3, SLATE_200),
            ("VALIGN",(0,0),(-1,-1), "MIDDLE"),
            ("BACKGROUND",(1,0),(1,0), SLATE_50 if i%2==0 else VIOLET_L),
        ]))
        items.append(row)
        items.append(SP(3))
    return items

def section_box(title, content_items, color=BLUE_L, border=BLUE):
    """Box with title bar."""
    title_t = Table([[Paragraph(title, ParagraphStyle("bt", fontSize=10, textColor=WHITE,
                     fontName="Helvetica-Bold", leading=14))]], colWidths=["100%"])
    title_t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1), border),
        ("TOPPADDING",(0,0),(-1,-1), 6),
        ("BOTTOMPADDING",(0,0),(-1,-1), 6),
        ("LEFTPADDING",(0,0),(-1,-1), 10),
    ]))
    return [title_t, SP(0)] + content_items

# ══════════════════════════════════════════════════════════════════════════════
# COVER
# ══════════════════════════════════════════════════════════════════════════════
def build_cover():
    story = []
    top = Table([[""]], colWidths=["100%"], rowHeights=[4*cm])
    top.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1), DARK)]))
    story.append(top)
    story.append(SP(20))
    story.append(Paragraph("📄", ParagraphStyle("icon", fontSize=40, alignment=TA_CENTER, spaceAfter=8, leading=48)))
    story.append(Paragraph("DMS User Manual",
        ParagraphStyle("cov", fontSize=30, textColor=DARK, fontName="Helvetica-Bold",
                        alignment=TA_CENTER, spaceAfter=6, leading=36)))
    story.append(Paragraph("Document Management System — End User Guide",
        ParagraphStyle("covs", fontSize=13, textColor=SLATE_600, fontName="Helvetica",
                        alignment=TA_CENTER, spaceAfter=16, leading=18)))
    story.append(HRFlowable(width="60%", thickness=2, color=VIOLET, hAlign="CENTER", spaceAfter=20))
    meta = [
        ("System",    "ALGT ERP — Document Management System (DMS)"),
        ("Audience",  "All ERP Users who upload, manage or review documents"),
        ("Manual",    "Manual 2 of 2 — End User Guide"),
        ("Version",   "1.0"),
        ("Date",      datetime.date.today().strftime("%d %B %Y")),
        ("Language",  "English (Arabic document support included)"),
    ]
    mt = Table([[Paragraph(f"<b>{k}</b>", S["body"]), Paragraph(v, S["body"])] for k,v in meta],
               colWidths=[4*cm, 11*cm])
    mt.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(0,-1), DARK), ("TEXTCOLOR",(0,0),(0,-1), WHITE),
        ("FONTSIZE",(0,0),(-1,-1), 9), ("TOPPADDING",(0,0),(-1,-1), 7),
        ("BOTTOMPADDING",(0,0),(-1,-1), 7), ("LEFTPADDING",(0,0),(-1,-1), 10),
        ("GRID",(0,0),(-1,-1), 0.3, SLATE_200),
    ]))
    story.append(mt)
    story.append(SP(20))
    story.append(box(
        "This guide explains how to upload documents, use AI-powered fill, search the document "
        "repository, manage expiry reminders, review AI suggestions, and work with the full "
        "DMS feature set — including Arabic document support.",
        VIOLET_L, VIOLET))
    story.append(PageBreak())
    return story

# ══════════════════════════════════════════════════════════════════════════════
# CONTENT
# ══════════════════════════════════════════════════════════════════════════════
def build_content():
    story = []

    # ── 1. Getting Started ─────────────────────────────────────────────────────
    story.append(H1("1. Getting Started with DMS"))
    story.append(PJ(
        "The Document Management System (DMS) is your central hub for all business documents. "
        "You can upload, search, track, and collaborate on documents — with AI assistance "
        "that automatically reads Arabic and English documents and fills in the details for you."
    ))
    story.append(SP(8))
    story.append(H2("1.1  Navigating the DMS"))
    nav = [
        ("/dms",              "DMS Home — overview and quick links"),
        ("/dms/documents",    "Full document repository — search and browse all documents"),
        ("/dms/inbox",        "Upload Inbox — upload new documents here"),
        ("/dms/inbox/batches","Batch Uploads — manage multi-file upload queues"),
        ("/dms/expiring",     "Expiry Dashboard — documents expiring soon or already expired"),
        ("/dms/renewals",     "Renewal Requests — track document renewal workflows"),
        ("/dms/notifications","DMS Notifications — expiry alerts and system messages"),
    ]
    nt = Table([[P(r), P(d)] for r,d in nav], colWidths=[5.5*cm, 10*cm])
    nt.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(0,-1), DARK), ("TEXTCOLOR",(0,0),(0,-1), WHITE),
        ("FONTSIZE",(0,0),(-1,-1), 9), ("TOPPADDING",(0,0),(-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5), ("LEFTPADDING",(0,0),(-1,-1), 7),
        ("GRID",(0,0),(-1,-1), 0.3, SLATE_200),
        ("ROWBACKGROUNDS",(0,0),(-1,-1), [WHITE, SLATE_50]),
    ]))
    story.append(nt)
    story.append(PageBreak())

    # ── 2. Uploading Documents ─────────────────────────────────────────────────
    story.append(H1("2. Uploading Documents"))
    story.append(H2("2.1  Single File Upload — Upload & AI Fill (Recommended)"))
    story.append(box(
        "Upload & AI Fill is the fastest way to add documents. The AI reads your document "
        "(including Arabic), fills in the details automatically, and presents a pre-filled form "
        "for you to review. You confirm the details and click Approve & Save.",
        GREEN_L, GREEN))
    story.append(SP(8))
    story += step_flow([
        ("Go to DMS Inbox", "Navigate to <b>/dms/inbox</b> or click <b>Upload Inbox</b> in the sidebar."),
        ("Select your file", "Drag-and-drop your document onto the upload area, or click to browse. Supported: PDF, JPEG, PNG, TIFF, DOCX."),
        ("Click Upload & AI Fill", "Click the purple <b>Upload &amp; AI Fill</b> button. The system uploads the file and runs AI analysis automatically."),
        ("Wait for AI processing", "The system runs OCR (reading the document), AI classification (identifying the document type), and field extraction (finding dates, names, numbers). This takes 5-15 seconds."),
        ("Review the AI-filled form", "You are taken to the intake review page. The form is pre-filled by AI. <b>Check every field carefully</b> — AI is highly accurate but not perfect."),
        ("Edit any incorrect fields", "Click on any field to change the AI-suggested value. All fields are editable."),
        ("Click Approve & Save", "When satisfied, click <b>Approve &amp; Save</b>. The document is stored securely in the repository."),
    ])
    story.append(SP(8))
    story.append(H2("2.2  Understanding the AI Review Screen"))
    ai_parts = [
        ("Confidence Badges", "High (green), Medium (amber), Low (orange), Needs Review (red). Low confidence = check that field more carefully."),
        ("Source Snippets",   "Small text excerpts show exactly where in the document each value was found."),
        ("AI Summary",        "A brief description of the document generated by AI — useful for quick verification."),
        ("AI Pipeline Card",  "If full orchestration is enabled, shows progress of: Summary, Intelligence, Embedding, Tags, Links."),
        ("Duplicate Warning", "If the system detects a possible duplicate, a warning appears. Review before approving."),
    ]
    pt = Table([[Paragraph(f"<b>{k}</b>", S["body"]), Paragraph(v, S["body"])] for k,v in ai_parts],
               colWidths=[4.5*cm, 11*cm])
    pt.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(0,-1), VIOLET_L),
        ("FONTSIZE",(0,0),(-1,-1), 9), ("TOPPADDING",(0,0),(-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5), ("LEFTPADDING",(0,0),(-1,-1), 8),
        ("GRID",(0,0),(-1,-1), 0.3, SLATE_200),
        ("ROWBACKGROUNDS",(0,0),(-1,-1), [WHITE, VIOLET_L]),
    ]))
    story.append(pt)
    story.append(PageBreak())

    # ── 3. Arabic Documents ─────────────────────────────────────────────────────
    story.append(H1("3. Working with Arabic Documents"))
    story.append(PJ(
        "The ALGT ERP DMS has full Arabic language support. You can upload Arabic documents "
        "and the AI will read, extract, and display information in both Arabic and English."
    ))
    story.append(SP(8))
    story.append(H2("3.1  What the AI Extracts from Arabic Documents"))
    ar_fields = [
        ("Arabic Name (اسم بالعربية)",    "Full name in Arabic script — preserved exactly as on the document"),
        ("English Name",                   "English transliteration or English version of the name"),
        ("Arabic Company Name",            "Official Arabic legal name of the company"),
        ("Hijri Date (تاريخ هجري)",        "AI detects Hijri dates and converts to Gregorian"),
        ("Arabic Address (العنوان)",        "Full address in Arabic"),
        ("Arabic Activities (النشاط)",     "Business activities in Arabic from trade license"),
        ("Arabic-only documents",          "For documents with no English text, AI generates English explanation"),
    ]
    at = Table([[Paragraph(f"<b>{k}</b>", S["body"]), Paragraph(v, S["body"])] for k,v in ar_fields],
               colWidths=[5*cm, 10.5*cm])
    at.setStyle(TableStyle([
        ("FONTSIZE",(0,0),(-1,-1), 9), ("TOPPADDING",(0,0),(-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5), ("LEFTPADDING",(0,0),(-1,-1), 8),
        ("GRID",(0,0),(-1,-1), 0.3, SLATE_200),
        ("BACKGROUND",(0,0),(0,-1), SLATE_100),
        ("ROWBACKGROUNDS",(0,0),(-1,-1), [WHITE, SLATE_50]),
    ]))
    story.append(at)
    story.append(SP(8))
    story.append(H2("3.2  Tips for Best Arabic OCR Results"))
    story.append(OK("Use clear, high-resolution scans (300 DPI or higher) for the best results"))
    story.append(OK("Ensure the document is scanned flat — avoid angles or shadows"))
    story.append(OK("PDF format is preferred over JPEG for text preservation"))
    story.append(OK("Both printed Arabic and handwritten Arabic are supported"))
    story.append(OK("Bilingual documents (Arabic + English) are handled automatically"))
    story.append(SP(4))
    story.append(Note(
        "If Arabic text appears as squares or question marks in the extracted text field, "
        "click <b>Re-run OCR (AI)</b> on the document's OCR tab. The AI vision engine will "
        "re-read the document and extract the Arabic text correctly."
    ))
    story.append(PageBreak())

    # ── 4. Batch Upload ─────────────────────────────────────────────────────────
    story.append(H1("4. Batch Upload"))
    story.append(PJ(
        "Batch upload lets you upload multiple documents at once. The AI processes "
        "each file automatically and creates a draft for each. You then review and "
        "approve each document one-by-one — bulk approval is not available."
    ))
    story.append(SP(8))
    story += step_flow([
        ("Go to Upload Inbox",      "Navigate to <b>/dms/inbox</b>. Click the <b>Batch</b> toggle at the top."),
        ("Select multiple files",   "Drop multiple files onto the upload area or click to select. Maximum 10 files per batch."),
        ("Start Batch AI Fill",     "Click <b>Start Batch AI Fill</b>. The system processes each file with AI."),
        ("Navigate to Batch Queue", "After processing, click <b>Review Batch</b> or go to <b>/dms/inbox/batches</b>."),
        ("Review each draft",       "Click <b>Review &amp; Approve</b> on each draft. You are taken to the full intake review screen."),
        ("Approve one at a time",   "Review the AI-filled form, make any corrections, and click <b>Approve &amp; Save</b>. Repeat for each document."),
    ])
    story.append(SP(6))
    story.append(Warn(
        "Important: You must approve each document individually. There is no 'Approve All' button. "
        "Each document requires your personal review and confirmation before it becomes active."
    ))
    story.append(PageBreak())

    # ── 5. Document Repository ──────────────────────────────────────────────────
    story.append(H1("5. Document Repository"))
    story.append(H2("5.1  Browsing and Searching Documents"))
    story.append(B("Go to <b>/dms/documents</b> to see all documents you have access to"))
    story.append(B("Use the <b>Search bar</b> at the top to find documents by title, number, or content"))
    story.append(B("Use <b>Filters</b> to narrow by document type, category, date range, status, or risk level"))
    story.append(SP(8))
    story.append(H2("5.2  Search Modes"))
    modes = [
        ("Quick Search",   "Auto", "Fast text search on document number and title"),
        ("Safe Search",    "Magnifying glass", "Full-text search within extracted document content"),
        ("Content Search", "Page icon", "Deep search within complete document text"),
        ("AI Search",      "Brain icon", "Describe what you are looking for in plain language — AI finds relevant documents"),
        ("Semantic Search","Compass icon", "Find documents similar in meaning to a query phrase"),
    ]
    mt = Table([[P(n), Paragraph(f"<i>{i}</i>", S["body"]), P(d)] for n,i,d in modes],
               colWidths=[4.5*cm, 4*cm, 7*cm])
    mt.setStyle(TableStyle([
        ("FONTSIZE",(0,0),(-1,-1), 9), ("TOPPADDING",(0,0),(-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5), ("LEFTPADDING",(0,0),(-1,-1), 7),
        ("GRID",(0,0),(-1,-1), 0.3, SLATE_200),
        ("BACKGROUND",(0,0),(0,-1), DARK), ("TEXTCOLOR",(0,0),(0,-1), WHITE),
        ("ROWBACKGROUNDS",(0,0),(-1,-1), [WHITE, SLATE_50]),
    ]))
    story.append(mt)
    story.append(SP(4))
    story.append(Note("AI Search and Semantic Search understand Arabic queries. Try searching in Arabic: محمد للتجارة or رخصة تجارية"))
    story.append(SP(8))
    story.append(H2("5.3  Ask AI — Ask Questions About a Document"))
    story.append(P("Open any document → click the <b>Ask AI</b> tab → type a question in English or Arabic:"))
    story.append(B('"What is the expiry date of this document?" → AI answers from the document content'))
    story.append(B('"ما هو رقم الترخيص؟" → AI answers in Arabic from the Arabic text in the document'))
    story.append(B('"Is this document still valid?" → AI checks dates and gives a clear answer'))
    story.append(SP(4))
    story.append(Note("Ask AI uses only the content of the specific document you have open. It never invents information."))
    story.append(PageBreak())

    # ── 6. Document Record ─────────────────────────────────────────────────────
    story.append(H1("6. Document Record — Sections"))
    story.append(P("Click any document in the repository to open its full record. The record has multiple sections:"))
    story.append(SP(8))
    sections = [
        ("Overview",       "Basic info: document number, title, type, dates, status, confidentiality level, owning company/branch."),
        ("Metadata",       "Custom fields specific to this document type (e.g. license number, TRN, ID number, expiry date)."),
        ("Links",          "ERP entities linked to this document: parties, companies, employees. AI Smart Links suggests links."),
        ("Tags",           "Tags applied to this document. AI Auto-Tags suggests relevant tags from the tag library."),
        ("Versions",       "Full version history. Upload a new version to replace the current file while keeping history."),
        ("Files",          "All files attached to this document. Preview, download, or view OCR results per file."),
        ("Expiry",         "Expiry date, reminder schedule, and renewal request management."),
        ("OCR / Text",     "Raw extracted text from the document. View or download. Run OCR here if text is missing."),
        ("AI Summary",     "AI-generated 3-5 sentence summary of the document. Regenerate if needed."),
        ("Intelligence",   "Completeness score (how complete the metadata is) and Risk score (expiry/missing data risk)."),
        ("AI Analysis",    "Detailed AI classification and field extraction results with confidence scores."),
        ("Semantic",       "Document embedding status. Find Similar Documents using AI semantic search."),
        ("Comments",       "Internal comments and notes on the document — visible to authorized users only."),
        ("Audit",          "Complete audit trail: who created, edited, viewed, or changed the document."),
    ]
    st = Table([[Paragraph(f"<b>{s}</b>", S["body"]), Paragraph(d, ParagraphStyle("dd", fontSize=8.5, textColor=SLATE_600, fontName="Helvetica", leading=12))] for s,d in sections],
               colWidths=[3.5*cm, 12*cm])
    st.setStyle(TableStyle([
        ("FONTSIZE",(0,0),(-1,-1), 9), ("TOPPADDING",(0,0),(-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5), ("LEFTPADDING",(0,0),(-1,-1), 7),
        ("GRID",(0,0),(-1,-1), 0.3, SLATE_200),
        ("BACKGROUND",(0,0),(0,-1), DARK), ("TEXTCOLOR",(0,0),(0,-1), WHITE),
        ("ROWBACKGROUNDS",(0,0),(-1,-1), [WHITE, SLATE_50]),
    ]))
    story.append(st)
    story.append(PageBreak())

    # ── 7. Uploading New Version ────────────────────────────────────────────────
    story.append(H1("7. Uploading a New Document Version"))
    story.append(PJ(
        "When a document is renewed (e.g. trade license renewed for another year), "
        "upload the new version instead of creating a new document. This preserves "
        "the document history and all linked entities."
    ))
    story.append(SP(8))
    story += step_flow([
        ("Open the document record", "Find the document in the repository and click to open it."),
        ("Go to Versions tab",       "Click the <b>Versions</b> tab in the left section navigation."),
        ("Click Upload New Version", "Click <b>Upload New Version</b> — the file selector appears."),
        ("Select the new file",      "Choose the renewed/updated document file."),
        ("Add version notes",        "Enter a brief note like 'Renewed 2026 — valid until Dec 2027'."),
        ("Confirm upload",           "The new file becomes the current version. Old versions remain in history."),
    ])
    story.append(SP(6))
    story.append(Note("After uploading a new version, update the expiry date in the Overview tab if the renewal extends the validity period."))
    story.append(PageBreak())

    # ── 8. Expiry Tracking ─────────────────────────────────────────────────────
    story.append(H1("8. Expiry Tracking and Renewals"))
    story.append(H2("8.1  Expiry Dashboard"))
    story.append(B("Go to <b>/dms/expiring</b> to see all expiry-tracked documents"))
    story.append(B("9 summary cards show counts by expiry urgency: Expired, 90/60/30/14/7/1 days, Missing, Total"))
    story.append(B("Four tabs: Expired / Expiring Soon / Missing Expiry / Renewal Requests"))
    story.append(SP(8))
    story.append(H2("8.2  What to Do with Expiring Documents"))
    urgency = [
        ("90 days",  "AMBER",  "Plan renewal — contact the issuing authority"),
        ("60 days",  "AMBER",  "Begin the renewal process — submit applications"),
        ("30 days",  "ORANGE", "Renewal must be in progress — follow up"),
        ("14 days",  "RED",    "Urgent — escalate if renewal not confirmed"),
        ("7 days",   "RED",    "Critical — document may be unusable after this"),
        ("Expired",  "RED",    "Immediate action — check if operations are affected"),
    ]
    et = Table([[Paragraph(f"<b>{d}</b>", S["body"]),
                 Paragraph(f"<font color='{'#B45309' if u in ('AMBER','ORANGE') else '#B91C1C'}'><b>{u}</b></font>", S["body"]),
                 Paragraph(a, S["body"])] for d,u,a in urgency],
               colWidths=[3*cm, 3*cm, 9.5*cm])
    et.setStyle(TableStyle([
        ("FONTSIZE",(0,0),(-1,-1), 9), ("TOPPADDING",(0,0),(-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5), ("LEFTPADDING",(0,0),(-1,-1), 7),
        ("GRID",(0,0),(-1,-1), 0.3, SLATE_200),
        ("ROWBACKGROUNDS",(0,0),(-1,-1), [WHITE, SLATE_50]),
    ]))
    story.append(et)
    story.append(SP(8))
    story.append(H2("8.3  Starting a Renewal Request"))
    story.append(B("Open the expiring document → <b>Expiry</b> tab → click <b>Start Renewal</b>"))
    story.append(B("Fill in renewal details: expected renewal date, notes"))
    story.append(B("Track status: draft → requested → in_progress → renewed"))
    story.append(B("Once renewed, upload the new document as a new version and mark the renewal Complete"))
    story.append(PageBreak())

    # ── 9. AI Features for Users ───────────────────────────────────────────────
    story.append(H1("9. AI Features for Users"))
    story.append(H2("9.1  AI Document Summary"))
    story.append(PJ(
        "Every document automatically receives a 3-5 sentence AI summary. "
        "It appears in the <b>AI Summary</b> tab and is shown in search results. "
        "The summary preserves Arabic names in Arabic script."
    ))
    story.append(B("If a summary is missing: Open the document → AI Summary tab → click <b>Generate Summary</b>"))
    story.append(SP(8))

    story.append(H2("9.2  AI Risk and Completeness"))
    story.append(B("<b>Completeness Score</b> — How complete the document metadata is (0-100%). Low = missing important fields."))
    story.append(B("<b>Risk Score</b> — Based on: expired document, missing expiry, low confidence extraction, missing content."))
    story.append(B("Risk Levels: None (green) / Low / Medium / High / Critical (red)"))
    story.append(B("View in: Intelligence tab on any document record"))
    story.append(B("High/Critical risk documents appear highlighted in search results"))
    story.append(SP(8))

    story.append(H2("9.3  AI Tag Suggestions"))
    story.append(B("Open document → Tags tab → click <b>Suggest Tags</b>"))
    story.append(B("AI suggests tags with confidence scores based on document content and type"))
    story.append(B("Click <b>Accept</b> on tags that are relevant, <b>Reject</b> on any that are wrong"))
    story.append(B("Tags help with searching and filtering the document repository"))
    story.append(SP(8))

    story.append(H2("9.4  Smart Links — Link Documents to ERP Entities"))
    story.append(B("Open document → Links tab → click <b>Suggest Links</b>"))
    story.append(B("AI identifies companies, parties, or organizations mentioned in the document"))
    story.append(B("Reviews matches from the Party Master (including Arabic company names)"))
    story.append(B("Accept links to connect the document to the correct ERP party record"))
    story.append(SP(4))
    story.append(Note("Arabic company names are matched correctly: محمد للتجارة will match the Arabic name in the party record even if the display name is English."))
    story.append(PageBreak())

    # ── 10. Find Similar Documents ──────────────────────────────────────────────
    story.append(H1("10. Finding Similar Documents"))
    story.append(PJ(
        "The Semantic Search feature lets you find documents that are similar in content "
        "to any document you are viewing. This is useful for identifying duplicates, "
        "finding related contracts, or grouping similar certificates."
    ))
    story.append(SP(8))
    story.append(H2("10.1  From a Document Record"))
    story.append(B("Open any document → <b>Semantic</b> tab"))
    story.append(B("Click <b>Find Similar Documents</b>"))
    story.append(B("The system shows up to 10 documents most similar in content, with a similarity percentage"))
    story.append(SP(8))
    story.append(H2("10.2  Semantic Search in the Repository"))
    story.append(B("Go to <b>/dms/documents</b>"))
    story.append(B("Select <b>Semantic Search</b> mode (Compass icon)"))
    story.append(B("Type a description: 'Trade license for construction company in Dubai'"))
    story.append(B("The AI finds the most semantically similar documents even if the exact words don't match"))
    story.append(SP(4))
    story.append(Note("Semantic search works in Arabic too. Try: 'رخصة تجارية للمقاولات في دبي' to find Arabic construction trade licenses."))
    story.append(PageBreak())

    # ── 11. DMS Notifications ──────────────────────────────────────────────────
    story.append(H1("11. Notifications"))
    story.append(PJ(
        "DMS notifications keep you informed about expiring documents and important "
        "document events. Check your notifications regularly to stay ahead of renewals."
    ))
    story.append(H2("11.1  Viewing Notifications"))
    story.append(B("Go to <b>/dms/notifications</b> to see all DMS notifications"))
    story.append(B("Notifications are grouped by: Unread / All / Expiring / Expired / Renewal"))
    story.append(B("Click on any notification to go directly to the relevant document"))
    story.append(SP(8))
    story.append(H2("11.2  Notification Types"))
    notifs = [
        ("Expiry Warning 90 days",  "Early notice — document expires in about 3 months"),
        ("Expiry Warning 60 days",  "Planning notice — begin renewal process"),
        ("Expiry Warning 30 days",  "Action required — 30 days to expiry"),
        ("Expiry Warning 14 days",  "Urgent — escalate if not being renewed"),
        ("Expiry Warning 7 days",   "Critical — last week before expiry"),
        ("Expiry Warning 1 day",    "Final warning — document expires tomorrow"),
        ("Document Expired",        "The document has expired — immediate action needed"),
        ("Renewal Requested",       "A renewal request has been submitted for your document"),
    ]
    nt = Table([[Paragraph(f"<b>{t}</b>", S["body"]), Paragraph(d, ParagraphStyle("nd", fontSize=8.5, textColor=SLATE_600, fontName="Helvetica", leading=12))] for t,d in notifs],
               colWidths=[5*cm, 10.5*cm])
    nt.setStyle(TableStyle([
        ("FONTSIZE",(0,0),(-1,-1), 9), ("TOPPADDING",(0,0),(-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5), ("LEFTPADDING",(0,0),(-1,-1), 7),
        ("GRID",(0,0),(-1,-1), 0.3, SLATE_200),
        ("BACKGROUND",(0,0),(0,-1), SLATE_100),
        ("ROWBACKGROUNDS",(0,0),(-1,-1), [WHITE, SLATE_50]),
    ]))
    story.append(nt)
    story.append(PageBreak())

    # ── 12. Confidentiality ─────────────────────────────────────────────────────
    story.append(H1("12. Document Confidentiality"))
    story.append(PJ(
        "Every document has a confidentiality level. Make sure you set the correct level "
        "when uploading sensitive documents like HR records, legal agreements, or executive reports."
    ))
    conf = [
        ("internal",   "Normal business documents — all ERP users can view"),
        ("company",    "Company-restricted — management and above"),
        ("finance",    "Finance team restricted — finance team and above"),
        ("hr",         "HR restricted — HR team and above"),
        ("legal",      "Legal restricted — legal team and above"),
        ("executive",  "Executive only — senior leadership only"),
    ]
    ct = Table([[Paragraph(f"<b>{c}</b>", S["body"]), Paragraph(d, S["body"])] for c,d in conf],
               colWidths=[3.5*cm, 12*cm])
    ct.setStyle(TableStyle([
        ("FONTSIZE",(0,0),(-1,-1), 9), ("TOPPADDING",(0,0),(-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5), ("LEFTPADDING",(0,0),(-1,-1), 7),
        ("GRID",(0,0),(-1,-1), 0.3, SLATE_200),
        ("BACKGROUND",(0,0),(0,-1), DARK), ("TEXTCOLOR",(0,0),(0,-1), WHITE),
        ("ROWBACKGROUNDS",(0,0),(-1,-1), [WHITE, SLATE_50]),
    ]))
    story.append(ct)
    story.append(SP(6))
    story.append(Warn("HR, Legal, and Executive documents require DMS Admin access to run AI analysis or generate summaries. Contact your administrator if you need these features on restricted documents."))
    story.append(PageBreak())

    # ── 13. Quick Reference ─────────────────────────────────────────────────────
    story.append(H1("13. Quick Reference"))
    story.append(SP(4))

    # Column 1: common actions
    col1 = [
        ("Upload a new document",      "Go to /dms/inbox → Upload & AI Fill"),
        ("Upload multiple documents",  "Go to /dms/inbox → Batch mode"),
        ("Search for a document",      "Go to /dms/documents → use search bar"),
        ("Find documents by content",  "Use Content Search or AI Search mode"),
        ("Ask a question about a doc", "Open document → Ask AI tab"),
        ("Find similar documents",     "Open document → Semantic tab → Find Similar"),
        ("Generate AI summary",        "Open document → AI Summary tab → Generate Summary"),
        ("Run OCR on a document",      "Open document → OCR tab → Run OCR (AI)"),
        ("Check expiring documents",   "Go to /dms/expiring"),
        ("Start a renewal request",    "Open document → Expiry tab → Start Renewal"),
        ("Upload a new version",       "Open document → Versions tab → Upload New Version"),
        ("Add tags to a document",     "Open document → Tags tab → Accept AI suggestions or add manually"),
        ("Link document to a party",   "Open document → Links tab → Suggest Links → Accept"),
        ("Download a document",        "Open document → Files tab → Download button"),
        ("Check AI risk score",        "Open document → Intelligence tab"),
        ("View audit trail",           "Open document → Audit tab"),
    ]
    qr_t = Table([[Paragraph(f"<b>{t}</b>", S["body"]), Paragraph(a, S["body"])] for t,a in col1],
                 colWidths=[6*cm, 9.5*cm])
    qr_t.setStyle(TableStyle([
        ("FONTSIZE",(0,0),(-1,-1), 9), ("TOPPADDING",(0,0),(-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5), ("LEFTPADDING",(0,0),(-1,-1), 7),
        ("GRID",(0,0),(-1,-1), 0.3, SLATE_200),
        ("BACKGROUND",(0,0),(0,-1), DARK), ("TEXTCOLOR",(0,0),(0,-1), WHITE),
        ("ROWBACKGROUNDS",(0,0),(-1,-1), [WHITE, SLATE_50]),
    ]))
    story.append(qr_t)
    story.append(SP(16))
    story.append(HR())
    story.append(Paragraph(
        "DMS User Manual · Version 1.0 · Alliance Gulf Transport Group · Internal Use Only",
        ParagraphStyle("end", fontSize=8, textColor=SLATE_400, fontName="Helvetica", alignment=TA_CENTER)))
    story.append(Paragraph(
        f"Generated: {datetime.date.today().strftime('%d %B %Y')}",
        ParagraphStyle("end2", fontSize=8, textColor=SLATE_400, fontName="Helvetica", alignment=TA_CENTER)))
    return story

def main():
    doc = SimpleDocTemplate(OUTPUT_PATH, pagesize=A4,
        rightMargin=1.5*cm, leftMargin=1.5*cm, topMargin=2.5*cm, bottomMargin=1.8*cm,
        title="DMS User Manual — ALGT ERP",
        author="ALGT ERP Engineering")
    story = []
    story.extend(build_cover())
    story.extend(build_content())
    doc.build(story, onFirstPage=on_cover, onLaterPages=on_page)
    print(f"User manual generated: {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
