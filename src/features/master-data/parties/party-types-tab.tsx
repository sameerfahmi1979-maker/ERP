"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Star } from "lucide-react";
import type { AuthContext } from "@/lib/rbac/check";
import {
  getPartyTypes,
  getPartyTypeAssignments,
  savePartyTypeAssignments,
} from "@/server/actions/master-data/parties";

type PartyTypesTabProps = {
  partyId: number | null | undefined;
  disabled?: boolean;
  authContext: AuthContext;
  defaultTypeCode?: string | null;
};

export function PartyTypesTab({ partyId, disabled, authContext, defaultTypeCode }: PartyTypesTabProps) {
  const canManageTypes = authContext.permissionCodes?.includes("master_data.parties.manage_types");

  const { data: allTypes, isLoading: typesLoading } = useQuery({
    queryKey: ["party_types"],
    queryFn: async () => {
      const r = await getPartyTypes();
      return r.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: assignments, isLoading: assignmentsLoading, refetch } = useQuery({
    queryKey: ["party_type_assignments", partyId],
    queryFn: async () => {
      if (!partyId) return [];
      const r = await getPartyTypeAssignments(partyId);
      return r.data ?? [];
    },
    enabled: !!partyId,
    staleTime: 0,
  });

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [primaryId, setPrimaryId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Sync state from loaded assignments, or preselect defaultTypeCode for new parties
  useEffect(() => {
    if (assignments && assignments.length > 0) {
      setSelectedIds(new Set(assignments.map((a) => a.party_type_id)));
      const primary = assignments.find((a) => a.is_primary);
      setPrimaryId(primary?.party_type_id ?? null);
    } else if (!partyId && defaultTypeCode && allTypes) {
      const matchingType = allTypes.find((t) => t.type_code === defaultTypeCode);
      if (matchingType) {
        setSelectedIds(new Set([matchingType.id]));
        setPrimaryId(matchingType.id);
      }
    }
  }, [assignments, partyId, defaultTypeCode, allTypes]);

  const toggleType = (typeId: number) => {
    if (disabled || !canManageTypes) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(typeId)) {
        next.delete(typeId);
        if (primaryId === typeId) setPrimaryId(null);
      } else {
        next.add(typeId);
      }
      return next;
    });
  };

  const setPrimary = (typeId: number) => {
    if (disabled || !canManageTypes) return;
    if (!selectedIds.has(typeId)) {
      setSelectedIds((prev) => new Set([...prev, typeId]));
    }
    setPrimaryId(typeId);
  };

  const handleSave = async () => {
    if (!partyId) {
      toast.error("Save the party first before assigning types");
      return;
    }
    setIsSaving(true);
    try {
      const result = await savePartyTypeAssignments(
        partyId,
        Array.from(selectedIds),
        primaryId
      );
      if (result.success) {
        toast.success("Party types saved");
        refetch();
      } else {
        toast.error(result.error ?? "Failed to save party types");
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (typesLoading || (partyId && assignmentsLoading)) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  const isReadOnly = disabled || !canManageTypes;

  return (
    <div className="space-y-4">
      {!partyId && (
        <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
          Save the party first to assign party types.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(allTypes ?? []).map((type) => {
          const isSelected = selectedIds.has(type.id);
          const isPrimary = primaryId === type.id;
          return (
            <div
              key={type.id}
              className={`flex items-center justify-between rounded-md border p-3 transition-colors ${
                isSelected ? "border-primary bg-primary/5" : "border-muted"
              } ${!isReadOnly ? "cursor-pointer hover:border-primary/50" : ""}`}
              onClick={() => !isReadOnly && toggleType(type.id)}
            >
              <div className="flex items-center gap-3">
                <Checkbox
                  id={`type-${type.id}`}
                  checked={isSelected}
                  onCheckedChange={() => !isReadOnly && toggleType(type.id)}
                  disabled={isReadOnly}
                  className="pointer-events-none"
                />
                <Label
                  htmlFor={`type-${type.id}`}
                  className="cursor-pointer font-medium text-sm"
                >
                  {type.type_name}
                </Label>
              </div>
              {isSelected && (
                <button
                  type="button"
                  title={isPrimary ? "Primary type" : "Set as primary"}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isReadOnly) setPrimary(type.id);
                  }}
                  disabled={isReadOnly}
                  className="p-1 rounded hover:bg-muted"
                >
                  <Star
                    className={`h-4 w-4 ${isPrimary ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                  />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <span className="text-xs text-muted-foreground self-center">Selected:</span>
          {Array.from(selectedIds).map((id) => {
            const type = allTypes?.find((t) => t.id === id);
            return type ? (
              <Badge key={id} variant={id === primaryId ? "default" : "secondary"}>
                {type.type_name}
                {id === primaryId && " ★"}
              </Badge>
            ) : null;
          })}
        </div>
      )}

      {!isReadOnly && partyId && (
        <div className="flex justify-end pt-2">
          <Button type="button" size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Types"}
          </Button>
        </div>
      )}
    </div>
  );
}
