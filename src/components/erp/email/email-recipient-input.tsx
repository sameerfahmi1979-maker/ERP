/**
 * Email Recipient Input Component
 * Phase 002E.3C - Send Email Dialog UI
 * 
 * Multiline textarea input for email recipients (To/CC/BCC)
 * Supports comma, semicolon, and newline-separated email lists
 * Real-time validation using email-validation helpers
 */

"use client";

import * as React from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { validateEmail, parseEmailList } from "@/lib/email/email-validation";

export type EmailRecipientInputProps = {
  /** Field label (e.g., "To", "CC", "BCC") */
  label: string;
  /** Current value (raw comma-separated email string) */
  value: string;
  /** Callback when value changes */
  onChange: (value: string) => void;
  /** Whether this field is required */
  required?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Validation error message */
  error?: string;
  /** Disabled state */
  disabled?: boolean;
};

/**
 * Email recipient input with validation
 * 
 * Features:
 * - Multiline textarea for multiple emails
 * - Parses comma/semicolon/newline-separated emails
 * - Shows recipient count
 * - Shows validation errors
 * - Required/optional indicator
 * 
 * @example
 * ```tsx
 * <EmailRecipientInput
 *   label="To"
 *   value={to}
 *   onChange={setTo}
 *   required
 *   placeholder="email@example.com, another@example.com"
 *   error={toError}
 * />
 * ```
 */
export function EmailRecipientInput({
  label,
  value,
  onChange,
  required = false,
  placeholder,
  error,
  disabled = false,
}: EmailRecipientInputProps) {
  const [isFocused, setIsFocused] = React.useState(false);

  // Parse emails to show count
  const emails = React.useMemo(() => {
    if (!value || !value.trim()) return [];
    return parseEmailList(value);
  }, [value]);

  // Validate emails
  const invalidEmails = React.useMemo(() => {
    return emails.filter((e) => !validateEmail(e.email));
  }, [emails]);

  // Recipient count text
  const recipientCountText = React.useMemo(() => {
    if (emails.length === 0) return null;
    if (emails.length === 1) return "1 recipient";
    return `${emails.length} recipients`;
  }, [emails.length]);

  // Show validation warning (not error)
  const validationWarning = React.useMemo(() => {
    if (!value || !value.trim()) return null;
    if (invalidEmails.length === 0) return null;
    
    // Only show on blur, not while typing
    if (isFocused) return null;

    if (invalidEmails.length === 1) {
      return `Invalid email: ${invalidEmails[0].email}`;
    }
    return `${invalidEmails.length} invalid emails: ${invalidEmails.map((e) => e.email).join(", ")}`;
  }, [invalidEmails, value, isFocused]);

  // Combined error (external error or validation warning)
  const displayError = error || validationWarning;

  return (
    <div className="space-y-1.5">
      {/* Label */}
      <label htmlFor={`email-recipient-${label.toLowerCase()}`} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>

      {/* Textarea */}
      <Textarea
        id={`email-recipient-${label.toLowerCase()}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder || "email@example.com, another@example.com"}
        disabled={disabled}
        aria-invalid={!!displayError}
        aria-describedby={
          displayError
            ? `email-recipient-${label.toLowerCase()}-error`
            : recipientCountText
            ? `email-recipient-${label.toLowerCase()}-count`
            : undefined
        }
        className={cn(
          "min-h-[80px] resize-y",
          displayError && "border-destructive focus-visible:border-destructive"
        )}
      />

      {/* Helper text / Recipient count / Error */}
      <div className="flex items-start justify-between gap-2 min-h-[20px]">
        {/* Left side: Recipient count or helper text */}
        <div className="flex-1">
          {!displayError && recipientCountText && (
            <p
              id={`email-recipient-${label.toLowerCase()}-count`}
              className="text-xs text-muted-foreground"
            >
              {recipientCountText}
            </p>
          )}
          
          {displayError && (
            <p
              id={`email-recipient-${label.toLowerCase()}-error`}
              className="text-xs text-destructive"
            >
              {displayError}
            </p>
          )}
        </div>

        {/* Right side: Helper text (always visible) */}
        {!displayError && (
          <p className="text-xs text-muted-foreground text-right shrink-0">
            Separate with comma, semicolon, or new line
          </p>
        )}
      </div>
    </div>
  );
}
