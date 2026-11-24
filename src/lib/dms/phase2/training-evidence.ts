type SourcePage = { page: number; text: string; method?: string; region?: string; bounds?: readonly [number, number, number, number] };
type Row = { raw: string; line: number };
type TrainingField = { value: string; raw: string; page: number; line: number; label: string; method?: string; bounds?: SourcePage["bounds"] };
type TrainingLayoutResult = { profileId: string; fields: Record<string, TrainingField>; reasons?: string[]; limitToProofFields?: boolean };

type Layout = {
  profileId: string;
  kind: "academy" | "offshore" | "opito" | "numero" | "highfield" | "firefighting" | "safety-zone" | "safety-inline" | "rospa" | "iosh" | "passport";
  title: Row;
  scope?: "onshore" | "offshore";
};

const rasterMethod = "tesseract-training-raster-ocr";
const academyTitle = /^(Onshore|Offshore) Induction\s*\+\s*ADNOC Life(?:[ -])Saving Rules$/iu;
const levelTwo = /^H[2₂]S Training Level 2$/iu;
const offshoreTitle = /^ADNOC Offshore HSE Induction$/iu;
const opitoTitle = /^Tropical Basic Offshore Safety Induction and Emergency Training(?:\s*\(\s*T[‐‑–-]?BOSIET\s*\))?$/iu;
const opitoBasicH2sTitle = /^Basic H[2₂]S Training$/iu;
const opitoStandard = /^OPITO[‐‑–-]approved standard\s*:?$/iu;
const opitoOutcome = /^(?:and )?has been assessed against, and met the outcomes of, the following$/iu;
const numeroProvider = /^NUMERO UNO TRAINING & CONSULTING LLC$/iu;
const numeroFirstAid = /^Highfield International Emergency First Aid, AED\s*&\s*CPR All Ages\s*\(\s*Level 3 Award\s*\)$/iu;
const fireSafetyTitle = /^(?:Highfield )?Level 2 International Award in Fire Safety$/iu;
const fireFightingTitle = /^(?:Course\s*:\s*)?Basic Fire Fighting$/iu;
const defensiveTitle = /^Defensive(?:\s*\/\s*[\p{L} -]+)? Driving(?:\s*[-–]\s*Heavy (?:Bus|Truck|Vehicle)|\s+(?:for )?Light Vehicles?)?$/iu;
const numeroLightDefensive = /^Defensive\s*\/\s*Desert Driving\s*[-‐‑–]\s*(Light Vehicle)$/iu;
const numeroDesertClass = /^Defensive Driving & Desert Driving Course\s*\(\s*(HGV|HVB)\s*\)\s*\(\s*ADSD\s*\)$/iu;
const numeroOutcomeChoice = /^has suc(?:c)?essfully attended\s*\/\s*passed$/iu;
const suppliedPassportHeader = /^Passport Number\s+(?:Offshore Expiry Date\s+Onshore Expiry Date|Expiry Date\s+Issuing location)(?:\s|$)/iu;
const passportTitle = /^(?:ADNOC )?(?:HSE|Site|Contractor)?\s*Safety Passport$/iu;
const printedIdentity = /^This (?:is to certify|certifies) that\s*[:.]?$/iu;
const completion = /^has (?:attended and completed|successfully completed|completed(?: a (?:one|1)[ -]day course in)?)$/iu;
const attendanceOnly = /(?:does not|is not)\b.{0,75}(?:successful completion|certification|certificate of completion)/iu;
const completedCourse = /^Has successfully completed the training course of$/iu;
const safetyZoneProvider = /(?<![\p{L}])Safety Zone S\s*&\s*S Consultancy$/iu;
const inlineName = /^Name\s*:\s*(.+?)\s+This is to certify that\s*\|?$/iu;
const inlineCompletion = /(?:^|\s)(Has successfully Completed)\s*$/iu;
const safetyDrivingTitle = /^(?:Course\s*:\s*)?ADSD\s*\(\s*Defensive Driving & Desert Driving\s*\)\s*[-‐‑–]\s*(HV|LV|LMV)$/iu;
const rospaProvider = /(?<![\p{L}])The Royal Society for the Prevention of Accidents$/iu;
const rospaLead = /(?<![\p{L}])(ADNOC Defensive Driving for Light)$/iu;
const rospaTail = /^(Vehicles)\s*\(\s*(Valid\s+([1-9]\d?)\s+Years?)\s*\)$/iu;
const rospaGrade = /^(Grade)\s*:\s*(Pass|Fail)$/iu;
const nameShape = /^[\p{L}\p{M}.'’-]+(?:[ ]+[\p{L}\p{M}.'’-]+)+$/u;

