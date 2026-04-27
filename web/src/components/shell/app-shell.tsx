"use client";

import { useState } from "react";

import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useEventStream } from "@/hooks/use-event-stream";
import { SideNav } from "@/components/shell/side-nav";
import { TopBar } from "@/components/shell/top-bar";
import { CommandLauncher } from "@/components/shell/command-launcher";
import { HelpDialog } from "@/components/shell/help-dialog";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useKeyboardShortcuts({
    onCommand: () => setCommandOpen(true),
    onHelp: () => setHelpOpen(true),
  });

  useEventStream();

  return (
    <>
      <div className="flex min-h-screen">
        <SideNav />
        <div className="min-w-0 flex-1 overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.74),rgba(242,249,252,0.86))]">
          <TopBar onOpenCommand={() => setCommandOpen(true)} onOpenHelp={() => setHelpOpen(true)} />
          <main className="min-w-0 px-1.5 py-3 md:px-2.5 xl:px-3.5">{children}</main>
        </div>
      </div>
      <CommandLauncher open={commandOpen} onOpenChange={setCommandOpen} />
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </>
  );
}
