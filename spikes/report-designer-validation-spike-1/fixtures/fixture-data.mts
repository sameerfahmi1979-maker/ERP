/**
 * REPORT.DESIGNER.VALIDATION.SPIKE.1 — Shared synthetic fixture pack.
 *
 * SAFETY: 100% synthetic. No production records, no live IDs, no real
 * employee/salary/passport data, no real stamps or signatures.
 * All identifiers use the FIX- prefix. QR token is random and never stored.
 */
import { randomBytes } from "node:crypto";

// ── Fixture companies (two different brandings) ──────────────────────────────

export interface FixtureCompany {
  code: string;
  nameEn: string;
  nameAr: string;
  trn: string;
  address: string;
  phone: string;
  email: string;
  color: string; // brand primary
  accent: string;
  logoDataUri: string; // synthetic SVG logo
  signatoryName: string;
  signatoryTitle: string;
}

function svgLogo(label: string, bg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="56"><rect width="160" height="56" rx="8" fill="${bg}"/><text x="80" y="34" font-family="Arial" font-size="18" font-weight="bold" fill="#ffffff" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export const COMPANY_A: FixtureCompany = {
  code: "FIX-COMPANY-A",
  nameEn: "Falcon Gulf Logistics L.L.C (FIXTURE)",
  nameAr: "شركة صقر الخليج للخدمات اللوجستية ذ.م.م (تجريبي)",
  trn: "100000000000001",
  address: "Plot 12, Industrial Area 9, Sharjah, United Arab Emirates — P.O. Box 99001",
  phone: "+971 6 000 0001",
  email: "hr@fixture-falcon.example",
  color: "#1e3a8a",
  accent: "#3b82f6",
  logoDataUri: svgLogo("FALCON-A", "#1e3a8a"),
  signatoryName: "Fixture Manager One",
  signatoryTitle: "Group Human Resources Manager",
};

export const COMPANY_B: FixtureCompany = {
  code: "FIX-COMPANY-B",
  nameEn: "Oasis Star Contracting L.L.C (FIXTURE)",
  nameAr: "شركة نجمة الواحة للمقاولات ذ.م.م (تجريبي)",
  trn: "100000000000002",
  address: "Office 402, Corniche Tower, Abu Dhabi, United Arab Emirates — P.O. Box 55002",
  phone: "+971 2 000 0002",
  email: "hr@fixture-oasis.example",
  color: "#14532d",
  accent: "#22c55e",
  logoDataUri: svgLogo("OASIS-B", "#14532d"),
  signatoryName: "Fixture Manager Two",
  signatoryTitle: "Human Resources & Administration Director",
};

// ── Fixture employees ─────────────────────────────────────────────────────────

export interface FixtureEmployee {
  code: string;
  nameEn: string;
  nameAr: string | null;
  nationality: string;
  designation: string;
  department: string;
  joiningDate: string;
  passportPlaceholder: string;
  salaryAedFixture: number;
}

export const EMP_EN: FixtureEmployee = {
  code: "FIX-EMP-001",
  nameEn: "Jonathan Maximilian Featherstone-Harrington III",
  nameAr: null,
  nationality: "British",
  designation:
    "Senior Regional Logistics Coordination and Heavy Equipment Mobilization Specialist",
  department: "Integrated Supply Chain, Fleet Operations and Strategic Procurement Department",
  joiningDate: "14 March 2019",
  passportPlaceholder: "FIX-PP-0000001",
  salaryAedFixture: 18500,
};

export const EMP_AR: FixtureEmployee = {
  code: "FIX-EMP-AR-001",
  nameEn: "Abdulrahman Khalid Al-Mansoori (FIXTURE)",
  nameAr: "عبدالرحمن خالد المنصوري (تجريبي)",
  nationality: "Emirati",
  designation: "مشرف عمليات النقل والخدمات اللوجستية",
  department: "إدارة الأسطول والعمليات",
  joiningDate: "01 June 2021",
  passportPlaceholder: "FIX-PP-0000002",
  salaryAedFixture: 24000,
};

export const EMP_BI: FixtureEmployee = {
  code: "FIX-EMP-BI-001",
  nameEn: "Mariam Yousef Al-Hashimi (FIXTURE)",
  nameAr: "مريم يوسف الهاشمي (تجريبي)",
  nationality: "Jordanian",
  designation: "Executive Assistant / مساعدة تنفيذية",
  department: "Administration / الإدارة العامة",
  joiningDate: "22 October 2023",
  passportPlaceholder: "FIX-PP-0000003",
  salaryAedFixture: 12750,
};

// ── Placeholder protected assets (clearly synthetic) ─────────────────────────

function placeholderBox(label: string, color: string, w = 140, h = 70): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="6 4" rx="6"/><text x="${w / 2}" y="${h / 2 + 4}" font-family="Arial" font-size="11" fill="${color}" text-anchor="middle">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export const STAMP_PLACEHOLDER = placeholderBox("STAMP PLACEHOLDER", "#b91c1c", 110, 110);
export const SIGNATURE_PLACEHOLDER = placeholderBox("SIGNATURE PLACEHOLDER", "#1d4ed8", 160, 60);
export const PHOTO_PLACEHOLDER = placeholderBox("PHOTO", "#475569", 90, 110);

/** Random spike QR token — never persisted anywhere. */
export const SPIKE_QR_TOKEN = randomBytes(18).toString("base64url");
export const SPIKE_QR_URL = `https://spike.invalid/verify/${SPIKE_QR_TOKEN}`;

// ── Large report dataset (spans 8–12 pages) ──────────────────────────────────

export interface ReportRow {
  no: number;
  empCode: string;
  nameEn: string;
  nameAr: string;
  department: string;
  designation: string;
  joinDate: string;
  documentNo: string;
  expiry: string;
  status: "Valid" | "Expiring" | "Expired";
  salaryFixture: number;
}

const AR_NAMES = [
  "محمد أحمد الزعابي",
  "فاطمة علي الشامسي",
  "خالد سعيد النعيمي",
  "عائشة حسن البلوشي",
  "سلطان راشد الكتبي",
];
const EN_NAMES = [
  "Daniel Okafor Chukwuemeka",
  "Priya Ramachandran Venkatesh",
  "Jose Miguel Fernandez-Gutierrez",
  "Chen Wei-Long",
  "Aleksandr Volkonsky-Bezukhov",
];
const DEPTS = [
  "Fleet Operations",
  "إدارة الأسطول",
  "Heavy Equipment Workshop and Preventive Maintenance Division",
  "Finance & Accounts",
  "HSE & Compliance",
];
const DESIGS = [
  "Heavy Truck Driver (Long Haul, Cross-Border Operations, GCC Routes)",
  "سائق شاحنة ثقيلة",
  "Workshop Technician",
  "Accountant",
  "Safety Officer",
];

export function buildReportRows(count = 120): ReportRow[] {
  const rows: ReportRow[] = [];
  for (let i = 1; i <= count; i++) {
    const statusPick = i % 11 === 0 ? "Expired" : i % 5 === 0 ? "Expiring" : "Valid";
    rows.push({
      no: i,
      empCode: `FIX-EMP-${String(i).padStart(4, "0")}`,
      nameEn: EN_NAMES[i % EN_NAMES.length],
      nameAr: AR_NAMES[i % AR_NAMES.length],
      department: DEPTS[i % DEPTS.length],
      designation: DESIGS[i % DESIGS.length],
      joinDate: `${String((i % 28) + 1).padStart(2, "0")}/0${(i % 9) + 1}/20${18 + (i % 8)}`,
      documentNo: `FIX-DOC-2026-${String(900000 + i)}-UAEVISA-LONGUNBREAKABLEID${i}`,
      expiry: `${String((i % 28) + 1).padStart(2, "0")}/1${i % 2}/202${6 + (i % 3)}`,
      status: statusPick,
      salaryFixture: 3200 + (i % 40) * 275,
    });
  }
  return rows;
}

// ── Long letter body (2–4 page test) ─────────────────────────────────────────

export const LONG_LETTER_PARAGRAPHS: string[] = Array.from({ length: 18 }, (_, i) =>
  `Paragraph ${i + 1}. This fixture paragraph exists to force multi-page flow and to allow inspection of widow and orphan behaviour, header and footer continuity, and paragraph splitting quality across page boundaries. The quick brown fox jumps over the lazy dog while the logistics coordinator reviews the consolidated manifest for cross-border heavy equipment mobilization. `.repeat(
    3
  )
);

export const ARABIC_PARAGRAPHS: string[] = [
  "تشهد إدارة الموارد البشرية في الشركة بأن الموظف المذكور أعلاه يعمل لدينا بدوام كامل، وقد أظهر خلال فترة عمله التزاماً مهنياً عالياً وكفاءة متميزة في أداء المهام الموكلة إليه.",
  "وقد صدرت هذه الشهادة بناءً على طلب الموظف لاستخدامها فيما يراه مناسباً، دون أدنى مسؤولية على الشركة تجاه أي طرف ثالث. نؤكد أن جميع البيانات الواردة في هذه الشهادة صحيحة وفقاً لسجلات الشركة الرسمية.",
  "تحرر هذا المستند إلكترونياً ويمكن التحقق من صحته عبر رمز الاستجابة السريعة المرفق أدناه. للاستفسارات يرجى التواصل مع إدارة الموارد البشرية خلال ساعات الدوام الرسمي من الأحد إلى الخميس.",
];
