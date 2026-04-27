"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const shortcuts = [
  ["Ctrl/Cmd + K", "Open command launcher"],
  ["?", "Open keyboard help"],
  ["Tracker row click", "Peek task detail without losing grid context"],
  ["Bulk edit", "Apply status, owner, due date, or priority to many rows"],
];

export function HelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard and workflow shortcuts</DialogTitle>
          <DialogDescription>Phase 1 keeps a compact, operations-first flow and leaves room for deeper keyboard command coverage.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 p-5">
          {shortcuts.map(([shortcut, description]) => (
            <div key={shortcut} className="flex items-center justify-between rounded-xl border border-border bg-slate-50 px-4 py-3">
              <span className="font-medium">{shortcut}</span>
              <span className="text-sm text-muted-foreground">{description}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

