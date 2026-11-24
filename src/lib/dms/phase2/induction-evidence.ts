import type { SourcePage } from "./batch";
import type { Evidence, SourceLayoutProof } from "./provider-evidence";
import { readTrainingLayout } from "./training-evidence";

const trainingType = "ADNOC_INDUCTION";
const rasterMethod = "tesseract-training-raster-ocr";
const pageMethod = "tesseract-training-page-ocr";
const academyTitle = /^(Onshore|Offshore) Induction\s*\+\s*ADNOC Life[- ]Saving Rules$/iu;
const gtscTitle = /^ADNOC OFFSHORE HSE INDUCTION$/iu;
const unrelatedCourse = /\b(?:T[‐‑–-]?BOSIET|tropical basic offshore safety induction and emergency training)\b/iu;
const offshoreAttendance = /\battended ADNOC Offshore HSE Induction\b/iu;
const attendeeHeading = /^certificate of attendance$/iu;
const attestationHeading = /^(?:certificate|letter) of attestation$/iu;
const completionHeading = /(?:^|\n)certificate\s+of completion(?:\s*\n|$)/iu;
const completionStatement = /^has attended and completed$/iu;
const gtscCompletion = /^(?:Who )?has completed a one day course in$/iu;
const subjectShape = /^[\p{L}\p{M}.'’-]+(?:\s+[\p{L}\p{M}.'’-]+)+$/u;
const dynamicKeys = ["participant_name", "certificate_number", "issue_date", "expiry_date", "course_date"] as const;

type InductionPage = Omit<SourcePage, 'region'> & { region?: string };
type Row = { page: InductionPage; line: number; raw: string };
type Title = { row: Row; kind: "academy" | "gtsc"; scope: "onshore" | "offshore" };

const plain = (text: string) => text.normalize("NFKC").replace(/\s+/gu, " ").trim();
const folded = (text: string) => plain(text).toLowerCase();

function rows(page: InductionPage): Row[] {
  return page.text.split(/\r?\n/u).flatMap((line, i) => {
    const raw = line.trim();
    return raw ? [{ page, line: i + 1, raw }] : [];
  });
}

function titles(lines: readonly Row[]): Title[] {
  return lines.flatMap<Title>(row => {
    const academy = academyTitle.exec(plain(row.raw));
    if (academy) return [{ row, kind: "academy", scope: academy[1].toLowerCase() === "onshore" ? "onshore" : "offshore" }];
    return gtscTitle.test(plain(row.raw)) ? [{ row, kind: "gtsc", scope: "offshore" }] : [];
  });
}

function isSupplement(page: InductionPage) {
  return page.method === pageMethod || page.method === rasterMethod;
}

function onPage(page: InductionPage, original: InductionPage) {
  const b = page.bounds;
  return isSupplement(page) && page.page === original.page && b !== undefined && b.length === 4
    && b.every(value => Number.isFinite(value) && value >= 0) && b[2] > b[0] && b[3] > b[1];
}

function evidence(row: Row, label: string, raw = row.raw, value = plain(raw)): Evidence {
  return { raw, value, label, page: row.page.page, line: row.line, method: row.page.method, region: row.page.region, ...(row.page.bounds && { bounds: row.page.bounds }) };
}

function nonAwardReason(lines: readonly Row[]) {
  if (!titles(lines).length && !lines.some(row => offshoreAttendance.test(plain(row.raw)))) return null;
  if (lines.some(row => attendeeHeading.test(plain(row.raw)))) return "induction_attendance_only";
  if (lines.some(row => attestationHeading.test(plain(row.raw)))) return "induction_attestation_only";
  return null;
}

const exactReading = (proof: Evidence, line: Row) => {
  const raw = folded(proof.raw ?? "");
  const native = folded(line.raw);
  return raw.length > 0 && (native === raw || native.endsWith(`: ${raw}`) || native.endsWith(`:${raw}`));
};

