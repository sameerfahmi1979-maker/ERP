"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Users, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { getUsersForEmailSelect } from "@/server/actions/lookups/users-for-email";
import { sendExportEmail } from "@/server/actions/email";
import {
  generatePDFAttachment,
  generateExcelAttachment,
  generateCSVAttachment,
} from "@/lib/export";
import type { DmsExpiringDocumentRow } from "@/server/actions/dms/expiry-reminders";
import type { ERPExportColumn } from "@/lib/export";

const EXPIRY_EXPORT_COLUMNS: ERPExportColumn<DmsExpiringDocumentRow>[] = [
  { key: "document_no", header: "Doc No", width: 14 },
  { key: "title", header: "Title", width: 30 },
  { key: "document_type", header: "Type", width: 20 },
  { key: "category", header: "Category", width: 18 },
  { key: "expiry_date", header: "Expiry Date", width: 14 },
  { key: "days_remaining", header: "Days Remaining", width: 14 },
  { key: "status", header: "Status", width: 12 },
];

type AttachmentFormat = "pdf" | "excel" | "csv" | "none";

export interface DmsExpiryEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docs: DmsExpiringDocumentRow[];
  tabTitle: string;
}

type RecipientChip = { label: string; email: string };

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function DmsExpiryEmailDialog({
  open,
  onOpenChange,
  docs,
  tabTitle,
}: DmsExpiryEmailDialogProps) {
  const [recipients, setRecipients] = useState<RecipientChip[]>([]);
  const [rawEmailInput, setRawEmailInput] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachmentFormat, setAttachmentFormat] = useState<AttachmentFormat>("pdf");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Employee search combobox
  const [searchQuery, setSearchQuery] = useState("");
  const [userOptions, setUserOptions] = useState<{ value: string | number; label: string; email?: string }[]>([]);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on open; then trigger an initial user load for the empty query
  useEffect(() => {
    if (open) {
      setRecipients([]);
      setRawEmailInput("");
      setSubject(`${tabTitle} — ${format(new Date(), "dd MMM yyyy")}`);
      setBody(`Please find attached the ${tabTitle} document list.\n\nTotal records: ${docs.length}\nGenerated: ${format(new Date(), "dd MMM yyyy HH:mm")}`);
      setAttachmentFormat("pdf");
      setSearchQuery("");
      // Pre-load users list immediately (without waiting for the user to type)
      getUsersForEmailSelect("").then((results) => {
        setUserOptions(
          results.map((u) => ({ value: u.email, label: `${u.label} (${u.email})`, email: u.email }))
        );
      });
    }
  }, [open, tabTitle, docs.length]);

  // Re-search when user types in the combobox
  useEffect(() => {
    if (!open) return;
    if (searchQuery === "") return; // handled by the open effect above
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      const results = await getUsersForEmailSelect(searchQuery);
      setUserOptions(
        results.map((u) => ({ value: u.email, label: `${u.label} (${u.email})`, email: u.email }))
      );
    }, 250);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchQuery, open]);

  const addRecipient = useCallback((chip: RecipientChip) => {
    setRecipients((prev) => {
      if (prev.some((r) => r.email.toLowerCase() === chip.email.toLowerCase())) return prev;
      return [...prev, chip];
    });
  }, []);

  const removeRecipient = useCallback((email: string) => {
    setRecipients((prev) => prev.filter((r) => r.email !== email));
  }, []);

  const handleSelectUser = useCallback((value: string | number | null) => {
    if (!value) return;
    const email = value as string;
    const opt = userOptions.find((o) => o.value === value);
    addRecipient({ label: opt?.label ?? email, email });
    setSearchQuery("");
  }, [userOptions, addRecipient]);

  /** Try to commit whatever is currently in the raw email input as a chip */
  const flushRawEmail = useCallback((): boolean => {
    const email = rawEmailInput.trim().replace(/[,;]+$/, "");
    if (!email) return true; // nothing to flush — OK
    if (!validateEmail(email)) {
      toast.error(`Invalid email address: ${email}`);
      return false;
    }
    addRecipient({ label: email, email });
    setRawEmailInput("");
    return true;
  }, [rawEmailInput, addRecipient]);

  const handleRawEmailKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === "," || e.key === ";") {
        e.preventDefault();
        flushRawEmail();
      }
    },
    [flushRawEmail]
  );

  const handleRawEmailBlur = useCallback(() => {
    if (rawEmailInput.trim()) flushRawEmail();
  }, [rawEmailInput, flushRawEmail]);

  const handleSubmit = useCallback(async () => {
    // Build final recipients list — include any email typed but not yet chip-ified
    let finalRecipients = [...recipients];
    const rawEmail = rawEmailInput.trim().replace(/[,;]+$/, "");
    if (rawEmail) {
      if (!validateEmail(rawEmail)) {
        toast.error(`Invalid email address: ${rawEmail}`);
        return;
      }
      if (!finalRecipients.some((r) => r.email.toLowerCase() === rawEmail.toLowerCase())) {
        finalRecipients = [...finalRecipients, { label: rawEmail, email: rawEmail }];
        // Also commit visually so the chip appears
        addRecipient({ label: rawEmail, email: rawEmail });
        setRawEmailInput("");
      }
    }

    if (finalRecipients.length === 0) {
      toast.error("Add at least one recipient");
      return;
    }
    if (!subject.trim()) {
      toast.error("Subject is required");
      return;
    }
    if (docs.length === 0) {
      toast.error("No documents to send — the list is empty");
      return;
    }

    setIsSubmitting(true);
    try {
      const toEmails = finalRecipients.map((r) => r.email);
      const exportOptions = {
        title: tabTitle,
        filename: tabTitle.toLowerCase().replace(/\s+/g, "-"),
        columns: EXPIRY_EXPORT_COLUMNS,
        data: docs,
        generatedAt: new Date(),
      };

      let attachment;
      if (attachmentFormat === "pdf") {
        attachment = generatePDFAttachment(exportOptions);
      } else if (attachmentFormat === "excel") {
        attachment = await generateExcelAttachment(exportOptions);
      } else if (attachmentFormat === "csv") {
        attachment = generateCSVAttachment(exportOptions);
      }

      if (!attachment && attachmentFormat !== "none") {
        toast.error("Failed to generate attachment");
        return;
      }

      const result = await sendExportEmail({
        to: toEmails,
        subject: subject.trim(),
        body: body.trim() || `Please find the ${tabTitle} list attached.`,
        ...(attachment ? { attachment } : {}),
        context: { moduleCode: "DMS", recordCount: docs.length, exportMode: "filtered" },
      } as Parameters<typeof sendExportEmail>[0]);

      if (result.success) {
        toast.success(`Email sent to ${toEmails.length} recipient${toEmails.length !== 1 ? "s" : ""}`);
        onOpenChange(false);
      } else {
        toast.error(result.error ?? "Failed to send email");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setIsSubmitting(false);
    }
  }, [recipients, rawEmailInput, subject, body, docs, attachmentFormat, tabTitle, onOpenChange, addRecipient]);

  const FORMAT_OPTIONS: { value: AttachmentFormat; label: string }[] = [
    { value: "pdf", label: "PDF" },
    { value: "excel", label: "Excel" },
    { value: "csv", label: "CSV" },
    { value: "none", label: "No Attachment" },
  ];

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={onOpenChange}
      title="Send Document List by Email"
      subtitle={`${tabTitle} — ${docs.length} document${docs.length !== 1 ? "s" : ""}`}
      icon={<Mail className="h-5 w-5" />}
      mode="add"
      size="lg"
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      submitLabel="Send Email"
    >
      <div className="grid grid-cols-12 gap-4">
        {/* Recipient search */}
        <div className="col-span-12">
          <label className="text-sm font-medium block mb-1.5">
            <Users className="inline h-3.5 w-3.5 mr-1" />
            Search Recipients (employees / users)
          </label>
          <ERPCombobox
            value={null}
            onValueChange={handleSelectUser}
            options={userOptions}
            placeholder="Type name or email to search…"
            onSearchQueryChange={setSearchQuery}
            filterFn={() => true}
          />
        </div>

        {/* Free-text email input */}
        <div className="col-span-12">
          <label className="text-sm font-medium block mb-1.5">
            Or type email address <span className="text-muted-foreground font-normal text-xs">(press Enter, comma, or click away to add)</span>
          </label>
          <Input
            value={rawEmailInput}
            onChange={(e) => setRawEmailInput(e.target.value)}
            onKeyDown={handleRawEmailKeyDown}
            onBlur={handleRawEmailBlur}
            placeholder="someone@example.com"
            className="h-9"
          />
        </div>

        {/* Recipient chips */}
        {recipients.length > 0 && (
          <div className="col-span-12">
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              Recipients ({recipients.length})
            </label>
            <div className="flex flex-wrap gap-1.5 p-2.5 rounded-md border border-input min-h-[40px]">
              {recipients.map((r) => (
                <Badge key={r.email} variant="secondary" className="gap-1 pl-2 pr-1">
                  <span className="text-xs">{r.label !== r.email ? `${r.label}` : r.email}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="h-4 w-4 ml-0.5 hover:bg-destructive/20 rounded-full"
                    onClick={() => removeRecipient(r.email)}
                  >
                    <X className="h-2.5 w-2.5" />
                  </Button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Subject */}
        <div className="col-span-12">
          <label className="text-sm font-medium block mb-1.5">
            Subject <span className="text-destructive">*</span>
          </label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject"
            className="h-9"
          />
        </div>

        {/* Message */}
        <div className="col-span-12">
          <label className="text-sm font-medium block mb-1.5">Message</label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Optional message body…"
            rows={4}
            className="resize-y min-h-[90px]"
          />
        </div>

        {/* Attachment format */}
        <div className="col-span-12">
          <label className="text-sm font-medium block mb-2">Attachment Format</label>
          <div className="flex gap-2 flex-wrap">
            {FORMAT_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm ${
                  attachmentFormat === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-input hover:bg-muted/50"
                }`}
              >
                <input
                  type="radio"
                  name="attachment-format"
                  value={opt.value}
                  checked={attachmentFormat === opt.value}
                  onChange={() => setAttachmentFormat(opt.value)}
                  className="h-4 w-4"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* Info row */}
        <div className="col-span-12 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
          {isSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
          {attachmentFormat !== "none"
            ? `The current filtered list of ${docs.length} document${docs.length !== 1 ? "s" : ""} will be attached as ${attachmentFormat.toUpperCase()}.`
            : `Email will be sent with no attachment. ${docs.length} document${docs.length !== 1 ? "s" : ""} in current view.`}
        </div>
      </div>
    </ERPChildDialogForm>
  );
}
