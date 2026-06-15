export const DMS_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const DMS_ALLOWED_EXTENSIONS = [
  "pdf", "jpg", "jpeg", "png", "tif", "tiff", "webp",
  "doc", "docx", "xls", "xlsx",
];

export const DMS_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

// DMS 13 — max files per multi-file batch upload (v1).
export const DMS_MAX_BATCH_FILES = 10;
