/** Numbering is UTC, matching the existing database clock. Never use browser locale. */
export const NUMBERING_TOKENS = ['DOC','SEQ','SEQ3','SEQ4','SEQ5','SEQ6','SEQ12','YYYY','YY','MM','DD'] as const;
const tokenPattern = /\{(DOC|SEQ(?:3|4|5|6|12)?|YYYY|YY|MM|DD)\}/g;

export function numberingTemplateError(template: string): string | null {
  if (!template || template.length > 100) return 'Enter a format of 1–100 characters.';
  if (/[{}]/.test(template.replace(tokenPattern, ''))) return 'Use only supported tokens and matching braces.';
  if (!template.includes('{DOC}')) return 'Include the {DOC} token.';
  if (!/\{SEQ(?:3|4|5|6|12)?\}/.test(template)) return 'Include a sequence token, such as {SEQ4}.';
  return null;
}

export function numberingResetError(template: string, policy: string): string | null {
  if (!['never','yearly','monthly'].includes(policy)) return 'Choose a supported reset policy.';
  if (policy !== 'never' && !template.includes('{YYYY}')) return 'Resetting sequences require {YYYY} to prevent reused numbers.';
  if (policy === 'monthly' && !template.includes('{MM}')) return 'Monthly sequences also require {MM}.';
  return null;
}

export type NumberFormat = {document_prefix:string; format_template:string; sequence_length:number; padding_character:string};
export function formatReference(rule: NumberFormat, sequence: number | bigint, at: Date): string {
  const error = numberingTemplateError(rule.format_template);
  if (error) throw new Error(error);
  if ((typeof sequence === 'number' && !Number.isSafeInteger(sequence)) || sequence < 1 ||
      !Number.isInteger(rule.sequence_length) || rule.sequence_length < 1 || rule.sequence_length > 12 ||
      !/^[A-Za-z0-9]$/.test(rule.padding_character) || !/^[A-Z0-9_]{1,20}$/.test(rule.document_prefix) ||
      Number.isNaN(at.getTime())) throw new Error('Invalid number-format inputs.');
  const digits = String(sequence);
  const year = String(at.getUTCFullYear()).padStart(4,'0');
  const values: Record<string,string> = {DOC:rule.document_prefix,YYYY:year,YY:year.slice(-2),
    MM:String(at.getUTCMonth()+1).padStart(2,'0'),DD:String(at.getUTCDate()).padStart(2,'0')};
  return rule.format_template.replace(tokenPattern, (_match, token: string) => {
    if (token.startsWith('SEQ')) {
      const width = token === 'SEQ' ? rule.sequence_length : Number(token.slice(3));
      // Minimum width, not maximum width. PostgreSQL lpad must use this same rule.
      return digits.padStart(width,rule.padding_character);
    }
    return values[token];
  });
}

/** Catalogue preview is illustrative; only an authorized DB reservation allocates. */
export function illustrativeReference(rule: NumberFormat & {next_sequence_number:number}, at: Date): string {
  try { return formatReference(rule,rule.next_sequence_number,at); }
  catch { return 'Preview unavailable — review rule'; }
}