function readAcademy(original: InductionPage, overlay: readonly Row[], raster: readonly InductionPage[], pageRead: InductionPage | undefined) {
  const base = readTrainingLayout([original, ...raster], trainingType);
  if (!base) return null;
  if (!pageRead) return base;

  const rendered = readTrainingLayout([pageRead], trainingType);
  const outcome = rows(pageRead).find(row => completionStatement.test(plain(row.raw)));
  const provider = rows(pageRead).find(row => /^ADNOC Technical Academy$/iu.test(plain(row.raw)));
  if (!rendered || !outcome || !provider || !completionHeading.test(pageRead.text)) return base;

  const fields: SourceLayoutProof["fields"] = { ...base.fields };
  const reasons = new Set(base.reasons);
  fields.provider ??= evidence(provider, "Printed Academy provider");
  fields.printed_outcome ??= evidence(outcome, "Printed completion statement", outcome.raw, "completed");
  reasons.delete("training_provider_source_unconfirmed");
  reasons.delete("training_outcome_source_unconfirmed");
  for (const key of dynamicKeys) {
    const probe = rendered.fields[key];
    if (!probe || reasons.has(`conflicting_field:${key}`)) continue;
    if (fields[key]) {
      if (folded(fields[key].value) !== folded(probe.value)) {
        delete fields[key];
        reasons.add(`conflicting_field:${key}`);
      }
    } else if (overlay.some(line => exactReading(probe, line))) {
      fields[key] = probe;
    } else {
      reasons.add(`induction_rendered_value_unconfirmed:${key}`);
    }
  }
  if (fields.participant_name) reasons.delete("training_participant_source_unconfirmed");
  if (fields.certificate_number && fields.issue_date && fields.expiry_date) reasons.delete("training_labelled_layout_incomplete");
  return { profileId: base.profileId, fields, reasons: [...reasons] };
}

