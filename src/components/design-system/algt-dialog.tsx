"use client";

import { useCallback, useRef, type ReactNode, type ReactElement } from "react";
import { Button, Dialog, DialogBody, DialogContent, DialogSurface, DialogTitle, DialogTrigger, type DialogProps } from "@fluentui/react-components";
import { Dismiss20Regular } from "@fluentui/react-icons";

/** Shared settings/switcher dialog; business child forms retain their F04 close guard. */
export function AlgtDialog({ open, onOpenChange, title, trigger, children, actions }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string;
  trigger?: ReactElement; children: ReactNode; actions?: ReactNode;
}) {
  const opener = useRef<HTMLElement | null>(null);
  const handleOpenChange: DialogProps["onOpenChange"] = (event, data) => {
    if (data.open && data.type === "triggerClick" && event.currentTarget instanceof HTMLElement) {
      opener.current = event.currentTarget;
    }
    onOpenChange(data.open);
  };
  const surfaceRef = useCallback((surface: HTMLDivElement | null) => {
    if (surface) return;
    // Firefox can leave focus on body after a pointer interaction inside the
    // modal. Restore only lost focus, after Fluent has removed its focus trap;
    // never override a deliberate destination or focus a detached/hidden opener.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const target = opener.current;
      if (target?.isConnected && target.ownerDocument.activeElement === target.ownerDocument.body &&
          !target.closest('[inert], [hidden]') && !target.matches(':disabled') && target.getClientRects().length) {
        target.focus({ preventScroll: true });
      }
    }));
  }, []);
  const surface = <DialogSurface ref={surfaceRef} className="algt-dialog">
      <DialogBody>
        <DialogTitle action={<Button appearance="subtle" icon={<Dismiss20Regular />} aria-label={`Close ${title}`} onClick={() => onOpenChange(false)} />}>{title}</DialogTitle>
        <DialogContent className="algt-dialog-content">{children}</DialogContent>
        {actions && <div className="algt-dialog-actions">{actions}</div>}
      </DialogBody>
    </DialogSurface>;
  if (!trigger) return <Dialog open={open} onOpenChange={(_, data) => onOpenChange(data.open)}>{surface}</Dialog>;
  return <Dialog open={open} onOpenChange={handleOpenChange}>
    <DialogTrigger disableButtonEnhancement>{trigger}</DialogTrigger>
    {surface}
  </Dialog>;
}
