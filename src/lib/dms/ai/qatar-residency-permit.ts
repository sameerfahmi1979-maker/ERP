export const FOREIGN_IMMIGRATION_TYPE = "FOREIGN_IMMIGRATION_CREDENTIAL";

type PermitField = { fieldCode: string; value: string; sourceLabel: string };

export function hasQatarResidencyPermitHeadings(text: string): boolean {
  return /^[ \t]*State of Qatar[ \t]*\r?$/im.test(text)
    && /^[ \t]*Residency Permit[ \t]*\r?$/im.test(text);
}

function labelledValue(side: string, label: RegExp): string | null {
  const values = new Set(side.split(/\r?\n/).map(line => line.trim().match(label)?.[1]?.trim()).filter(Boolean));
  return values.size === 1 ? [...values][0] ?? null : null;
}

function printedDate(raw: string | null): string | null {
  const match = raw?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

/** Read the checked bilingual layout from retained OCR with explicit side boundaries. */
export function readQatarWorkResidencyPermit(text: string): PermitField[] | null {
  const sides = text.trim().split(/^\[(Front|Back|Reverse)\]\s*$/im);
  if (sides.length !== 5 || sides[0].trim() || !/^front$/i.test(sides[1]) || !/^(back|reverse)$/i.test(sides[3])) return null;
  const front = sides[2], back = sides[4];
  if (!hasQatarResidencyPermitHeadings(front)) return null;

  const holder = labelledValue(front, /^Name\s*:\s*(.+)$/i);
  const personalId = labelledValue(front, /^ID\s*\.?\s*No\.?\s*:\s*(.+)$/i);
  const serial = labelledValue(back, /^Serial\s+No\.?\s*:\s*(.+)$/i);
  const permitExpiry = printedDate(labelledValue(front, /^Expiry\s*:\s*(.+)$/i));
  const passportExpiry = printedDate(labelledValue(back, /^Passport\s+Expiry\s*:\s*(.+)$/i));
  const residency = labelledValue(back, /^Residency\s+Type\s*:\s*(.+)$/i);
  if (!holder || !personalId || !/^\d{11}$/.test(personalId) || !serial || !/^\d{8,24}$/.test(serial)
    || serial === personalId || !permitExpiry || !passportExpiry || residency !== "عمل") return null;

  const fields: PermitField[] = [
    { fieldCode: "issuer_country", value: "QA", sourceLabel: "Front: State of Qatar" },
    { fieldCode: "credential_kind", value: "residence_permit", sourceLabel: "Front: Residency Permit" },
    { fieldCode: "printed_title", value: "State of Qatar Residency Permit", sourceLabel: "Front: State of Qatar / Residency Permit" },
    { fieldCode: "holder_name_printed_en", value: holder, sourceLabel: "Front: Name" },
    { fieldCode: "qatar_personal_id", value: personalId, sourceLabel: "Front: ID.No" },
    { fieldCode: "permit_card_serial", value: serial, sourceLabel: "Reverse: Serial No" },
    { fieldCode: "permit_expiry_date", value: permitExpiry, sourceLabel: "Front: Expiry" },
    { fieldCode: "supporting_passport_expiry_date", value: passportExpiry, sourceLabel: "Reverse: Passport Expiry" },
    { fieldCode: "residency_type_raw", value: residency, sourceLabel: "Reverse: Residency Type" },
    { fieldCode: "residency_type", value: "work", sourceLabel: "Reverse: Residency Type (عمل)" },
  ];
  const optional = [
    { fieldCode: "holder_name_printed_ar", value: labelledValue(front, /^الاسم\s*:\s*(.+)$/), sourceLabel: "Front: الاسم" },
    { fieldCode: "date_of_birth", value: printedDate(labelledValue(front, /^D\s*\.\s*O\s*\.\s*B\.?\s*:\s*(.+)$/i)), sourceLabel: "Front: D.O.B." },
    { fieldCode: "nationality", value: labelledValue(front, /^Nationality\s*:\s*(.+)$/i), sourceLabel: "Front: Nationality" },
    { fieldCode: "occupation_raw", value: labelledValue(front, /^Occupation\s*:\s*(.+)$/i), sourceLabel: "Front: Occupation" },
    { fieldCode: "supporting_passport_number", value: labelledValue(back, /^Passport\s+Number\s*:\s*([A-Z0-9]+)$/i), sourceLabel: "Reverse: Passport Number" },
    { fieldCode: "printed_employer_ar", value: labelledValue(back, /^Employer\s*:\s*(.+)$/i), sourceLabel: "Reverse: Employer" },
    { fieldCode: "issuing_authority_raw", value: /\bMinistry of Interior\b/i.test(text) ? "Ministry of Interior" : null, sourceLabel: "Visible security background" },
    { fieldCode: "issuing_official_title", value: /General Director of the General\s+Directorate of Passports/i.test(back) ? "General Director of the General Directorate of Passports" : null, sourceLabel: "Reverse: issuing sign-off title" },
    { fieldCode: "holder_signature_present", value: /\[Handwritten holder signature:\s*[^\]]+\]/i.test(back) ? "true" : null, sourceLabel: "Reverse: holder signature region" },
  ];
  for (const { fieldCode, value, sourceLabel } of optional) {
    if (value) fields.push({ fieldCode, value, sourceLabel });
  }
  return fields;
}
