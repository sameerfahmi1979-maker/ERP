"use client";

import { FileText, FileImage, FileSpreadsheet, File } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileTypeIconProps {
  mimeType: string;
  className?: string;
}

export function FileTypeIcon({ mimeType, className }: FileTypeIconProps) {
  const base = cn("h-4 w-4", className);

  if (mimeType === "application/pdf")
    return <FileText className={cn(base, "text-red-500")} />;

  if (mimeType.startsWith("image/"))
    return <FileImage className={cn(base, "text-purple-500")} />;

  if (
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
    return <FileSpreadsheet className={cn(base, "text-green-600")} />;

  if (
    mimeType === "application/msword" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return <FileText className={cn(base, "text-blue-600")} />;

  return <File className={cn(base, "text-muted-foreground")} />;
}

export function getMimeTypeLabel(mimeType: string): string {
  const map: Record<string, string> = {
    "application/pdf": "PDF",
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/tiff": "TIFF",
    "image/webp": "WebP",
    "application/msword": "DOC",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
    "application/vnd.ms-excel": "XLS",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  };
  return map[mimeType] ?? mimeType.split("/")[1]?.toUpperCase() ?? "FILE";
}
