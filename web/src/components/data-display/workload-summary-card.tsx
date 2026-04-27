import { cn } from "@/lib/utils";
import type { CapacitySummary } from "@/types/domain";

export function WorkloadSummaryCard({ label, value, tone }: { label: string; value: number; tone: "neutral" | "amber" | "green" }) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-4 shadow-soft",
        tone === "amber" && "border-amber-200 bg-amber-50",
        tone === "green" && "border-emerald-200 bg-emerald-50",
        tone === "neutral" && "border-border bg-card"
      )}
    >
      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-3 text-3xl font-semibold">{value}</div>
    </div>
  );
}

