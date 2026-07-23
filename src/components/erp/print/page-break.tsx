/** PageBreak / AvoidPageBreak — explicit page-break helpers */
import React from "react";
export function PageBreak() { return <div className="page-break-before" style={{ height: 0, visibility: "hidden" }} aria-hidden="true" />; }
export function AvoidPageBreak({ children }: { children: React.ReactNode }) { return <div className="avoid-page-break">{children}</div>; }
