"use client";

import { cn } from "@/lib/utils";
import type { SystemView } from "@/types/domain";

export function SystemViewRail({
  views,
  activeView,
  onSelect,
  orientation = "horizontal",
}: {
  views: SystemView[];
  activeView: string;
  onSelect: (view: string) => void;
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <div className={cn("flex gap-2", orientation === "vertical" ? "flex-col" : "flex-wrap")}>
      {views.map((view) => (
        <button
          key={view.key}
          type="button"
          onClick={() => onSelect(view.key)}
          className={cn(
            "rounded-xl border px-3 py-2 text-left text-sm transition",
            activeView === view.key ? "border-slate-900 bg-slate-950 text-white" : "border-border bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950"
          )}
        >
          <div className="font-medium">{view.label}</div>
          <div className={cn("mt-1 text-xs", activeView === view.key ? "text-slate-300" : "text-muted-foreground")}>{view.description}</div>
        </button>
      ))}
    </div>
  );
}

