import type { ReactNode } from "react";

type Props =
  | { state: "pending"; children: ReactNode }
  | { state: "failed" | "unconfirmed"; children: ReactNode; retry?: () => void; retryLabel?: string };

export function OperationStatus(props: Props) {
  if (props.state === "pending") {
    return <p role="status" className="text-sm text-muted-foreground">{props.children}</p>;
  }
  return <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
    <span>{props.children}</span>
    {props.retry && <button type="button" className="underline" onClick={props.retry}>{props.retryLabel ?? "Retry"}</button>}
  </div>;
}
