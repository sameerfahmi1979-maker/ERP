import type { SingleUploadRequest } from "@/lib/dms/single-upload-admission";
import { effectiveDmsMime, validBatchFilename } from "@/lib/dms/batch-admission";

export type MobileDraft = {
  revision?: string;
  files: File[];
  submission?: { file: File; request: SingleUploadRequest };
  uploaded?: { id: number; code: string; duplicate: boolean };
};

export async function mobileDraftStorage(
  key: string,
  value?: MobileDraft | null,
): Promise<MobileDraft | undefined> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("algt-mobile-dms", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction("drafts", value === undefined ? "readonly" : "readwrite");
      const store = transaction.objectStore("drafts");
      const request = value === undefined ? store.get(key) : value === null ? store.delete(key) : store.put(value, key);
      transaction.oncomplete = () => resolve(value === undefined ? request.result : undefined);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function buildMobileDocument(files: File[]): Promise<File> {
  if (!files.length) throw new Error("Add at least one photo or a PDF.");
  if (files.length === 1) return files[0];
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ compress: true });
  for (const [index, file] of files.entries()) {
    const canvas = await drawPhoto(file, 2200, `Page ${index + 1} could not be opened. Replace it with a JPEG or PNG.`);
    if (index) pdf.addPage();
    const fit = Math.min(190 / canvas.width, 277 / canvas.height);
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", 10, 10, canvas.width * fit, canvas.height * fit);
    canvas.width = 0;
  }
  return new File([pdf.output("blob")], "Scanned document.pdf", { type: "application/pdf" });
}

async function drawPhoto(file: File, maxDimension: number, decodeError: string) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => { throw new Error(decodeError); });
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This device could not prepare the image.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function normalizeMobileFile(file: File): Promise<File> {
  if (!validBatchFilename(file.name)) throw new Error("Rename this file before adding it to the draft.");
  if (/\.(heic|heif)$/i.test(file.name) && /^(?:image\/(?:heic|heif)|application\/octet-stream)?$/.test(file.type)) {
    const source = file.type.startsWith("image/") ? file : new File([file], file.name, {
      type: /\.heif$/i.test(file.name) ? "image/heif" : "image/heic",
    });
    const canvas = await drawPhoto(source, 3000, "This browser could not open the HEIC photo. Export it as JPEG and try again.");
    try {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.92));
      if (!blob?.size || blob.type !== "image/jpeg") throw new Error("This browser could not prepare the JPEG. Export the photo as JPEG and try again.");
      return new File([blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), { type: blob.type, lastModified: file.lastModified });
    } finally {
      canvas.width = 0;
    }
  }
  const mime = effectiveDmsMime(file.name, file.type);
  if (!mime || (mime !== "application/pdf" && !mime.startsWith("image/"))) {
    throw new Error("Choose a PDF or a JPEG, PNG, WebP, TIFF or HEIC photo.");
  }
  return mime === file.type ? file : new File([file], file.name, { type: mime, lastModified: file.lastModified });
}
