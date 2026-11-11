"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePersistentUiState, useWorklistLayoutOwner } from "./use-persistent-ui-state";
import { worklistColumnStorageKey } from "@/lib/ui/worklist-column-ids";
import { decodeColumnLayout, encodeColumnLayout, normalizeColumns, type ColumnLayoutValue, type ListColumn } from "@/lib/ui/worklist-column-layout";

export function useWorklistColumns(
  memoryId: string | undefined,
  definitions: ListColumn[],
  preferenceId: string | null | undefined = memoryId,
) {
  const owner = useWorklistLayoutOwner();
  const storageKey = worklistColumnStorageKey(owner, preferenceId);
  // Share the layout across mounted instances of the same worklist, independently of paging/search.
  const memoryKey = storageKey ?? (memoryId ? `list-columns:${memoryId}` : undefined);
  const [stored, setStored] = usePersistentUiState<ColumnLayoutValue[] | null | undefined>(memoryKey, undefined);
  const defaults = useMemo(() => normalizeColumns([], definitions), [definitions]);
  const columns = useMemo(() => stored ? normalizeColumns(stored, definitions) : defaults, [stored, definitions, defaults]);
  const visible = useMemo(() => columns.filter(column => column.visible), [columns]);
  const activeStorageKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    activeStorageKey.current = storageKey;
    return () => { activeStorageKey.current = undefined; };
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || stored !== undefined) return;
    let saved: ColumnLayoutValue[] | null = null;
    try {
      saved = decodeColumnLayout(window.localStorage.getItem(storageKey));
    } catch {
      // Restricted browser storage still allows edits in workspace memory.
    }
    setStored(current => current === undefined ? saved : current);
  }, [storageKey, stored, setStored]);

  function setColumns(next: readonly ColumnLayoutValue[]) {
    const normalized = normalizeColumns(next, definitions);
    const layout = normalized.map(({ id, visible, width }) => ({ id, visible, width }));
    const isDefault = normalized.every((column, index) =>
      column.id === defaults[index].id && column.visible === defaults[index].visible && column.width === defaults[index].width);
    setStored(isDefault ? null : layout);

    if (!storageKey || activeStorageKey.current !== storageKey) return;
    try {
      if (isDefault) {
        window.localStorage.removeItem(storageKey);
      } else {
        const encoded = encodeColumnLayout(normalized);
        if (encoded !== null) window.localStorage.setItem(storageKey, encoded);
      }
    } catch {
      // Keep the applied layout in memory if disk storage is disabled or full.
    }
  }

  return { columns, defaults, visible, setColumns };
}
