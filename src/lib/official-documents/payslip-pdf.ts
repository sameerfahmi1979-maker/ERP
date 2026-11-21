import "server-only";

import { createHash } from "node:crypto";
import { rtlText } from "bidi-shaper/jspdf";
import { jsPDF } from "jspdf";
import { getArabicFontBase64 } from "./layout/fonts";

export const PAYSLIP_RENDERER_VERSION = "t17-payslip-v1";

export interface PayslipSnapshot {
  sequence: number;
  report_on: string;
  company: string;
  branch: string;
  employee: string;
  employee_code: string;
  month: string;
  currency: string;
  gross: string;
  deductions: string;
  net: string;
  trip_total: string;
  components: { category: string; kind: "earning" | "deduction"; amount: string; label?: string }[];
  late_overtime: { month: string; hours: string; amount: string }[];
  trips: { day: string; reference: string; direction: string; truck_type: string; amount: string }[];
}

const categories: Record<string, string> = {
  basic: "Basic pay",
  "salary-component": "Salary component",
  "fleet-overtime": "Fleet overtime",
  "workshop-overtime": "Workshop overtime",
  "workshop-correction": "Workshop overtime correction",
  "trip-allowance": "Trip allowance",
  "trip-allowance-adjustment": "Trip allowance correction",
  recovery: "Recovery deduction",
  "recovery-refund": "Recovery refund",
  adjustment: "Payroll adjustment",
};
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function displayMonth(date: string): string {
  return months[Number(date.slice(5, 7)) - 1] + " " + date.slice(0, 4);
}

function displayDate(date: string): string {
  return date.slice(8, 10) + " " + displayMonth(date);
}

