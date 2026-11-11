export type ColumnLayoutValue = { id: string; width: number; visible: boolean };

export type ListColumn = ColumnLayoutValue & {
  label: string;
  required?: boolean;
  minWidth?: number;
  maxWidth?: number;
  resizable?: boolean;
  position?: "start" | "end";
};

export function columnWidthBounds(column: ListColumn) {
  if (column.resizable === false) return { min: column.width, max: column.width };
  const min = Math.max(1, Math.ceil(column.minWidth ?? Math.min(80, column.width)));
  const max = Math.max(min, Math.floor(column.maxWidth ?? Math.max(640, column.width)));
  return { min, max };
}

export function normalizeColumns<T extends ColumnLayoutValue>(values: readonly T[], definitions: readonly ListColumn[]): ListColumn[] {
  const schema = new Map(definitions.map(column => [column.id, column]));
  const seen = new Set<string>();
  const result: ListColumn[] = [];

  for (const value of [...values, ...definitions]) {
    const definition = schema.get(value.id);
    if (!definition || seen.has(value.id)) continue;
    seen.add(value.id);
    const { min, max } = columnWidthBounds(definition);
    const width = Number.isFinite(value.width) ? Math.round(value.width) : definition.width;
    result.push({
      ...definition,
      visible: definition.required === true || value.visible === true,
      width: Math.max(min, Math.min(max, width)),
    });
  }

  return [
    ...result.filter(column => column.position === "start"),
    ...result.filter(column => column.position === undefined),
    ...result.filter(column => column.position === "end"),
  ];
}

const MAX_LAYOUT_BYTES = 16_384;
const MAX_COLUMNS = 160;
const SAFE_COLUMN_ID = /^[a-zA-Z][a-zA-Z0-9_.-]{0,95}$/;

/** The disk format is deliberately limited to stable column IDs and layout values. */
export function encodeColumnLayout(columns: readonly ListColumn[]): string | null {
  const values = columns.filter(column => SAFE_COLUMN_ID.test(column.id));
  if (values.length > MAX_COLUMNS) return null;
  const encoded = JSON.stringify(values.map(({ id, visible, width }) => ({ id, visible, width })));
  return encoded.length <= MAX_LAYOUT_BYTES ? encoded : null;
}

export function decodeColumnLayout(raw: string | null): ColumnLayoutValue[] | null {
  if (!raw || raw.length > MAX_LAYOUT_BYTES) return null;
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values) || values.length > MAX_COLUMNS) return null;
    return values.flatMap(value => {
      if (!value || typeof value !== "object" || typeof value.id !== "string" ||
        !SAFE_COLUMN_ID.test(value.id) || typeof value.visible !== "boolean" ||
        !Number.isSafeInteger(value.width) || value.width < 1) return [];
      return [{ id: value.id, visible: value.visible, width: value.width }];
    });
  } catch {
    return null;
  }
}