function rowsOf(text: string): Row[] {
  return text.split(/\r?\n/u)
    .map((raw, i) => ({ raw: raw.trim(), line: i + 1 }))
    .filter(({ raw }) => raw.length !== 0);
}

function identify(rows: readonly Row[], typeCode: string): Layout[] {
  const get = (marker: RegExp) => rows.find(({ raw }) => marker.test(raw));
  if (typeCode === "H2S_TRAINING_CERTIFICATE") {
    const title = get(levelTwo);
    return title ? [{ profileId: "h2s-training", kind: "academy", title }] : [];
  }
  if (typeCode === "ADNOC_INDUCTION" && !get(opitoTitle)) {
    const matching = new Map<string, Layout>();
    for (const title of rows) {
      const named = academyTitle.exec(title.raw)?.[1].toLowerCase() as "onshore" | "offshore" | undefined;
      const scope = named ?? (offshoreTitle.test(title.raw) ? "offshore" : undefined);
      if (!scope) continue;
      const profileId = `${scope}-induction`;
      if (!matching.has(profileId)) matching.set(profileId, { profileId, kind: named ? "academy" : "offshore", title, scope });
    }
    return [...matching.values()];
  }
  if (typeCode === "ADNOC_OPITO") {
    if (!get(opitoStandard)) return [];
    const award = get(opitoTitle);
    const basic = get(opitoBasicH2sTitle);
    return [
      ...(award ? [{ profileId: "t-bosiet", kind: "opito" as const, title: award }] : []),
      ...(basic ? [{ profileId: "h2s-training-opito-basic", kind: "opito" as const, title: basic }] : []),
    ];
  }
  if (typeCode === "ADNOC_PASSPORT") {
    const title = get(passportTitle) ?? get(suppliedPassportHeader);
    const template = get(suppliedPassportHeader) && get(/^Supplier\s*:/iu) && get(/(?:^|[^\p{L}])(?:[\w-]+\.)*adnoc\.ae(?:[/.\s]|$)/iu);
    return title && (template || (get(passportTitle) && get(/^Passport Number\s*:/iu)))
      ? [{ profileId: "hse-safety-passport", kind: "passport", title }]
      : [];
  }
  if (typeCode !== "TRAINING_AWARD" || get(attendanceOnly)) return [];

  const choices: Layout[] = [];
  const safetyZone = get(printedIdentity) && get(completedCourse) && get(safetyZoneProvider);
  const safetyInline = get(inlineName) && get(inlineCompletion);
  const safetyKind = safetyZone ? "safety-zone" : safetyInline ? "safety-inline" : null;
  if (safetyKind) {
    const driving = get(safetyDrivingTitle);
    if (driving) choices.push({ profileId: "defensive-driving", kind: safetyKind, title: driving });
    const fire = get(fireFightingTitle);
    if (fire) choices.push({ profileId: "firefighting-training", kind: safetyKind, title: fire });
  }
  const basicFirstAid = safetyInline && get(/^Course\s*:\s*Basic First Aid$/iu);
  if (basicFirstAid) choices.push({ profileId: "basic-first-aid-training", kind: "safety-inline", title: basicFirstAid });
  if (get(rospaProvider) && get(rospaGrade) && get(/^Has achieved a$/iu)) {
    for (const [index, row] of rows.entries()) {
      const first = rospaLead.exec(row.raw)?.[1];
      const next = rows[index + 1];
      if (first && next && rospaTail.test(next.raw)) {
        choices.push({ profileId: "defensive-driving", kind: "rospa", title: { ...row, raw: `${first}\n${next.raw}` } });
      }
    }
  }
  const genuineCompletion = !!get(completion) && !get(attendanceOnly);
  if (genuineCompletion && get(numeroProvider)) {
    const firstAid = get(numeroFirstAid);
    if (firstAid) choices.push({ profileId: "first-aid-aed-cpr", kind: "numero", title: firstAid });
    const fire = get(fireSafetyTitle);
    if (fire) choices.push({ profileId: "fire-safety-certificate", kind: "numero", title: fire });
    const driving = get(defensiveTitle) ?? get(numeroLightDefensive);
    if (driving) choices.push({ profileId: "defensive-driving", kind: "numero", title: driving });
  }
  if (!genuineCompletion && get(numeroProvider) && get(printedIdentity) && get(numeroOutcomeChoice)) {
    const driving = get(numeroDesertClass);
    if (driving) choices.push({ profileId: "defensive-driving", kind: "numero", title: driving });
  }
  const passed = get(/^(?:has )?successfully passed an assessment in$/iu);
  if (passed && get(/^Highfield(?: Qualifications)?$/iu)) {
    const fire = get(fireSafetyTitle);
    if (fire) choices.push({ profileId: "fire-safety-certificate", kind: "highfield", title: fire });
    for (const [index, row] of rows.entries()) {
      if (!/^Highfield Level 3 International Award in$/iu.test(row.raw)) continue;
      const second = rows[index + 1];
      if (!second || !/^Emergency First Aid and Use of AED with CPR$/iu.test(second.raw)) continue;
      const last = rows[index + 2];
      const raw = /^for all Ages$/iu.test(last?.raw ?? "") ? `${row.raw}\n${second.raw}\n${last.raw}` : `${row.raw}\n${second.raw}`;
      choices.push({ profileId: "first-aid-aed-cpr", kind: "highfield", title: { ...row, raw } });
    }
  }
  const fireFighting = get(fireFightingTitle);
  if (!safetyKind && fireFighting && rows.some(({ raw }) => /(?:^|\s)has successfully completed$/iu.test(raw))) {
    choices.push({ profileId: "firefighting-training", kind: "firefighting", title: fireFighting });
  }
  const iosh = get(/^IOSH Managing Safely$/iu);
  if (iosh && get(/^This is a certificate awarded to$/iu) && get(/^on successfully completing$/iu)) {
    choices.push({ profileId: "other-safety-training", kind: "iosh", title: iosh });
  }
  return choices;
}

