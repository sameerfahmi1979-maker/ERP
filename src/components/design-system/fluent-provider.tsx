"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { useTheme } from "next-themes";
import { createDOMRenderer, FluentProvider, RendererProvider, renderToStyleElements, SSRProvider, webDarkTheme, webLightTheme } from "@fluentui/react-components";

const subscribe = () => () => {};
const fontFamilyBase = '"Segoe UI", system-ui, -apple-system, sans-serif';
const light = { ...webLightTheme, fontFamilyBase, colorBrandBackground: "#115EA3", colorBrandForeground1: "#115EA3" };
const dark = { ...webDarkTheme, fontFamilyBase };

/** Request-local renderer. Fluent imports stay behind explicit client boundaries. */
export function AlgtFluentProvider({ children }: { children: ReactNode }) {
  const [renderer] = useState(() => createDOMRenderer());
  const inserted = useRef(false);
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  useServerInsertedHTML(() => {
    if (inserted.current) return;
    inserted.current = true;
    return <>{renderToStyleElements(renderer)}</>;
  });
  return <RendererProvider renderer={renderer}><SSRProvider>
    <FluentProvider theme={mounted && resolvedTheme === "dark" ? dark : light} applyStylesToPortals={false} className="algt-fluent-root">
      {children}
    </FluentProvider>
  </SSRProvider></RendererProvider>;
}
