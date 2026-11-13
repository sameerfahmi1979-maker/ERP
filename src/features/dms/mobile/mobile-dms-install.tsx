"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

type InstallPrompt = Event & {
  prompt: () => Promise<unknown>;
};

const standaloneQuery = "(display-mode: standalone)";

function subscribe(listener: () => void) {
  const display = window.matchMedia(standaloneQuery);
  display.addEventListener("change", listener);
  return () => display.removeEventListener("change", listener);
}

function canOfferInstall() {
  return /Android/i.test(navigator.userAgent) && !window.matchMedia(standaloneQuery).matches;
}

export function MobileDmsInstall() {
  const showInstall = useSyncExternalStore(subscribe, canOfferInstall, () => false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (!showInstall) return;
    const onPrompt = (event: Event) => {
      if (typeof (event as Partial<InstallPrompt>).prompt !== "function") return;
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => {
      setPrompt(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [showInstall]);

  async function install() {
    if (!prompt) {
      setShowHelp(value => !value);
      return;
    }
    setPrompt(null);
    setShowHelp(false);
    try {
      await prompt.prompt();
    } catch {
      setShowHelp(true);
    }
  }

  if (!showInstall || installed) return null;
  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" className="min-h-11" onClick={() => void install()}>
        Install on Android
      </Button>
      {showHelp && (
        <p role="status" className="text-sm text-muted-foreground">
          In Chrome, open the three dot menu and choose Add to Home screen, then Install if offered.
        </p>
      )}
    </div>
  );
}
