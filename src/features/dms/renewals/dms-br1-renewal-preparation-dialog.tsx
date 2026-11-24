import { format, isValid, parseISO } from "date-fns";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";

// Matches the predecessor predicate in migration 20261123075457. Release together.
const BR1_LABOUR_CARD_RENEWAL_DOCUMENT_ID = 127;

export function isBr1RenewalPreparationEnabled(documentId?: number | null) {
  return documentId === BR1_LABOUR_CARD_RENEWAL_DOCUMENT_ID &&
    process.env.NEXT_PUBLIC_DMS_BR1_RENEWAL_PREPARATION_ENABLED === "1";
}

interface DmsBr1RenewalPreparationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentNo?: string;
  recordedExpiry?: string | null;
  renewalNo?: string;
}

export function DmsBr1RenewalPreparationDialog({
  open,
  onOpenChange,
  documentNo,
  recordedExpiry,
  renewalNo,
}: DmsBr1RenewalPreparationDialogProps) {
  const date = recordedExpiry ? parseISO(recordedExpiry) : null;

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={onOpenChange}
      title="Prepare Labour Card Renewal"
      subtitle={documentNo}
      mode="view"
      size="md"
      cancelLabel="Close"
    >
      <div className="space-y-4 text-sm">
        {recordedExpiry !== undefined && (
          <p>
            ERP-recorded predecessor expiry{" "}
            <strong>{date && isValid(date) ? format(date, "dd MMMM yyyy") : "unavailable"}</strong>.
          </p>
        )}
        {renewalNo && <p>Renewal request <strong>{renewalNo}</strong></p>}
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Corroborate the ERP-recorded predecessor expiry from the original or issuer evidence.
            Verify a readable MOHRE original with a strictly later printed expiry. The approved replacement must
            be a Labour Card in ALGT ICAD II for the same employee with the complete matching subject links.
          </li>
          <li>
            After the scoped renewal is authorized, use <strong>Request renewal</strong> on the predecessor
            in Native Mobile DMS or open the existing request under <strong>Document requests</strong>.
            Select <strong>Choose existing evidence</strong> and submit the exact current version of the approved replacement.
          </li>
          <li>
            An assigned officer distinct from the requester and evidence submitter opens the request under{" "}
            <strong>Assigned to me</strong>, checks the submitted original and dates, and selects{" "}
            <strong>fulfil</strong>, followed by <strong>Confirm fulfil</strong>.
          </li>
        </ol>
        <p className="text-muted-foreground">
          Keep the predecessor and its reminder schedule in place during review. After fulfilment,
          verify the replacement and its reminders, and retain the operation receipt.
        </p>
      </div>
    </ERPChildDialogForm>
  );
}