const months = "january february march april may june july august september october november december".split(" ");
function namedDate(raw: string) {
  const m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\s+(\d{4})$/iu.exec(raw);
  if (!m) return null;
  const name = m[2].toLowerCase();
  const index = months.findIndex(month => month === name || month.slice(0, 3) === name);
  if (index < 0) return null;
  const value = `${m[3]}-${String(index + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

function attendanceDate(raw: string) {
  const parts = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/u.exec(raw);
  if (!parts) return namedDate(raw);
  const [, one, two, year] = parts;
  if (Number(one) <= 12 && Number(two) <= 12 && Number(one) !== Number(two)) return null;
  const [day, month] = Number(one) >= Number(two) ? [one, two] : [two, one];
  const name = months[Number(month) - 1];
  return name ? namedDate(`${day} ${name} ${year}`) : null;
}

function readAttendanceActivity(lines: readonly Row[]): SourceLayoutProof {
  const profileId = "training-attendance";
  const reasons = ["induction_attendance_only"];
  const fields: SourceLayoutProof["fields"] = {};
  const set = (key: string, item: Evidence) => {
    const issue = `conflicting_field:${key}`;
    if (reasons.includes(issue)) return;
    if (fields[key] && folded(fields[key].value) !== folded(item.value)) {
      delete fields[key];
      reasons.push(issue);
    } else fields[key] ??= item;
  };
  for (const row of lines) {
    const name = /^Name\s*:\s*(.+)$/iu.exec(row.raw)?.[1];
    if (name && subjectShape.test(name)) set("participant_name", evidence(row, "Name", name));
    const provider = /^Emirates Technical\s*&\s*Safety Development Centre\b/iu.exec(row.raw)?.[0];
    if (provider) set("provider", evidence(row, "Printed training provider", provider));
    const attendance = /^(Has (?:successfully )?attended)\s+(ADNOC Offshore HSE Induction)\s+on\s+(\d{1,2}\.\d{1,2}\.\d{4})\b/iu.exec(row.raw);
    if (attendance) {
      set("course_title", evidence(row, "Printed attendance course", attendance[2]));
      set("attendance_status", evidence(row, "Printed attendance statement", attendance[1], "attended"));
      const date = attendanceDate(attendance[3]);
      if (date) set("activity_date", evidence(row, "Attended on", attendance[3], date));
    }
    const validity = /^(Valid Until)\s*:\s*(\d{1,2}\.\d{1,2}\.\d{4})\b/iu.exec(row.raw);
    const date = validity && attendanceDate(validity[2]);
    if (validity && date) set("printed_activity_valid_until", evidence(row, validity[1], validity[2], date));
  }
  return { profileId, fields, reasons, limitToProofFields: true };
}

const gtscDates = {
  issue_date: /^(Date of Issue)\s*:\s*\.*\s*(.+)$/iu,
  expiry_date: /^(Date of Expiry)\s*:\s*\.*\s*(.+?)(?:\s{2,}Authorized Signatory)?$/iu,
  course_date: /^(Attended Day\(s\))\s*:\s*\.*\s*(.+)$/iu,
};

function readGtsc(title: Title, original: readonly Row[], supplemental: readonly Row[]): SourceLayoutProof {
  const fields: SourceLayoutProof["fields"] = {
    course_title: evidence(title.row, "Printed course title"),
    training_scope: evidence(title.row, "Printed induction scope", title.row.raw, "offshore"),
  };
  const reasons = new Set<string>();
  const set = (key: string, field: Evidence) => {
    const conflict = `conflicting_field:${key}`;
    if (reasons.has(conflict)) return;
    if (fields[key] && folded(fields[key].value) !== folded(field.value)) {
      delete fields[key];
      reasons.add(conflict);
    } else fields[key] ??= field;
  };
  const index = original.indexOf(title.row);
  const statement = original[index - 1];
  const holder = original[index - 2];
  if (statement && gtscCompletion.test(plain(statement.raw))) {
    set("printed_outcome", evidence(statement, "Printed completion statement", statement.raw, "completed"));
    if (holder && subjectShape.test(holder.raw)) set("participant_name", evidence(holder, "Certificate holder before completion statement"));
  }
  for (const row of original) {
    const certificate = /^(Certificate No\.?)\s*:\s*\.*\s*([0-9]{4,18})$/iu.exec(row.raw);
    if (certificate) set("certificate_number", evidence(row, certificate[1], certificate[2]));
    const licence = /^((?:ACTVET\s+)?Licen[cs]e No\.?)\s*:?\s*(\d{1,10}\/\d{4})$/iu.exec(row.raw);
    if (licence) set("provider_licence", evidence(row, licence[1], licence[2]));
    for (const [key, regex] of Object.entries(gtscDates)) {
      const match = regex.exec(row.raw);
      const value = match && namedDate(plain(match[2]));
      if (match && value) set(key, evidence(row, match[1], match[2], value));
    }
  }
  const provider = [...original, ...supplemental].find(row => /^GTSC$/iu.test(plain(row.raw)));
  if (provider) set("provider", evidence(provider, "Printed training provider", provider.raw, "GTSC"));
  if (!fields.provider) reasons.add("training_provider_source_unconfirmed");
  if (!fields.printed_outcome) reasons.add("training_outcome_source_unconfirmed");
  if (!fields.participant_name) reasons.add("training_participant_source_unconfirmed");
  if (!fields.certificate_number || !fields.issue_date || !fields.expiry_date) reasons.add("training_labelled_layout_incomplete");
  return { profileId: "offshore-induction", fields, reasons: [...reasons] };
}

export function readInductionLayout(pages: readonly InductionPage[], typeCode: string): SourceLayoutProof | null {
  if (typeCode !== trainingType && typeCode !== "TRAINING_ACTIVITY") return null;
  const originals = pages.filter(page => !isSupplement(page));
  if (originals.length !== 1) return null;
  const original = originals[0];
  const overlay = rows(original);
  const attachments = pages.filter(page => onPage(page, original));
  const renders = attachments.filter(page => page.method === pageMethod);

  const readings = [overlay, ...renders.map(rows)];
  const nonAward = readings.map(nonAwardReason).find(reason => reason !== null);
  if (typeCode === "TRAINING_ACTIVITY") {
    if (nonAward !== "induction_attendance_only") return null;
    return readAttendanceActivity(readings.filter(lines => nonAwardReason(lines) === nonAward).flat());
  }
  if (nonAward) return { profileId: null, fields: {}, reasons: [nonAward], limitToProofFields: true };

  const anchor = titles(overlay);
  if (!anchor.length || unrelatedCourse.test(original.text)) return null;
  const [{ kind, scope }] = anchor;
  const profileId = `${scope}-induction`;
  const otherTitles = renders.flatMap(page => titles(rows(page)));
  if (anchor.length > 1 || otherTitles.some(candidate => candidate.scope !== scope || candidate.kind !== kind)) {
    return { profileId, fields: {}, reasons: ["induction_scope_conflict"], limitToProofFields: true };
  }
  // Keep one reading of each matching physical Academy background. Small logo
  // objects and duplicate OCR of the form cannot supply a second template.
  const academyRasters = new Map<string, InductionPage>();
  for (const raster of attachments) {
    if (kind !== "academy" || raster.method !== rasterMethod || !completionHeading.test(raster.text)) continue;
    const rasterRows = rows(raster);
    if (!rasterRows.some(row => /^ADNOC Technical Academy$/iu.test(plain(row.raw)))
      || !rasterRows.some(row => completionStatement.test(plain(row.raw)))) continue;
    const position = raster.bounds?.map(coordinate => coordinate.toFixed(3)).join(":");
    if (position && !academyRasters.has(position)) academyRasters.set(position, raster);
  }
  if (renders.length > 1 || academyRasters.size > 1) {
    return { profileId, fields: {}, reasons: ["induction_supplement_ambiguous"], limitToProofFields: true };
  }

  const proof = kind === "academy"
    ? readAcademy(original, overlay, [...academyRasters.values()], renders[0])
    : readGtsc(anchor[0], overlay, attachments.flatMap(rows));
  if (proof?.fields.issue_date && proof.fields.expiry_date
    && proof.fields.issue_date.value > proof.fields.expiry_date.value) {
    const fields = { ...proof.fields };
    delete fields.expiry_date;
    return { ...proof, fields, reasons: [...(proof.reasons ?? []), "induction_expiry_precedes_issue"], limitToProofFields: true };
  }
  return proof;
}
