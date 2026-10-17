"use client";
import {createContext, useContext, type ReactNode} from "react";

// Keep section drafts mounted while opting its read observers out of background
// work. A hidden section is paused, not unauthorized and not a successful zero.
const RecordReadActive = createContext(true);
export function RecordReadActivity({active, children}: {active:boolean; children:ReactNode}) {
  const parent = useContext(RecordReadActive);
  return <RecordReadActive.Provider value={parent && active}>{children}</RecordReadActive.Provider>;
}
export function useRecordReadActive() {return useContext(RecordReadActive);}
