"use client";

import { Download, Share, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isRunningStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

const subscribeToBrowser = () => () => undefined;
const getBrowserSnapshot = () => true;
const getServerSnapshot = () => false;

export default function InstallAppButton() {
  const [installPrompt, setInstallPrompt] =
    useState<InstallPromptEvent | null>(null);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const [wasInstalled, setWasInstalled] = useState(false);
  const isBrowser = useSyncExternalStore(
    subscribeToBrowser,
    getBrowserSnapshot,
    getServerSnapshot,
  );
  const isIOS =
    isBrowser && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isInstalled =
    wasInstalled || (isBrowser && isRunningStandalone());

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setWasInstalled(true);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (isInstalled || (!installPrompt && !isIOS)) return null;

  const install = async () => {
    if (!installPrompt) {
      setShowIOSHelp(true);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  };

  return (
    <>
      <button
        aria-label="Install SnapSchool app"
        className="flex size-10 items-center justify-center rounded-full border-2 border-black bg-white transition hover:-translate-y-0.5"
        onClick={() => void install()}
        title="Install SnapSchool"
        type="button"
      >
        <Download className="size-4" />
      </button>

      {showIOSHelp && (
        <div className="fixed inset-x-3 bottom-4 z-[100] mx-auto max-w-sm rounded-[1.5rem] border-2 border-black bg-white p-4 text-left shadow-[6px_6px_0_#111]">
          <button
            aria-label="Close installation instructions"
            className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full border-2 border-black"
            onClick={() => setShowIOSHelp(false)}
            type="button"
          >
            <X className="size-4" />
          </button>
          <p className="pr-10 font-black">Install SnapSchool on iPhone</p>
          <p className="mt-2 text-sm font-medium leading-6 text-zinc-600">
            In Safari, tap <Share className="mx-1 inline size-4" /> Share, then
            choose <strong>Add to Home Screen</strong> and tap Add.
          </p>
        </div>
      )}
    </>
  );
}
