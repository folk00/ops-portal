"use client";

import { format } from "date-fns";
import { HelpCircle, Search } from "lucide-react";

import { Button } from "@/components/ui/button";

export function TopBar({
  onOpenCommand,
  onOpenHelp,
}: {
  onOpenCommand: () => void;
  onOpenHelp: () => void;
}) {
  const now = new Date();

  return (
    <div className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[#c5dde7] bg-[linear-gradient(180deg,rgba(250,254,255,0.96),rgba(242,249,252,0.92))] px-4 py-3 backdrop-blur md:px-5 xl:px-6">
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-[0.24em] text-[#0f7586]">Operations surface</div>
        <div className="text-sm text-foreground">Spreadsheet speed with relational traceability</div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={onOpenCommand}>
          <Search className="h-4 w-4" />
          Command
          <span className="rounded-md border border-border bg-slate-50 px-2 py-0.5 text-xs text-muted-foreground">Ctrl K</span>
        </Button>
        <Button variant="ghost" size="icon" onClick={onOpenHelp}>
          <HelpCircle className="h-4 w-4" />
        </Button>
        <div className="hidden rounded-2xl border border-[#b9d7e3] bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(236,248,252,0.98))] px-4 py-2 shadow-sm lg:flex lg:items-center">
          <span className="text-sm font-semibold text-slate-700">Ops Portal</span>
        </div>
        <div className="rounded-xl border border-[#cfe1e6] bg-white px-3 py-2 text-xs text-muted-foreground">
          {format(now, "EEE, MMM d")} {" | "} {format(now, "HH:mm")}
        </div>
      </div>
    </div>
  );
}
