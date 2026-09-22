"use client";
import { useSyncExternalStore } from "react";

let currentTime = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();
const tick = () => { currentTime = Date.now(); listeners.forEach(listener => listener()); };
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) { tick(); timer = setInterval(tick, 15_000); }
  return () => { listeners.delete(listener); if (!listeners.size) { clearInterval(timer); timer = undefined; } };
}
/** Clock updates come from an external subscription, never from render. */
export function useClock() { return useSyncExternalStore(subscribe, () => currentTime, () => 0); }
