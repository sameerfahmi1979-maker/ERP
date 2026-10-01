"use client";

import type { ReactNode, ReactElement } from "react";
import { Button, Dialog, DialogBody, DialogContent, DialogSurface, DialogTitle, DialogTrigger } from "@fluentui/react-components";
import { Dismiss20Regular } from "@fluentui/react-icons";

/** Shared settings/switcher dialog; business child forms retain their F04 close guard. */
export function AlgtDialog({ open, onOpenChange, title, trigger, children, actions }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string;
  trigger?: ReactElement; children: ReactNode; actions?: ReactNode;
}) {
  const surface = <DialogSurface className="algt-dialog">
      <DialogBody>
        <DialogTitle action={<Button appearance="subtle" icon={<Dismiss20Regular />} aria-label={`Close ${title}`} onClick={() => onOpenChange(false)} />}>{title}</DialogTitle>
        <DialogContent className="algt-dialog-content">{children}</DialogContent>
        {actions && <div className="algt-dialog-actions">{actions}</div>}
      </DialogBody>
    </DialogSurface>;
  if (!trigger) return <Dialog open={open} onOpenChange={(_, data) => onOpenChange(data.open)}>{surface}</Dialog>;
  return <Dialog open={open} onOpenChange={(_, data) => onOpenChange(data.open)}>
    <DialogTrigger disableButtonEnhancement>{trigger}</DialogTrigger>
    {surface}
  </Dialog>;
}