const monthNames = "january february march april may june july august september october november december".split(" ");

function printedDate(raw: string, dayFirst: boolean): string | null {
  let value = raw;
  const named = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\s+(\d{4})$/iu.exec(raw);
  if (named) {
    const name = named[2].toLowerCase();
    const index = monthNames.findIndex(month => month === name || month.slice(0, 3) === name);
    if (index < 0) return null;
    value = `${named[3]}-${String(index + 1).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
  } else if (dayFirst) {
    const numeric = /^(\d{1,2})([./-])(\d{1,2})\2(\d{4})$/u.exec(raw);
    if (numeric) value = `${numeric[4]}-${numeric[3].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

const dateLabels = {
  issue_date: /^(Date of Issue|Issue Date|Issued Date)\s*[:.]?\s*(?:\.{2,}\s*)?(.+)$/iu,
  expiry_date: /^(Date of Expiry|Expiry Date|Valid Until|Valid Till)\s*[:.]?\s*(?:\.{2,}\s*)?(.+)$/iu,
  award_date: /^(Awarded on|Date of Award)\s*[:.]?\s*(.+)$/iu,
  course_date: /^(Course Date|Held On|Date of Training)\s*:\s*(.+)$/iu,
} as const;

const certificateLabel = /^(Unique Certificate No\.?|IOSH Certificate Number|Certificate Number|Certificate No\.?|Cert\.? No\.?|Cer No\.?)\s*[:#.]?\s*(?:\.{2,}\s*)?([a-z0-9][a-z0-9 ./-]{2,58})$/iu;
const learnerLabel = /^(OPITO Learner No\.?)\s*[:#]?\s*(\d{3,20})$/iu;

function readEquipmentLayout(pages: readonly SourcePage[]): TrainingLayoutResult | null {
  const originals = pages.filter(page => page.method !== rasterMethod);
  const profileId = "equipment-competency";
  const reviewed = originals.map(page => ({ page, rows: rowsOf(page.text) }));
  const testLabel = /^(Test Equipment Type)\s*:\s*([\p{L}][\p{L}0-9 -]+)$/iu;
  const achievement = reviewed.filter(({ rows }) =>
    rows.some(({ raw }) => /^Certificate of Achievement$/iu.test(raw))
    && rows.some(({ raw }) => /^This Certificate Awarded to\s*:?$/iu.test(raw))
    && rows.some(({ raw }) => testLabel.test(raw)),
  );
  if (!achievement.length) {
    return reviewed.some(({ rows }) => rows.some(({ raw }) =>
      /^Has successfully completed (?:\d+ day )?basic training program(?:me)? of$/iu.test(raw)))
      ? { profileId, fields: {}, reasons: ["equipment_completion_is_not_assessment"], limitToProofFields: true }
      : null;
  }
  if (originals.length !== 1 || achievement.length !== 1) {
    return { profileId, fields: {}, reasons: ["training_layout_multi_page"], limitToProofFields: true };
  }

  const [{ page, rows }] = achievement;
  const fields: Record<string, TrainingField> = {};
  const reasons = new Set<string>();
  const put = (key: string, row: Row, label: string, raw: string, value = raw) => {
    const conflict = `conflicting_field:${key}`;
    if (reasons.has(conflict)) return;
    if (fields[key] && fields[key].value.toLowerCase() !== value.toLowerCase()) {
      delete fields[key];
      reasons.add(conflict);
      return;
    }
    fields[key] ??= { value, raw, page: page.page, line: row.line, label, method: page.method };
  };

  for (const [index, row] of rows.entries()) {
    const following = rows[index + 1];
    const tested = testLabel.exec(row.raw);
    if (tested) put("equipment_type", row, tested[1], tested[2]);
    const provider = safetyZoneProvider.exec(row.raw)?.[0];
    if (provider) put("provider", row, "Printed assessment provider", provider);
    if (/^This Certificate Awarded to\s*:?$/iu.test(row.raw) && following
      && /^Nationality\b/iu.test(rows[index + 2]?.raw ?? "")) {
      const holder = following.raw.replace(/^(?:Mr|Mrs|Ms)\.?\s+/iu, "");
      if (nameShape.test(holder)) put("participant_name", following, row.raw, following.raw, holder);
    }
    const certificate = /(?:^|\s)(Certificate\s+(?:No|№)\.?)\s*:\s*([a-z0-9][a-z0-9/.-]+)$/iu.exec(row.raw);
    if (certificate && /\d/u.test(certificate[2])) put("certificate_number", row, certificate[1], certificate[2]);
    const placed = /^(Location of test)\s*:\s*(.+)$/iu.exec(row.raw);
    if (placed) put("test_location", row, placed[1], placed[2]);
    const date = /^(Date of Issue|Date of Expiry)\s*:?\s*(\d{1,2}\.\d{1,2}\.\d{4})(?:\s|$)/iu.exec(row.raw);
    const typed = date && printedDate(date[2], true);
    if (date && typed) put(/issue$/iu.test(date[1]) ? "issue_date" : "expiry_date", row, date[1], date[2], typed);
  }

  const testedTypes = rows.flatMap(({ raw }) => {
    const outcome = /^In recognition of successfully passed test of (.+?) operation & safety\.?$/iu.exec(raw);
    return outcome ? [outcome[1].toLowerCase()] : [];
  });
  const equipmentType = fields.equipment_type?.value.toLowerCase();
  if (testedTypes.length && !testedTypes.every(value => value === equipmentType)) {
    return { profileId, fields, reasons: [...reasons, "equipment_assessment_scope_mismatch"], limitToProofFields: true };
  }
  if (testedTypes.length && equipmentType) {
    for (const row of rows) {
      const overall = /^(?:\d+(?:\.\d+)*\s+)?(Overall Results)\s*:\s*(Good Level Achieved)$/iu.exec(row.raw);
      if (overall) put("assessment_result", row, overall[1], overall[2]);
    }
  }
  if (!fields.participant_name) reasons.add("equipment_participant_source_unconfirmed");
  if (!fields.provider) reasons.add("equipment_provider_source_unconfirmed");
  if (!fields.assessment_result) reasons.add("equipment_overall_assessment_unconfirmed");
  if (fields.issue_date && fields.expiry_date && fields.expiry_date.value <= fields.issue_date.value) {
    delete fields.expiry_date;
    reasons.add("equipment_expiry_not_after_issue");
  }
  return { profileId, fields, limitToProofFields: true, ...(reasons.size ? { reasons: [...reasons] } : {}) };
}

export function readTrainingLayout(pages: readonly SourcePage[], typeCode: string): TrainingLayoutResult | null {
  if (typeCode === "EQUIPMENT_COMPETENCY") return readEquipmentLayout(pages);
  const originals = pages.filter(page => page.method !== rasterMethod);
  const candidates = originals.flatMap(page => {
    const rows = rowsOf(page.text);
    return identify(rows, typeCode).map(layout => ({ page, rows, layout }));
  });
  if (!candidates.length) return null;
  const [{ page, rows, layout }] = candidates;
  const profileId = layout.profileId;
  if (originals.length !== 1 || candidates.length !== 1) {
    return { profileId, fields: {}, reasons: [originals.length !== 1 ? "training_layout_multi_page" : "training_layout_ambiguous"], limitToProofFields: true };
  }

  const fields: Record<string, TrainingField> = {};
  const reasons = new Set<string>();
  const set = (key: string, row: Row, label: string, raw = row.raw, value = raw, source = page) => {
    const conflict = `conflicting_field:${key}`;
    if (reasons.has(conflict)) return;
    if (fields[key] && fields[key].value.toLowerCase() !== value.toLowerCase()) {
      delete fields[key];
      reasons.add(conflict);
    } else if (!fields[key]) {
      fields[key] = { value, raw, page: source.page, line: row.line, label, method: source.method, ...(source.bounds && { bounds: source.bounds }) };
    }
  };

  if (layout.kind === "passport") {
    for (const row of rows) {
      const name = /^(?:Holder(?: Name)?|Full Name)\s*:\s*(.+)$/iu.exec(row.raw)?.[1];
      const location = /^(Issuing location)\s*:\s*(.+)$/iu.exec(row.raw);
      if (name && nameShape.test(name)) set("holder_name", row, "Holder name", name);
      if (location) set("place_of_issue", row, location[1], location[2]);
    }
    reasons.add("safety_passport_personal_endorsement_unverified");
    if (rows.some(({ raw }) => suppliedPassportHeader.test(raw))) reasons.add("safety_passport_scope_validity_unresolved");
    return { profileId, fields, reasons: [...reasons] };
  }

  // Course text is matched on its own printed row, independently of the filename and provider suggestion.
  if (layout.kind === "rospa") {
    set("course_title", layout.title, "Printed course title", layout.title.raw, "ADNOC Defensive Driving for Light Vehicles");
  } else if (layout.kind === "firefighting" || layout.kind === "safety-inline") {
    set("course_title", layout.title, "Course", layout.title.raw.replace(/^Course\s*:\s*/iu, ""));
  } else if (layout.kind === "opito") {
    set("course_title", layout.title, "Printed course title", layout.title.raw, layout.title.raw.replace(/[‐‑–]/gu, "-"));
  } else {
    set("course_title", layout.title, "Printed course title");
  }
  if (layout.scope) set("training_scope", layout.title, "Printed induction scope", layout.title.raw, layout.scope);

  const isNumero = layout.kind === "numero";
  const isInline = layout.kind === "safety-inline";
  const isNarrative = layout.kind === "safety-zone";
  const vehicle = safetyDrivingTitle.exec(layout.title.raw)?.[1];
  if ((isInline || isNarrative) && vehicle) set("training_vehicle_class", layout.title, "Printed course class", vehicle);
  const numeroVehicle = isNumero && (numeroLightDefensive.exec(layout.title.raw)?.[1] ?? numeroDesertClass.exec(layout.title.raw)?.[1]);
  if (numeroVehicle) set("training_vehicle_class", layout.title, "Printed course class", numeroVehicle);
  for (const [index, row] of rows.entries()) {
    const after = rows[index + 1];
    const afterName = rows[index + 2];
    const named = /^(?:Participant Name|Candidate Name|Trainee Name)\s*:\s*(.+)$/iu.exec(row.raw)?.[1];
    if (named && nameShape.test(named)) set("participant_name", row, "Printed participant label", named);
    const participantStatement = printedIdentity.test(row.raw) && afterName
      && (completion.test(afterName.raw) || /^attended a course at\s+/iu.test(afterName.raw)
        || (isNumero && numeroOutcomeChoice.test(afterName.raw)));
    const ioshStatement = layout.kind === "iosh" && /^This is a certificate awarded to$/iu.test(row.raw)
      && /^on successfully completing$/iu.test(afterName?.raw ?? "");
    if ((participantStatement || ioshStatement) && after && nameShape.test(after.raw)) {
      set("participant_name", after, row.raw);
    }

    if (isInline) {
      const holder = inlineName.exec(row.raw)?.[1];
      const outcome = inlineCompletion.exec(row.raw)?.[1];
      if (holder && nameShape.test(holder)) set("participant_name", row, "Name", holder);
      if (outcome) set("printed_outcome", row, "Printed completion statement", outcome, "completed");
      const temporary = /^(This card is temporary only)(?:\s|$)/iu.exec(row.raw)?.[1];
      if (temporary) set("temporary_status", row, "Printed temporary status", temporary);
      const referenceCaption = /^(Cert\.\s*No\s*:)\s*Authorized Sig\.\s*$/iu.exec(row.raw)?.[1];
      if (referenceCaption && after && /^[a-z0-9][a-z0-9./-]{2,58}$/iu.test(after.raw) && /\d/u.test(after.raw)) {
        set("certificate_number", after, referenceCaption);
      }
      if (/\bInstructor Name\s*:\s*$/iu.test(row.raw) && after && nameShape.test(after.raw)) {
        set("trainer", after, "Instructor Name");
      }
    }
    if (isNarrative) {
      const provider = safetyZoneProvider.exec(row.raw)?.[0];
      if (provider) set("provider", row, "Printed training provider", provider);
      if (printedIdentity.test(row.raw) && after && nameShape.test(after.raw) && /^\(\s*ID\s*:/iu.test(afterName?.raw ?? "")) {
        set("participant_name", after, row.raw);
      }
      if (completedCourse.test(row.raw)) set("printed_outcome", row, "Printed completion statement", row.raw, "completed");
      if (/^On\s+/iu.test(row.raw)) {
        const raw = row.raw.replace(/^On\s+/iu, "");
        const date = printedDate(raw, false);
        if (date) set("course_date", row, "On", raw, date);
      }
    }
    if (layout.kind === "rospa") {
      const provider = rospaProvider.exec(row.raw)?.[0];
      if (provider) set("provider", row, "Printed awarding provider", provider);
      if (printedIdentity.test(row.raw) && after && nameShape.test(after.raw) && /^Has achieved a$/iu.test(afterName?.raw ?? "")) {
        set("participant_name", after, row.raw);
      }
      const grade = rospaGrade.exec(row.raw);
      if (grade) {
        set("printed_outcome", row, grade[1], grade[2]);
        if (/^Fail$/iu.test(grade[2])) reasons.add("training_result_does_not_support_award");
      }
      const duration = rospaTail.exec(row.raw);
      if (duration) {
        set("training_vehicle_class", row, "Printed course class", "Light\n" + duration[1], "Light Vehicles");
        set("printed_validity_duration", row, "Printed validity duration", duration[2], duration[3]);
      }
      const qualification = /(?:^|\s)(Qualification Number)\s*:\s*([a-z0-9./-]+)$/iu.exec(row.raw);
      if (qualification && /\d/u.test(qualification[2])) set("qualification_number", row, qualification[1], qualification[2]);
    }

    const ref = certificateLabel.exec(row.raw);
    if (ref && /\d/u.test(ref[2])) set("certificate_number", row, ref[1], ref[2]);
    const learner = learnerLabel.exec(row.raw);
    if (layout.kind === "opito" && learner) set("learner_reference", row, learner[1], learner[2]);
    for (const [key, pattern] of Object.entries(dateLabels)) {
      const match = pattern.exec(row.raw);
      if (!match) continue;
      const raw = isInline && key === "issue_date" ? match[2].replace(/\s+Signature\s*:\s*$/iu, "").trim() : match[2].trim();
      const value = printedDate(raw, isNumero || isInline);
      if (value) set(key, row, match[1], raw, value);
    }

    if ((layout.kind === "academy" && /^ADNOC Technical Academy$/iu.test(row.raw)) || (isNumero && numeroProvider.test(row.raw))) {
      set("provider", row, "Printed training provider");
    }
    if ((layout.kind === "academy" || layout.kind === "offshore" || isNumero || layout.kind === "firefighting") && completion.test(row.raw)) {
      set("printed_outcome", row, "Printed completion statement", row.raw, "completed");
    }
    if (isNumero && numeroDesertClass.test(layout.title.raw) && numeroOutcomeChoice.test(row.raw)) {
      set("printed_outcome", row, "Printed alternative outcomes", row.raw, "has successfully attended/passed");
      reasons.add("training_outcome_alternatives_unresolved");
    }

    if (layout.kind === "opito") {
      const place = /^attended a course at\s+(.+)$/iu.exec(row.raw);
      if (place) {
        const abbreviation = /^\(\s*([A-Z]{3,12})\s*\)$/u.exec(after?.raw ?? "")?.[1];
        set("provider", row, "attended a course at", place[1], abbreviation ? `${place[1]} (${abbreviation})` : place[1]);
      }
      if (opitoStandard.test(row.raw)) set("awarding_body", row, "OPITO-approved standard", row.raw, "OPITO");
      if (opitoOutcome.test(row.raw) && opitoStandard.test(after?.raw ?? "")) {
        const raw = `${row.raw}\n${after.raw}`;
        const value = `${row.raw.replace(/^and /iu, "")} ${after.raw.replace(/\s*:$/u, "")}`;
        set("printed_outcome", row, "OPITO assessment statement", raw, value);
      }
    }

    if (layout.kind === "highfield") {
      if (/^Highfield(?: Qualifications)?$/iu.test(row.raw)) set("awarding_body", row, "Printed awarding body", row.raw, "Highfield");
      if (/^(?:has )?successfully passed an assessment in$/iu.test(row.raw)) {
        set("printed_outcome", row, "Printed assessment statement", row.raw, "passed_assessment");
      }
    }

    if (layout.kind === "iosh") {
      if (/^on successfully completing$/iu.test(row.raw)) set("printed_outcome", row, "Printed award statement", row.raw, row.raw.replace(/^on\s+/iu, ""));
      if (/^NATIONAL CENTRE FOR [\p{L} ]+ AND$/iu.test(row.raw) && /^TRAINING$/iu.test(after?.raw ?? "")) {
        set("provider", row, "Training organisation", `${row.raw}\n${after.raw}`, `${row.raw} ${after.raw}`);
      }
    }
  }

  // Raster supplements are first bound to the exact original SHA-256 by the caller.
  const rasters = pages.filter(region => region.method === rasterMethod && region.page === page.page
    && region.bounds?.length === 4 && region.bounds.every(value => Number.isFinite(value) && value >= 0)
    && region.bounds[0] < region.bounds[2] && region.bounds[1] < region.bounds[3]);
  if (isInline) {
    const providers = rasters.filter(region => region.region === "issuer-logo").flatMap(raster =>
      rowsOf(raster.text)
        .filter(({ raw }) => /^Safety Zone S\s*&\s*S Consultancy$/iu.test(raw))
        .map(row => ({ row, raster })),
    );
    if (providers.length === 1) {
      const [{ row, raster }] = providers;
      set("provider", row, "Printed issuer logo", row.raw, row.raw, raster);
    }
  }
  if (layout.kind === "academy") {
    const labelled = !!fields.certificate_number && !!fields.issue_date && !!fields.expiry_date;
    if (!labelled) reasons.add("training_labelled_layout_incomplete");
    const nativeHolder = page.method === "pdf-native" && layout.title.line === rows[1]?.line
      && labelled && rows.some(({ raw }) => /^Emirates ID\s*:/iu.test(raw));
    if (nativeHolder && nameShape.test(rows[0].raw)) set("participant_name", rows[0], "Native certificate holder row");

    if (rasters.length > 1) reasons.add("training_raster_proof_ambiguous");
    if (rasters.length === 1) {
      const raster = rasters[0];
      const lines = rowsOf(raster.text);
      const provider = lines.find(({ raw }) => /^ADNOC Technical Academy$/iu.test(raw));
      const outcome = lines.find(({ raw }) => /^has attended and completed$/iu.test(raw));
      const heading = /(?:^|\n)CERTIFICATE(?:\s+|\n)OF COMPLETION(?:\n|$)/iu.test(raster.text);
      if (heading && provider && outcome) {
        if (!fields.provider) set("provider", provider, "Printed Academy provider", provider.raw, provider.raw, raster);
        if (!fields.printed_outcome) set("printed_outcome", outcome, "Printed completion statement", outcome.raw, "completed", raster);
      }
    }
  }
  if (fields.temporary_status && !fields.expiry_date) reasons.add("training_temporary_validity_unconfirmed");
  if (isNumero && profileId === "fire-safety-certificate") reasons.add("training_provider_completion_distinct_from_highfield_assessment");
  if (layout.kind === "highfield" && profileId === "first-aid-aed-cpr") reasons.add("training_assessment_distinct_from_provider_completion");
  if (!fields.participant_name) reasons.add("training_participant_source_unconfirmed");
  if (!fields.provider) reasons.add("training_provider_source_unconfirmed");
  if (!fields.printed_outcome) reasons.add("training_outcome_source_unconfirmed");

  return { profileId, fields, ...(reasons.size ? { reasons: [...reasons] } : {}) };
}
