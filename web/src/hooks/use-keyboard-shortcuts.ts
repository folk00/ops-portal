"use client";

import { useEffect } from "react";

function isInsideFormField(event: KeyboardEvent) {
  const tag = (event.target as HTMLElement)?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (event.target as HTMLElement)?.isContentEditable;
}

export function useKeyboardShortcuts({
  onCommand,
  onHelp,
}: {
  onCommand: () => void;
  onHelp: () => void;
}) {
  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onCommand();
      }
      if (event.key === "?" && !isInsideFormField(event)) {
        event.preventDefault();
        onHelp();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [onCommand, onHelp]);
}

