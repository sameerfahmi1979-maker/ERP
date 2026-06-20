"use client";

import { Search, MapPin, AlertTriangle, FileSearch, Copy, Mail, RefreshCw, ListChecks } from "lucide-react";

interface ActionChip {
  label: string;
  prompt: string;
  icon: React.ReactNode;
}

const ACTION_CHIPS: ActionChip[] = [
  { label: "Search ERP", prompt: "Search for ", icon: <Search className="h-3.5 w-3.5" /> },
  { label: "Explain Risk", prompt: "Explain the risk score for this entity", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  { label: "Compliance", prompt: "What are the open compliance issues?", icon: <FileSearch className="h-3.5 w-3.5" /> },
  { label: "Duplicates", prompt: "Show duplicate candidates", icon: <Copy className="h-3.5 w-3.5" /> },
  { label: "Email Draft", prompt: "Prepare an email draft about", icon: <Mail className="h-3.5 w-3.5" /> },
  { label: "Renewal Note", prompt: "Prepare a renewal note for", icon: <RefreshCw className="h-3.5 w-3.5" /> },
  { label: "Next Actions", prompt: "What are the recommended next actions?", icon: <ListChecks className="h-3.5 w-3.5" /> },
  { label: "Open Record", prompt: "Open record for ", icon: <MapPin className="h-3.5 w-3.5" /> },
];

interface AssistantActionChipsProps {
  onChipClick: (prompt: string) => void;
}

export function AssistantActionChips({ onChipClick }: AssistantActionChipsProps) {
  return (
    <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-slate-100">
      {ACTION_CHIPS.map((chip) => (
        <button
          key={chip.label}
          type="button"
          onClick={() => onChipClick(chip.prompt)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-600 bg-white border border-slate-200 rounded-full hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700 transition-colors"
        >
          {chip.icon}
          {chip.label}
        </button>
      ))}
    </div>
  );
}
