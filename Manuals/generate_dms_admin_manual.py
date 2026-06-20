"""
ALGT ERP — DMS Admin Manual Generator
Output: Manuals/DMS_Admin_Manual.pdf
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
import datetime

OUTPUT_PATH = r"Manuals\DMS_Admin_Manual.pdf"

# ── Colors ─────────────────────────────────────────────────────────────────────
DARK      = colors.HexColor("#0F172A")
BLUE      = colors.HexColor("#1D4ED8")
BLUE_L    = colors.HexColor("#EFF6FF")
VIOLET    = colors.HexColor("#7C3AED")
GREEN     = colors.HexColor("#15803D")
GREEN_L   = colors.HexColor("#F0FDF4")
AMBER     = colors.HexColor("#B45309")
AMBER_L   = colors.HexColor("#FFFBEB")
RED       = colors.HexColor("#B91C1C")
RED_L     = colors.HexColor("#FEF2F2")
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
    canvas_obj.drawString(1.5*cm, h-1.0*cm, "ALGT ERP — DMS Administrator Manual")
    canvas_obj.setFillColor(SLATE_400)
    canvas_obj.setFont("Helvetica", 7)
    canvas_obj.drawRightString(w-1.5*cm, h-1.0*cm, f"Admin Reference · {datetime.date.today().strftime('%B %Y')}")
    canvas_obj.setFillColor(SLATE_200)
    canvas_obj.rect(0, 0, w, 1.0*cm, fill=1, stroke=0)
    canvas_obj.setFillColor(SLATE_600)
    canvas_obj.setFont("Helvetica", 7)
    if doc.page > 1:
        canvas_obj.drawCentredString(w/2, 0.35*cm, f"Page {doc.page}")
    canvas_obj.drawString(1.5*cm, 0.35*cm, "Alliance Gulf Transport Group · Internal Use Only")
    canvas_obj.restoreState()

def on_cover(canvas_obj, doc): pass

# ── Styles ─────────────────────────────────────────────────────────────────────
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
    "code": ParagraphStyle("code",parent=base["Code"], fontSize=8, fontName="Courier",
                            backColor=SLATE_100, spaceAfter=4, leading=12, leftIndent=8, borderPad=5),
    "note": ParagraphStyle("note",parent=base["Normal"], fontSize=9, textColor=AMBER,
                            spaceAfter=5, leading=13, fontName="Helvetica", leftIndent=12),
    "warn": ParagraphStyle("warn",parent=base["Normal"], fontSize=9, textColor=RED,
                            spaceAfter=5, leading=13, fontName="Helvetica", leftIndent=12),
    "ok":   ParagraphStyle("ok",  parent=base["Normal"], fontSize=9, textColor=GREEN,
                            spaceAfter=5, leading=13, fontName="Helvetica", leftIndent=12),
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

def box(text, bg=BLUE_L, left_color=BLUE):
    t = Table([[Paragraph(text, S["body"])]], colWidths=["100%"])
    t.setStyle(TableStyle([
        ("BACKGROUND",  (0,0),(-1,-1), bg),
        ("LINEBEFORE",  (0,0),(0,-1), 4, left_color),
        ("TOPPADDING",  (0,0),(-1,-1), 9),
        ("BOTTOMPADDING",(0,0),(-1,-1), 9),
        ("LEFTPADDING", (0,0),(-1,-1), 12),
        ("RIGHTPADDING",(0,0),(-1,-1), 10),
    ]))
    return t

def kv_table(rows, w1=5*cm, w2=10.5*cm):
    data = [[Paragraph(f"<b>{k}</b>", S["body"]), Paragraph(v, S["body"])] for k,v in rows]
    t = Table(data, colWidths=[w1, w2])
    t.setStyle(TableStyle([
        ("BACKGROUND",  (0,0),(0,-1), SLATE_100),
        ("FONTSIZE",    (0,0),(-1,-1), 9),
        ("TOPPADDING",  (0,0),(-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5),
        ("LEFTPADDING", (0,0),(-1,-1), 8),
        ("GRID",        (0,0),(-1,-1), 0.3, SLATE_200),
        ("ROWBACKGROUNDS",(0,0),(-1,-1), [WHITE, SLATE_50]),
    ]))
    return t

def route_table(rows):
    header = [Paragraph(f"<b>{c}</b>", S["body"]) for c in ["Route / URL", "Description", "Permission Required"]]
    data = [header] + [[Paragraph(c, S["body"]) for c in row] for row in rows]
    t = Table(data, colWidths=[5*cm, 6.5*cm, 4*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND",  (0,0),(-1,0), DARK),
        ("TEXTCOLOR",   (0,0),(-1,0), WHITE),
        ("FONTNAME",    (0,0),(-1,0), "Helvetica-Bold"),
        ("FONTSIZE",    (0,0),(-1,-1), 8.5),
        ("TOPPADDING",  (0,0),(-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5),
        ("LEFTPADDING", (0,0),(-1,-1), 6),
        ("GRID",        (0,0),(-1,-1), 0.3, SLATE_200),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [WHITE, SLATE_50]),
    ]))
    return t

# ══════════════════════════════════════════════════════════════════════════════
# COVER
# ══════════════════════════════════════════════════════════════════════════════
def build_cover():
    story = []
    top = Table([[""]], colWidths=["100%"], rowHeights=[4*cm])
    top.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1), DARK)]))
    story.append(top)
    story.append(SP(20))
    story.append(Paragraph("📂", ParagraphStyle("icon", fontSize=40, alignment=TA_CENTER, spaceAfter=8, leading=48)))
    story.append(Paragraph("DMS Administrator Manual",
        ParagraphStyle("cov", fontSize=28, textColor=DARK, fontName="Helvetica-Bold",
                        alignment=TA_CENTER, spaceAfter=6, leading=34)))
    story.append(Paragraph("Document Management System — Admin Reference Guide",
        ParagraphStyle("covs", fontSize=13, textColor=SLATE_600, fontName="Helvetica",
                        alignment=TA_CENTER, spaceAfter=16, leading=18)))
    story.append(HRFlowable(width="60%", thickness=2, color=BLUE, hAlign="CENTER", spaceAfter=20))
    meta = [
        ("System",    "ALGT ERP — Document Management System (DMS)"),
        ("Audience",  "System Administrators, DMS Administrators"),
        ("Manual",    "Manual 1 of 2 — Administrator Reference"),
        ("Version",   "1.0"),
        ("Date",      datetime.date.today().strftime("%d %B %Y")),
        ("Classification", "Internal — Confidential"),
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
        "This manual covers all DMS administrative functions including: "
        "document categories, types, metadata definitions, tags, retention policies, "
        "AI intelligence administration, feature flag management, RLS security, "
        "and system-level configuration.",
        BLUE_L, BLUE))
    story.append(PageBreak())
    return story

# ══════════════════════════════════════════════════════════════════════════════
# CONTENT
# ══════════════════════════════════════════════════════════════════════════════
def build_content():
    story = []

    # ── 1. Overview ────────────────────────────────────────────────────────────
    story.append(H1("1. DMS Module Overview"))
    story.append(PJ(
        "The ALGT ERP Document Management System (DMS) is the central repository for all "
        "business documents. It provides secure document storage, AI-powered OCR and extraction, "
        "expiry tracking, compliance management, and full audit trails. As an administrator, "
        "you control the document taxonomy, access policies, AI features, and system health."
    ))
    story.append(SP())
    story.append(H2("1.1  Admin Navigation"))
    story.append(P("Access all admin functions at: <b>/admin/dms</b>"))
    story.append(route_table([
        ["/admin/dms",                      "DMS Admin Overview dashboard",               "dms.admin"],
        ["/admin/dms/categories",           "Document Categories CRUD",                   "dms.admin"],
        ["/admin/dms/document-types",       "Document Types CRUD",                        "dms.admin"],
        ["/admin/dms/metadata-definitions", "Metadata Field Definitions",                 "dms.admin"],
        ["/admin/dms/tags",                 "Global Tag Library",                          "dms.admin"],
        ["/admin/dms/retention-policies",   "Retention & Archive Policies",               "dms.admin"],
        ["/admin/dms/intelligence",         "AI Intelligence Admin & Health Dashboard",   "dms.admin"],
        ["/admin/settings/ai",              "AI Provider Configuration",                  "settings.ai.manage"],
    ]))
    story.append(PageBreak())

    # ── 2. Document Categories ──────────────────────────────────────────────────
    story.append(H1("2. Document Categories"))
    story.append(PJ(
        "Document categories are the top-level groupings for document types. "
        "Every document type must belong to one category. Categories appear in the "
        "DMS upload interface to guide users in selecting the correct document type."
    ))
    story.append(SP(6))
    story.append(H2("2.1  Managing Categories"))
    story.append(B("Go to <b>/admin/dms/categories</b>"))
    story.append(B("Click <b>New Category</b> to add a category"))
    story.append(B("Click the edit icon to rename or reorder an existing category"))
    story.append(B("Toggle <b>Active/Inactive</b> to hide categories without deleting them"))
    story.append(SP(8))
    story.append(H2("2.2  Category Fields"))
    story.append(kv_table([
        ("Category Code",   "Unique uppercase code, e.g. IDENTITY, HR, LEGAL, FINANCE"),
        ("Name (English)",  "Display name shown in UI dropdown"),
        ("Name (Arabic)",   "Arabic display name for bilingual UI (optional)"),
        ("Description",     "Brief description of what document types this category contains"),
        ("Sort Order",      "Number controlling display order in lists (lower = first)"),
        ("Is Active",       "Inactive categories are hidden from the upload interface"),
    ]))
    story.append(SP(6))
    story.append(H2("2.3  Recommended Category Structure"))
    cats = [
        ("IDENTITY",   "Identity Documents",  "Emirates ID, Passport, Visa, Residence Permit"),
        ("HR",         "Human Resources",     "Labor Contracts, Salary Certificates, Medical Fitness"),
        ("LEGAL",      "Legal Documents",     "Contracts, Agreements, Power of Attorney, Court Orders"),
        ("FINANCE",    "Finance Documents",   "Invoices, Bank Statements, VAT Certificates"),
        ("COMPLIANCE", "Compliance",          "Trade Licenses, Permits, Certifications"),
        ("OPERATIONS", "Operations",          "Technical Reports, Inspection Reports, Work Permits"),
        ("GENERAL",    "General",             "Miscellaneous documents"),
    ]
    ct = Table([[Paragraph(f"<b>{c}</b>",S["body"]), Paragraph(n,S["body"]), Paragraph(d,S["body"])] for c,n,d in cats],
               colWidths=[3.5*cm, 4.5*cm, 7.5*cm])
    ct.setStyle(TableStyle([
        ("FONTSIZE",(0,0),(-1,-1), 9), ("TOPPADDING",(0,0),(-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5), ("LEFTPADDING",(0,0),(-1,-1), 7),
        ("GRID",(0,0),(-1,-1), 0.3, SLATE_200),
        ("BACKGROUND",(0,0),(0,-1), DARK), ("TEXTCOLOR",(0,0),(0,-1), WHITE),
        ("ROWBACKGROUNDS",(0,0),(-1,-1), [WHITE, SLATE_50]),
    ]))
    story.append(ct)
    story.append(PageBreak())

    # ── 3. Document Types ───────────────────────────────────────────────────────
    story.append(H1("3. Document Types"))
    story.append(PJ(
        "Document types define the specific kind of document (e.g. Trade License, Emirates ID, "
        "Tax Invoice). Each type belongs to a category and controls which metadata fields "
        "are collected during upload and review."
    ))
    story.append(H2("3.1  Managing Document Types"))
    story.append(B("Go to <b>/admin/dms/document-types</b>"))
    story.append(B("Click <b>New Document Type</b> and fill in the required fields"))
    story.append(B("Assign the type to an appropriate Category"))
    story.append(B("Enable <b>Requires Expiry Tracking</b> for documents that expire (IDs, licenses, permits)"))
    story.append(SP(8))
    story.append(H2("3.2  Document Type Fields"))
    story.append(kv_table([
        ("Type Code",              "Unique uppercase code, e.g. TRADE_LICENSE, EMIRATES_ID"),
        ("Name (English)",         "English display name"),
        ("Name (Arabic)",          "Arabic display name (للمستندات العربية)"),
        ("Category",               "Parent category this type belongs to"),
        ("Description",            "Explains what this document type is used for"),
        ("Requires Expiry Tracking","ON for IDs, licenses, permits that expire. Enables expiry alerts."),
        ("Expiry Alert Days",      "Days before expiry to start showing alerts (default: 30/60/90)"),
        ("Default Confidentiality","internal / company / finance / hr / legal / executive"),
        ("Is Active",              "Inactive types are hidden from the upload interface"),
        ("Sort Order",             "Display order within the category"),
    ]))
    story.append(SP(6))
    story.append(H2("3.3  Built-in UAE Document Types"))
    story.append(P("The following types are pre-seeded in the system (DMS ARABIC FIX.1):"))
    uae_types = [
        ("EMIRATES_ID",          "بطاقة الهوية الإماراتية", "Yes", "Biometric UAE ID card"),
        ("PASSPORT",             "جواز سفر",                "Yes", "International travel document"),
        ("TRADE_LICENSE",        "رخصة تجارية",             "Yes", "Commercial trade license"),
        ("VISA_RESIDENCE",       "تأشيرة / إقامة",          "Yes", "UAE visa and residency permit"),
        ("LABOR_CONTRACT_AR",    "عقد عمل",                 "No",  "Employment contract (Arabic)"),
        ("SALARY_CERTIFICATE_AR","شهادة راتب",              "No",  "Salary/income certificate"),
        ("EJARI_CONTRACT",       "عقد إيجار مسجل",          "Yes", "EJARI registered tenancy"),
        ("VAT_CERTIFICATE",      "شهادة ضريبية",            "No",  "VAT registration certificate"),
        ("TRN_CERTIFICATE",      "شهادة الرقم الضريبي",     "No",  "Tax registration number cert"),
        ("POWER_OF_ATTORNEY",    "وكالة قانونية",           "No",  "Legal power of attorney"),
    ]
    ut = Table([[P(c), Paragraph(f"<b>{ar}</b>", ParagraphStyle("ar", fontSize=9, fontName="Helvetica-Bold", textColor=DARK, leading=12)), P(e), P(d)] for c,ar,e,d in uae_types],
               colWidths=[4.5*cm, 4*cm, 1.5*cm, 5.5*cm])
    ut.setStyle(TableStyle([
        ("FONTSIZE",(0,0),(-1,-1), 8.5), ("TOPPADDING",(0,0),(-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5), ("LEFTPADDING",(0,0),(-1,-1), 6),
        ("GRID",(0,0),(-1,-1), 0.3, SLATE_200),
        ("ROWBACKGROUNDS",(0,0),(-1,-1), [WHITE, SLATE_50]),
    ]))
    story.append(ut)
    story.append(PageBreak())

    # ── 4. Metadata Definitions ─────────────────────────────────────────────────
    story.append(H1("4. Metadata Definitions"))
    story.append(PJ(
        "Metadata definitions specify which data fields are collected for each document type. "
        "When a user uploads a document, the AI extracts values for these fields automatically. "
        "The user reviews and confirms them during intake."
    ))
    story.append(H2("4.1  Managing Metadata Fields"))
    story.append(B("Go to <b>/admin/dms/metadata-definitions</b>"))
    story.append(B("Select a Document Type from the filter to see its fields"))
    story.append(B("Click <b>Add Field</b> to create a new metadata field for that type"))
    story.append(B("Drag to reorder fields — order controls display in the review form"))
    story.append(SP(8))
    story.append(H2("4.2  Metadata Field Configuration"))
    story.append(kv_table([
        ("Field Code",       "Unique code within the document type, e.g. license_number"),
        ("Label (English)",  "English label shown to the user"),
        ("Label (Arabic)",   "Arabic label — رقم الرخصة (auto-seeded for common fields)"),
        ("Field Type",       "text / date / number / boolean / select — controls the input widget"),
        ("Is Required",      "If ON, document cannot be approved without this field"),
        ("AI Field Hint",    "Instruction to the AI for extracting this specific field"),
        ("Options JSON",     "For select type: [{label, value}] list of dropdown options"),
        ("Is Active",        "Inactive fields are hidden from the intake review form"),
        ("Sort Order",       "Display order within the document type form"),
    ]))
    story.append(SP(6))
    story.append(H2("4.3  Arabic Label Seeding"))
    story.append(P(
        "Common fields have Arabic labels pre-seeded (DMS ARABIC FIX.1). "
        "The following field codes have Arabic labels automatically:"
    ))
    story.append(B("id_number → رقم الهوية"))
    story.append(B("expiry_date → تاريخ الانتهاء"))
    story.append(B("issue_date → تاريخ الإصدار"))
    story.append(B("full_name → الاسم الكامل"))
    story.append(B("nationality → الجنسية"))
    story.append(B("passport_number → رقم الجواز"))
    story.append(B("trn → رقم التسجيل الضريبي"))
    story.append(B("license_number → رقم الرخصة"))
    story.append(B("employer_name → صاحب العمل"))
    story.append(B("job_title → المسمى الوظيفي"))
    story.append(PageBreak())

    # ── 5. Tags ─────────────────────────────────────────────────────────────────
    story.append(H1("5. Tags"))
    story.append(PJ(
        "Tags are free-form labels that can be applied to any document regardless of type. "
        "They enable flexible categorization and filtering. The AI Auto-Tags feature "
        "automatically suggests relevant tags from the tag library based on document content."
    ))
    story.append(H2("5.1  Managing Tags"))
    story.append(B("Go to <b>/admin/dms/tags</b>"))
    story.append(B("Click <b>New Tag</b> — enter tag name and optional color/category"))
    story.append(B("Tags are global — any document can use any tag"))
    story.append(B("Deactivate tags that are no longer relevant (preserves existing tag links)"))
    story.append(SP(8))
    story.append(H2("5.2  AI Auto-Tags Feature"))
    story.append(P("When <b>DMS_AUTO_TAGS</b> feature flag is enabled:"))
    story.append(B("After document content is extracted, AI suggests relevant tags from the tag library"))
    story.append(B("Users see tag suggestions with confidence scores during document review"))
    story.append(B("Users must explicitly Accept or Reject each suggestion"))
    story.append(B("Auto-Tags never apply themselves — human confirmation required"))
    story.append(SP(4))
    story.append(Note("Keep the tag library focused. Too many tags reduce AI suggestion accuracy. Aim for 30-50 well-defined tags covering your key business areas."))
    story.append(PageBreak())

    # ── 6. Retention Policies ───────────────────────────────────────────────────
    story.append(H1("6. Retention Policies"))
    story.append(PJ(
        "Retention policies define how long documents are kept before archiving or deletion. "
        "They ensure compliance with UAE data retention regulations and internal policies."
    ))
    story.append(H2("6.1  Managing Retention Policies"))
    story.append(B("Go to <b>/admin/dms/retention-policies</b>"))
    story.append(B("Create policies per document type or category"))
    story.append(B("Set retention period in days (e.g. Emirates ID: 3650 days = 10 years)"))
    story.append(B("Choose action after retention: Archive / Delete / Flag for Review"))
    story.append(SP(8))
    story.append(H2("6.2  UAE Recommended Retention Periods"))
    ret = [
        ("Emirates ID / Passport", "7 years after employee departure"),
        ("Labor Contracts",        "5 years after contract end"),
        ("Trade Licenses",         "Keep active; archive 3 years after expiry"),
        ("Tax Invoices / VAT",     "5 years (UAE FTA requirement)"),
        ("Insurance Policies",     "Duration + 2 years"),
        ("Tenancy Contracts",      "EJARI: keep for lease period + 1 year"),
        ("Medical Fitness Records","2 years minimum"),
        ("Work Permits",           "Duration + 2 years"),
    ]
    story.append(kv_table(ret, 6*cm, 9.5*cm))
    story.append(SP(4))
    story.append(Warn("Always consult your legal team before setting Delete as the retention action. Archiving is the safer default."))
    story.append(PageBreak())

    # ── 7. Feature Flags ────────────────────────────────────────────────────────
    story.append(H1("7. DMS Feature Flags"))
    story.append(P(
        "Feature flags control which AI capabilities are active in the DMS. "
        "Access them at <b>/admin/settings/ai</b> → Feature Flags section."
    ))
    story.append(SP(8))
    flags = [
        ("DMS_OCR",              "ON",  "OCR text extraction from uploaded files. Always keep ON."),
        ("DMS_CLASSIFICATION",   "ON",  "AI document type classification. Required for AI Fill."),
        ("DMS_EXTRACTION",       "ON",  "AI metadata field extraction. Required for AI Fill."),
        ("DMS_AI_REVIEW",        "ON",  "AI intake review queue. Required for Upload & AI Fill flow."),
        ("DMS_CONTENT_TEXT_SYNC","ON",  "Sync extracted text for full-text search."),
        ("DMS_AI_SUMMARY",       "ON",  "Generate AI document summaries. Recommended ON."),
        ("DMS_COMPLETENESS",     "ON",  "Calculate document completeness scores."),
        ("DMS_RISK_SCORE",       "ON",  "Calculate AI risk scores per document."),
        ("DMS_SEMANTIC_SEARCH",  "ON",  "Enable pgvector semantic similarity search."),
        ("DMS_AI_SEARCH",        "ON",  "Enable AI-powered intent-based document search."),
        ("DMS_AUTO_TAGS",        "ON",  "AI auto-suggest tags based on content."),
        ("DMS_SMART_LINKS",      "ON",  "AI suggest party/entity links from document content."),
        ("DMS_BATCH_INTAKE",     "ON",  "Enable multi-file batch upload to draft intake queue."),
        ("DMS_AI_ORCHESTRATION", "OFF", "Full AI pipeline auto-run after Upload & AI Fill. Enable for UAT."),
    ]
    ft = Table([[
        Paragraph(f["<b>{k}</b>", S["body"][:1]+k+S["body"][-1:]] if False else f"<b>{k}</b>", S["body"]),
        Paragraph(f"<font color='{'#15803D' if s=='ON' else '#B91C1C'}'><b>{s}</b></font>", S["body"]),
        Paragraph(d, ParagraphStyle("fd", fontSize=8.5, textColor=SLATE_600, fontName="Helvetica", leading=12)),
    ] for k,s,d in flags], colWidths=[5.5*cm, 1.5*cm, 8.5*cm])
    ft.setStyle(TableStyle([
        ("FONTSIZE",(0,0),(-1,-1), 9), ("TOPPADDING",(0,0),(-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5), ("LEFTPADDING",(0,0),(-1,-1), 7),
        ("GRID",(0,0),(-1,-1), 0.3, SLATE_200),
        ("ROWBACKGROUNDS",(0,0),(-1,-1), [WHITE, SLATE_50]),
    ]))
    story.append(ft)
    story.append(PageBreak())

    # ── 8. AI Intelligence Admin ────────────────────────────────────────────────
    story.append(H1("8. AI Intelligence Admin Dashboard"))
    story.append(PJ(
        "The AI Intelligence Admin page at <b>/admin/dms/intelligence</b> provides "
        "bulk AI tools for maintaining document intelligence across the entire repository. "
        "Access requires the <b>dms.admin</b> permission."
    ))
    story.append(H2("8.1  Health Statistics Cards"))
    story.append(P("The dashboard shows 10 health metrics:"))
    story.append(B("Total documents in the repository"))
    story.append(B("Documents with extracted text (content_text)"))
    story.append(B("Documents missing content text (need OCR backfill)"))
    story.append(B("Documents with AI summary generated"))
    story.append(B("Documents missing AI summary"))
    story.append(B("Documents with completeness score"))
    story.append(B("High-risk documents (risk level: high or critical)"))
    story.append(B("Critical-risk documents"))
    story.append(B("Pending tag suggestions awaiting review"))
    story.append(B("Pending link suggestions awaiting review"))
    story.append(SP(8))
    story.append(H2("8.2  Bulk Operations"))
    story.append(kv_table([
        ("Content Text Backfill", "Scans documents missing content_text and extracts from OCR data. Use after enabling DMS_CONTENT_TEXT_SYNC. Supports dry-run mode."),
        ("AI Summary Bulk",       "Generates AI summaries for all documents missing them. AI cost applies. Supports batch size (default 20), resume from last document ID, dry-run."),
        ("Intelligence Bulk",     "Runs completeness + risk evaluation across all documents. No AI cost — deterministic only. Supports batch 50, resume, dry-run."),
        ("OCR Backfill / Repair", "Re-runs OCR on documents where OCR completed but no text was extracted. Useful for scanned Arabic PDFs."),
        ("Semantic Embedding Bulk","Generates pgvector embeddings for documents missing them. AI cost (text-embedding-3-small). Required for semantic search to work on all documents."),
    ]))
    story.append(SP(6))
    story.append(H2("8.3  Bulk Operation Best Practices"))
    story.append(B("Always run in <b>Dry Run</b> mode first to see what would be processed"))
    story.append(B("Use small batch sizes (10-20) during business hours to avoid API rate limits"))
    story.append(B("Note the <b>Resume from Document ID</b> so you can continue if interrupted"))
    story.append(B("Run large bulk operations outside business hours to minimize cost impact"))
    story.append(B("Monitor <b>erp_ai_usage_logs</b> table for token usage and cost tracking"))
    story.append(PageBreak())

    # ── 9. AI Providers ─────────────────────────────────────────────────────────
    story.append(H1("9. AI Provider Configuration"))
    story.append(P("Manage AI providers at <b>/admin/settings/ai</b>."))
    story.append(H2("9.1  Required Providers"))
    story.append(kv_table([
        ("DEFAULT_CHAT",            "OpenAI GPT-4.1 — used for AI classification, extraction, summaries, QA"),
        ("DEFAULT_DMS_CLASSIFIER",  "Alias for classification — can point to DEFAULT_CHAT"),
        ("DEFAULT_DMS_EXTRACTOR",   "Alias for extraction — can point to DEFAULT_CHAT"),
        ("DEFAULT_EMBEDDING",       "OpenAI text-embedding-3-small — required for semantic search"),
        ("ARABIC_OCR_AZURE",        "Azure Document Intelligence — optional, provides superior Arabic OCR"),
    ]))
    story.append(SP(6))
    story.append(H2("9.2  Setting API Keys"))
    story.append(B("Click <b>Set Secret</b> on a provider row"))
    story.append(B("Enter the API key — it is masked immediately (only first 4 chars visible)"))
    story.append(B("The key is NOT stored in the database — only the environment variable name (Secret Ref)"))
    story.append(B("The actual key must be set in the server <b>.env.local</b> file as the Secret Ref variable"))
    story.append(SP(6))
    story.append(Warn("Never share API keys. If a key is compromised, rotate it immediately in the provider dashboard (OpenAI / Azure) and update the environment variable."))
    story.append(PageBreak())

    # ── 10. Permissions ─────────────────────────────────────────────────────────
    story.append(H1("10. DMS Permission Reference"))
    story.append(P("All DMS permissions are checked server-side via RLS. The following codes are used:"))
    perms = [
        ("dms.documents.view",      "View documents in the repository"),
        ("dms.documents.upload",    "Upload new documents"),
        ("dms.documents.edit",      "Edit document metadata, links, tags"),
        ("dms.documents.ai.run",    "Trigger OCR, AI analysis, summaries, embeddings"),
        ("dms.documents.delete",    "Soft-delete documents"),
        ("dms.admin",               "Full DMS admin access — all operations"),
        ("settings.ai.view",        "View AI settings (providers, flags)"),
        ("settings.ai.manage",      "Modify AI settings (add providers, toggle flags)"),
    ]
    story.append(kv_table(perms, 5.5*cm, 10*cm))
    story.append(SP(8))
    story.append(H2("10.1  Role Assignments (Recommended)"))
    roles = [
        ("system_admin",  "All DMS permissions + all other ERP permissions"),
        ("group_admin",   "dms.admin + all document permissions"),
        ("company_admin", "dms.documents.view + dms.documents.upload + dms.documents.edit"),
        ("Regular User",  "dms.documents.view + dms.documents.upload (as needed)"),
    ]
    story.append(kv_table(roles, 4*cm, 11.5*cm))
    story.append(PageBreak())

    # ── 11. Security & RLS ──────────────────────────────────────────────────────
    story.append(H1("11. Security and RLS"))
    story.append(H2("11.1  Row Level Security"))
    story.append(PJ(
        "All DMS tables have RLS (Row Level Security) ENABLED and FORCED. "
        "This means users can only see documents they are permitted to see "
        "based on their role and permission codes."
    ))
    story.append(SP(6))
    story.append(H2("11.2  Document Confidentiality Levels"))
    story.append(kv_table([
        ("internal",   "All authenticated users can view"),
        ("company",    "Company-level users and above"),
        ("finance",    "Finance team and above"),
        ("hr",         "HR team and above — dms.admin required for AI operations"),
        ("legal",      "Legal team and above — dms.admin required for AI operations"),
        ("executive",  "Senior management only — dms.admin required for AI operations"),
    ]))
    story.append(SP(6))
    story.append(H2("11.3  Storage Buckets"))
    story.append(kv_table([
        ("dms-documents", "Active document files — private bucket, access via signed URLs only"),
        ("dms-temp",      "Temporary files during upload — cleaned after 24 hours"),
    ]))
    story.append(SP(6))
    story.append(Warn("Never make storage buckets public. All file access goes through signed URLs generated server-side after permission verification."))
    story.append(PageBreak())

    # ── 12. Expiry Management ───────────────────────────────────────────────────
    story.append(H1("12. Expiry and Renewals Management"))
    story.append(H2("12.1  Expiry Dashboard"))
    story.append(B("Access at: <b>/dms/expiring</b>"))
    story.append(B("Shows 9 summary cards: Expired, Expiring 90/60/30/14/7/1 days, Missing Expiry, Total"))
    story.append(B("Four tabs: Expired / Expiring Soon / Missing Expiry Date / Renewal Requests"))
    story.append(SP(8))
    story.append(H2("12.2  Reminder Schedule"))
    story.append(P("For documents with expiry tracking enabled, the system generates reminders at:"))
    story.append(B("90 days before expiry — Early warning"))
    story.append(B("60 days before expiry — Planning phase"))
    story.append(B("30 days before expiry — Action required"))
    story.append(B("14 days before expiry — Urgent"))
    story.append(B("7 days before expiry — Critical"))
    story.append(B("1 day before expiry — Final warning"))
    story.append(B("Day of expiry — Expired"))
    story.append(SP(8))
    story.append(H2("12.3  Generating Reminders"))
    story.append(B("Open any document → Expiry tab → Click <b>Generate Reminder Schedule</b>"))
    story.append(B("Or use <b>Generate Reminders Bulk</b> from the Expiry Dashboard for all documents"))
    story.append(B("Reminders appear in <b>/dms/notifications</b> for relevant users"))
    story.append(SP(8))
    story.append(H2("12.4  Renewal Workflow"))
    story.append(B("From the Expiry Dashboard → click <b>Start Renewal</b> on an expiring document"))
    story.append(B("Renewal status: draft → requested → in_progress → renewed / cancelled"))
    story.append(B("Upload the renewed document and link it to the entity"))
    story.append(PageBreak())

    # ── 13. System Health Checklist ─────────────────────────────────────────────
    story.append(H1("13. Monthly Admin Health Checklist"))
    chk = [
        "Review AI Intelligence health dashboard — check for missing content_text/summaries",
        "Run Intelligence Bulk evaluation to refresh completeness and risk scores",
        "Review expired documents — archive or delete per retention policy",
        "Review pending tag/link suggestions — approve or reject aged suggestions",
        "Verify AI provider Test Connection is passing for all active providers",
        "Review erp_ai_usage_logs for unusual token usage or costs",
        "Check DMS_SEMANTIC_SEARCH — run Embedding Bulk if many documents missing embeddings",
        "Review dms_document_types — deactivate types that are no longer in use",
        "Audit user permissions — remove DMS access for departed employees",
        "Test Upload & AI Fill with a sample Arabic document to verify OCR quality",
        "Review DMS_AI_ORCHESTRATION flag status — enable/disable per UAT schedule",
        "Backup retention policy review — confirm policies match current legal requirements",
    ]
    for i, item in enumerate(chk):
        row_t = Table([[
            Paragraph(f"<b>{i+1}</b>", ParagraphStyle("num", fontSize=9, textColor=WHITE, fontName="Helvetica-Bold", alignment=TA_CENTER, leading=13)),
            Paragraph(f"☐  {item}", S["body"]),
        ]], colWidths=[0.8*cm, 14.7*cm])
        row_t.setStyle(TableStyle([
            ("BACKGROUND",(0,0),(0,0), BLUE if i%2==0 else VIOLET),
            ("TOPPADDING",(0,0),(-1,-1), 6),
            ("BOTTOMPADDING",(0,0),(-1,-1), 6),
            ("LEFTPADDING",(0,0),(-1,-1), 6),
            ("GRID",(0,0),(-1,-1), 0.3, SLATE_200),
            ("VALIGN",(0,0),(-1,-1), "MIDDLE"),
        ]))
        story.append(row_t)
        story.append(SP(3))

    story.append(SP(16))
    story.append(HR())
    story.append(Paragraph(
        "DMS Administrator Manual · Version 1.0 · Alliance Gulf Transport Group · Internal Use Only",
        ParagraphStyle("end", fontSize=8, textColor=SLATE_400, fontName="Helvetica", alignment=TA_CENTER)))

    return story

def main():
    doc = SimpleDocTemplate(OUTPUT_PATH, pagesize=A4,
        rightMargin=1.5*cm, leftMargin=1.5*cm, topMargin=2.5*cm, bottomMargin=1.8*cm,
        title="DMS Administrator Manual — ALGT ERP",
        author="ALGT ERP Engineering")
    story = []
    story.extend(build_cover())
    story.extend(build_content())
    doc.build(story, onFirstPage=on_cover, onLaterPages=on_page)
    print(f"Admin manual generated: {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
