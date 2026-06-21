"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { previewDmsStandardFileName } from "@/server/actions/dms/standard-file-name";
import { stripFilenameExtension } from "@/lib/dms/standard-file-name";
import type { ReviewFormValues } from "./dms-ai-intake-review-form";
import type { DmsDocumentTypeRow } from "@/server/actions/dms/document-types";
import type { IntakeSessionData } from "@/server/actions/dms/ai-intake";

type Props = {
  session: IntakeSessionData;
  values: ReviewFormValues;
  docTypes: DmsDocumentTypeRow[];
  onChange: (patch: Partial<ReviewFormValues>) => void;
};

export function DmsStandardFileNameField({ session, values, docTypes, onChange }: Props) {
  const [isPending, startTransition] = useTransition();
  const [missingParts, setMissingParts] = useState<string[]>([]);
  const userEditedRef = useRef(false);
  const selectedType = docTypes.find((t) => t.id === values.documentTypeId) ?? null;

  useEffect(() => {
    if (!values.documentTypeId || !selectedType) return;

    const timer = setTimeout(() => {
      startTransition(async () => {
        const metadataValues = Object.entries(values.metadataValues).map(([id, v]) => ({
          definitionId: parseInt(id, 10),
          rawValue: v.rawValue,
        }));

        const res = await previewDmsStandardFileName({
          typeCode: selectedType.type_code,
          requiresExpiryTracking: selectedType.requires_expiry_tracking,
          expiryDate: values.expiryDate || null,
          originalFilename: session.original_filename,
          extractedFields: session.ai_result?.extracted_fields_json ?? null,
          metadataValues,
          uploadSessionId: session.id,
          standardFileNameOverride: userEditedRef.current ? values.standardFileName : null,
          suggestedDescription: values.description || session.ai_result?.suggested_description || null,
          suggestedTitle: values.title || session.ai_result?.suggested_title || null,
        });

        if (!res.success || !res.data) return;

        const suggestedBase = stripFilenameExtension(res.data.fileName);
        if (!userEditedRef.current && suggestedBase !== values.standardFileName) {
          onChange({ standardFileName: suggestedBase });
        }
        setMissingParts(res.data.validation.missing);
      });
    }, 300);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- standardFileName excluded to avoid edit loops
  }, [
    values.documentTypeId,
    values.expiryDate,
    values.description,
    values.title,
    values.metadataValues,
    session.id,
    session.original_filename,
    session.ai_result?.extracted_fields_json,
    selectedType?.type_code,
    selectedType?.requires_expiry_tracking,
    onChange,
  ]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium">Standard File Name</label>
        {isPending && (
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Updating…
          </span>
        )}
      </div>
      <Input
        value={values.standardFileName}
        onChange={(e) => {
          userEditedRef.current = true;
          onChange({ standardFileName: e.target.value });
        }}
        placeholder="Document_type_Owner_DOC_NO_Expiry"
        className="text-sm font-mono"
      />
      <p className="text-xs text-muted-foreground">
        Original upload: {session.original_filename}
      </p>
      {missingParts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {missingParts.map((part) => (
            <Badge key={part} variant="outline" className="text-[10px] border-amber-300 text-amber-800 bg-amber-50">
              Missing: {part}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
