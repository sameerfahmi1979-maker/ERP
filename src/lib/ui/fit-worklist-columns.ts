import { columnWidthBounds, type ListColumn } from "./worklist-column-layout";

export function fitWorklistColumns(columns: readonly ListColumn[], availableWidth: number | null) {
  const total = columns.reduce((sum, column) => sum + column.width, 0);
  if (availableWidth === null || total <= availableWidth) return columns;

  const minimums = columns.map(column => {
    const { min } = columnWidthBounds(column);
    // Reserve space for selection controls and rows with interactive content.
    if (column.id === "selection") return column.width;
    const usable = column.id === "record_details" ? 240 : column.id === "actions" ? 128 : min;
    return Math.min(column.width, Math.max(min, usable));
  });
  const minimumTotal = minimums.reduce((sum, width) => sum + width, 0);
  const spare = Math.max(0, Math.floor(availableWidth) - minimumTotal);
  const shrinkable = total - minimumTotal;
  if (!shrinkable) return columns;

  // Allocate the extra space cumulatively so rounding never adds a stray pixel.
  let capacity = 0;
  let allocated = 0;
  return columns.map((column, index) => {
    const minimum = minimums[index];
    capacity += column.width - minimum;
    const next = Math.floor(spare * capacity / shrinkable);
    const width = minimum + next - allocated;
    allocated = next;
    return { ...column, width };
  });
}