function isDate(value: string): boolean {
  const timestamp = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

const minorPerMajor = BigInt(100);
const zeroAmount = BigInt(0);

function cents(value: string): bigint {
  const parts = /^(-?)(\d{1,18})(?:\.(\d{1,2}))?$/.exec(value);
  if (!parts) throw new Error("Invalid approved amount for payslip.");
  const unsigned = BigInt(parts[2]) * minorPerMajor + BigInt((parts[3] ?? "").padEnd(2, "0"));
  return parts[1] ? -unsigned : unsigned;
}

function amount(value: bigint): string {
  const unsigned = value < zeroAmount ? -value : value;
  const whole = String(unsigned / minorPerMajor).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (value < zeroAmount ? "-" : "") + whole + "." + String(unsigned % minorPerMajor).padStart(2, "0");
}

function printable(value: string): string {
  const text = value.replace(/\p{Cc}+/gu, " ").trim();
  if (!text || text.length > 500) throw new Error("Payslip text is missing or exceeds the supported length.");
  return text;
}

function categoryLabel(value: string): string {
  return Object.hasOwn(categories, value)
    ? categories[value]
    : printable(value.replaceAll(/[-_]/g, " ")).replace(/^[a-z]/, letter => letter.toUpperCase());
}

function validate(snapshot: PayslipSnapshot) {
  if (!Number.isSafeInteger(snapshot.sequence) || snapshot.sequence <= 0 ||
      !isDate(snapshot.report_on) || !isDate(snapshot.month) || !snapshot.month.endsWith("-01") ||
      !/^[A-Z]{3}$/.test(snapshot.currency)) {
    throw new Error("Payslip identity, period or currency is invalid.");
  }
  for (const label of [snapshot.company, snapshot.branch, snapshot.employee, snapshot.employee_code]) {
    printable(label);
  }
  const gross = cents(snapshot.gross);
  const deductions = cents(snapshot.deductions);
  const net = cents(snapshot.net);
  const tripTotal = cents(snapshot.trip_total);
  let earningsSum = zeroAmount;
  let deductionsSum = zeroAmount;
  let tripComponentSum = zeroAmount;
  for (const component of snapshot.components) {
    const value = cents(component.amount);
    if (value < zeroAmount || (component.kind !== "earning" && component.kind !== "deduction")) {
      throw new Error("Approved payroll totals contain an invalid component.");
    }
    if (component.kind === "earning") earningsSum += value;
    else deductionsSum += value;
    if (["trip-allowance", "trip-allowance-adjustment"].includes(component.category)) {
      tripComponentSum += component.kind === "earning" ? value : -value;
    }
  }
  if (earningsSum !== gross || deductionsSum !== deductions || gross - deductions !== net || net < zeroAmount) {
    throw new Error("Approved payroll totals do not reconcile.");
  }

  let tripSum = zeroAmount;
  for (const trip of snapshot.trips) {
    if (!isDate(trip.day)) throw new Error("Payslip trip work date is invalid.");
    tripSum += cents(trip.amount);
  }
  if (tripSum !== tripTotal || tripComponentSum !== tripTotal) {
    throw new Error("Trip allowance details do not reconcile to the approved amount.");
  }

  const workMonths = new Set<string>();
  for (const overtime of snapshot.late_overtime) {
    if (!isDate(overtime.month) || !overtime.month.endsWith("-01") || overtime.month >= snapshot.month ||
        workMonths.has(overtime.month) || !/^-?\d{1,12}(?:\.\d{1,8})?$/.test(overtime.hours)) {
      throw new Error("Late overtime does not have a valid work month and hours.");
    }
    workMonths.add(overtime.month);
    cents(overtime.amount);
  }
  return { gross, deductions, net, tripTotal };
}

interface Column {
  label: string;
  width: number;
  align?: "right";
}

const navy = "#112B47";
const textColor = "#24374B";
const muted = "#4A6278";
const rule = "#D5DFE8";
const pale = "#EEF3F7";
const gold = "#B98639";
const margin = 15;
const right = 195;
const bottom = 267;
const textLine = 4.8;
const arabic = /\p{Script=Arabic}/u;
const nonAscii = /[^\x20-\x7e]/u;

export function renderPayslipPdf(snapshot: PayslipSnapshot): Buffer {
  const totals = validate(snapshot);
  const pdf = new jsPDF({ format: "a4", unit: "mm", compress: true, putOnlyUsedFonts: true });
  // This renderer shapes its own text. Discard only this document's inherited
  // text preprocessing hooks so another export cannot change its bytes.
  const events = pdf.internal.events;
  for (const hook of Object.keys(events.getTopics().preProcessText ?? {})) {
    events.unsubscribe(hook);
  }
  const id = "PS-" + snapshot.sequence;
  const period = displayMonth(snapshot.month);
  const fileId = createHash("sha256")
    .update(JSON.stringify([PAYSLIP_RENDERER_VERSION, snapshot.sequence, snapshot.report_on, snapshot.month]))
    .digest("hex")
    .slice(0, 32);
  pdf.setFileId(fileId);
  // The library's date-string validator is narrower than its Date input. Keep
  // the metadata stable across environments without affecting the visible date.
  const metadataDate = /^20(?:[0-2]\d|3[0-7])/.test(snapshot.report_on)
    ? snapshot.report_on.replaceAll("-", "")
    : "20000101";
  pdf.setCreationDate("D:" + metadataDate + "000000+00'00'");
  pdf.setProperties({ title: "Payslip " + id, subject: "Private payroll document" });
  let hasUnicodeFont = false;
  let y = 0;
  let pageKind: "Payslip" | "Payroll details" | "Paid trip allowances" = "Payslip";

  function style(text: string, size: number, bold: boolean) {
    if (nonAscii.test(text)) {
      if (!hasUnicodeFont) {
        const embedded = getArabicFontBase64();
        if (!embedded) throw new Error("The required payslip font is unavailable.");
        pdf.addFileToVFS("NotoSansArabic.ttf", embedded);
        pdf.addFont("NotoSansArabic.ttf", "PayslipUnicode", "normal");
        hasUnicodeFont = true;
      }
      pdf.setFont("PayslipUnicode", "normal");
    } else {
      pdf.setFont("helvetica", bold ? "bold" : "normal");
    }
    pdf.setFontSize(size);
  }

  function shaped(text: string): string {
    return arabic.test(text) ? rtlText(text) : text;
  }

  function write(text: string, x: number, baseline: number, options: {
    size?: number;
    bold?: boolean;
    color?: string;
    align?: "right";
  } = {}) {
    const content = shaped(text);
    style(content, options.size ?? 10, options.bold ?? false);
    if (nonAscii.test(content)) {
      const font = pdf.getFont() as unknown as { metadata: { characterToGlyph(code: number): number } };
      if (Array.from(content).some(character => !font.metadata.characterToGlyph(character.codePointAt(0)!))) {
        throw new Error("The embedded font cannot render the exact payslip text.");
      }
    }
    pdf.setTextColor(options.color ?? textColor);
    pdf.text(content, x, baseline, { align: options.align });
  }

  function wrap(text: string, maxWidth: number, size: number, bold = false): string[] {
    style(text, size, bold);
    return pdf.splitTextToSize(text, maxWidth) as string[];
  }

  function header() {
    pdf.setFillColor(navy);
    pdf.rect(0, 0, 210, 3, "F");
    pdf.setFillColor(gold);
    pdf.rect(margin, 12, 12, 1, "F");
    const legalName = wrap(printable(snapshot.company), 128, 12, true);
    legalName.forEach((line, index) => write(line, margin, 20 + index * textLine, { size: 12, bold: true, color: navy }));
    write(id, right, 17, { size: 10, bold: true, color: navy, align: "right" });
    write(period, right, 22, { size: 9, color: muted, align: "right" });
    y = Math.max(29, 21 + legalName.length * textLine);
    write(pageKind, margin, y + 5, { size: 19, bold: true, color: navy });
    y += 10;
    pdf.setDrawColor(rule);
    pdf.line(margin, y, right, y);
    y += 7;
  }

  function nextPage(kind: typeof pageKind) {
    pdf.addPage();
    pageKind = kind;
    header();
  }

  function heading(label: string) {
    write(label, margin, y + 3.7, { size: 11, bold: true, color: navy });
    y += 7;
  }

  function table(label: string, columns: Column[], rows: string[][], footerRoom = 0) {
    function tableHeader() {
      heading(label);
      pdf.setFillColor(pale);
      pdf.rect(margin, y, right - margin, 7, "F");
      let x = margin;
      for (const column of columns) {
        write(column.label, column.align ? x + column.width - 2 : x + 2, y + 4.7, {
          size: 8.4, bold: true, color: navy, align: column.align,
        });
        x += column.width;
      }
      y += 7;
    }

    if (y + 28 > bottom) nextPage(pageKind === "Payslip" ? "Payroll details" : pageKind);
    tableHeader();
    for (const [index, row] of rows.entries()) {
      const cells = row.map((cell, column) => {
        const width = columns[column].width - 4;
        if (!columns[column].align) return { lines: wrap(cell, width, 8.6), size: 8.6 };
        style(cell, 8.6, false);
        const measured = pdf.getTextWidth(cell);
        return { lines: [cell], size: measured > width ? 8.6 * width / measured : 8.6 };
      });
      const height = Math.max(8, Math.max(...cells.map(cell => cell.lines.length)) * textLine + 3.2);
      const reserve = index === rows.length - 1 ? footerRoom : 0;
      if (y + height + reserve > bottom) {
        nextPage(pageKind === "Payslip" ? "Payroll details" : pageKind);
        tableHeader();
      }
      if (y + height + reserve > bottom) throw new Error("Payslip row does not fit on a page.");
      let x = margin;
      for (const [index, column] of columns.entries()) {
        for (const [lineNo, cell] of cells[index].lines.entries()) {
          write(cell, column.align ? x + column.width - 2 : x + 2, y + 4.7 + lineNo * textLine, {
            size: cells[index].size, align: column.align,
          });
        }
        x += column.width;
      }
      y += height;
      pdf.setDrawColor(rule);
      pdf.line(margin, y, right, y);
    }
    y += 4;
  }

  header();
  const name = wrap(printable(snapshot.employee), 121, 12, true);
  const branch = wrap(printable(snapshot.branch), 121, 9);
  write("Employee", margin, y + 3, { size: 8, bold: true, color: muted });
  write("Statement date", right, y + 3, { size: 8, bold: true, color: muted, align: "right" });
  y += 8;
  name.forEach((line, index) => write(line, margin, y + index * textLine, { size: 12, bold: true, color: navy }));
  write(displayDate(snapshot.report_on), right, y, { size: 9, align: "right" });
  y += name.length * textLine;
  const employeeCode = wrap(printable(snapshot.employee_code), 121, 9);
  employeeCode.forEach((line, index) => write(line, margin, y + index * textLine, { size: 9, color: muted }));
  write("Payment verified complete", right, y, { size: 9, bold: true, color: navy, align: "right" });
  y += employeeCode.length * textLine;
  branch.forEach((line, index) => write(line, margin, y + index * textLine, { size: 9, color: muted }));
  y += branch.length * textLine + 4;

  const summary = [
    { label: "Gross earnings", total: totals.gross },
    { label: "Deductions", total: totals.deductions },
    { label: "Net pay", total: totals.net },
  ];
  for (const [index, entry] of summary.entries()) {
    const x = margin + index * 61;
    pdf.setFillColor(index === 2 ? navy : pale);
    pdf.rect(x, y, 58, 20, "F");
    const color = index === 2 ? "#FFFFFF" : navy;
    write(entry.label + " (" + snapshot.currency + ")", x + 3, y + 6.2, { size: 8.5, bold: true, color });
    const money = amount(entry.total);
    style(money, 13, true);
    const measured = pdf.getTextWidth(money);
    write(money, x + 3, y + 15, { size: measured > 52 ? 13 * 52 / measured : 13, bold: true, color });
  }
  y += 26;
  write("Trip allowance total", margin, y, { size: 9, color: navy, bold: true });
  write(snapshot.currency + " " + amount(totals.tripTotal), right, y, { size: 9, color: navy, bold: true, align: "right" });
  y += 8;

  table("Approved payroll components", [
    { label: "Component", width: 93 },
    { label: "Type", width: 42 },
    { label: "Amount (" + snapshot.currency + ")", width: 45, align: "right" },
  ], snapshot.components.map(component => [
    component.label ? printable(component.label) : categoryLabel(component.category), component.kind === "earning" ? "Earnings" : "Deduction", amount(cents(component.amount)),
  ]));

  if (snapshot.late_overtime.length) {
    table("Prior-month overtime included in this pay", [
      { label: "Work month", width: 82 },
      { label: "Hours", width: 48, align: "right" },
      { label: "Amount (" + snapshot.currency + ")", width: 50, align: "right" },
    ], snapshot.late_overtime.map(overtime => [
      displayMonth(overtime.month), overtime.hours.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""),
      amount(cents(overtime.amount)),
    ]));
  }

  if (snapshot.trips.length) {
    nextPage("Paid trip allowances");
    table("Allowance breakdown", [
      { label: "Work date", width: 25 },
      { label: "Reference", width: 40 },
      { label: "Direction", width: 48 },
      { label: "Truck type", width: 29 },
      { label: "Amount (" + snapshot.currency + ")", width: 38, align: "right" },
    ], snapshot.trips.map(trip => [
      displayDate(trip.day), printable(trip.reference), printable(trip.direction), printable(trip.truck_type),
      amount(cents(trip.amount)),
    ]), 12);
    pdf.setFillColor(pale);
    pdf.rect(margin, y, right - margin, 8, "F");
    write("Trip allowance total", margin + 2, y + 5.4, { bold: true, color: navy });
    write(snapshot.currency + " " + amount(totals.tripTotal), right - 2, y + 5.4, { bold: true, color: navy, align: "right" });
  }

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(rule);
    pdf.line(margin, 277, right, 277);
    write("Private payroll document", margin, 283, { size: 8.3, color: muted });
    write("Page " + page + " of " + pages, right, 283, { size: 8.3, color: muted, align: "right" });
  }
  return Buffer.from(pdf.output("arraybuffer"));
}
