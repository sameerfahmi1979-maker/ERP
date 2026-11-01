"use server";
import { compareDocumentSources } from "@/server/ai/document-comparison";
export async function compareSelectedDocuments(input: unknown) { return compareDocumentSources(input); }
